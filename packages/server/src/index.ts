import express from "express";
import cors from "cors";
import compression from "compression";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import db from "./db.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Storage path — point to rclone OneDrive mount or any directory
const STORAGE_DIR = process.env.READANY_STORAGE_DIR || "./storage";
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

const DATA_DIR = process.env.READANY_DATA_DIR || "./data";

// ==================== AUTO-SCAN BOOKS ====================

const SUPPORTED_FORMATS = [".epub", ".pdf", ".mobi", ".txt", ".fb2", ".cbz"];

function scanAndSyncBooks() {
  try {
    const files = fs.readdirSync(STORAGE_DIR);
    const existingBooks = db.prepare("SELECT file_path FROM books").all() as { file_path: string }[];
    const existingPaths = new Set(existingBooks.map(b => b.file_path));
    
    let added = 0;
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!SUPPORTED_FORMATS.includes(ext)) continue;
      if (existingPaths.has(file)) continue;
      
      const filePath = path.join(STORAGE_DIR, file);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      
      // Extract title from filename (remove extension)
      const title = path.basename(file, ext);
      const id = crypto.randomUUID();
      const format = ext.slice(1); // remove dot
      
      // Check for cover image
      const coverName = path.basename(file, ext) + ".jpg";
      const coverPath = path.join(STORAGE_DIR, "covers", coverName);
      const coverUrl = fs.existsSync(coverPath) ? `covers/${coverName}` : null;
      
      db.prepare(`INSERT INTO books (id, title, author, cover_url, format, file_path, file_size, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
        .run(id, title, "", coverUrl, format, file, stat.size, Date.now(), Date.now());
      
      console.log(`[Scanner] Added book: ${title} (${format}, ${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
      added++;
    }
    
    if (added > 0) {
      console.log(`[Scanner] Added ${added} new book(s)`);
    }
  } catch (err) {
    console.error("[Scanner] Error scanning books:", err);
  }
}

// Scan on startup
scanAndSyncBooks();

// Watch for changes (debounced)
let scanTimeout: ReturnType<typeof setTimeout> | null = null;
try {
  fs.watch(STORAGE_DIR, { recursive: false }, (eventType, filename) => {
    if (!filename) return;
    const ext = path.extname(filename).toLowerCase();
    if (!SUPPORTED_FORMATS.includes(ext)) return;
    
    // Debounce: wait 2 seconds after last change
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      console.log(`[Scanner] File change detected: ${filename}, scanning...`);
      scanAndSyncBooks();
    }, 2000);
  });
  console.log(`[Scanner] Watching ${STORAGE_DIR} for new books`);
} catch (err) {
  console.warn("[Scanner] Could not watch directory:", err);
}

const BOOK_MIME_TYPES: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  mobi: "application/x-mobipocket-ebook",
  azw: "application/vnd.amazon.ebook",
  azw3: "application/vnd.amazon.ebook",
  cbz: "application/vnd.comicbook+zip",
  fb2: "application/x-fictionbook+xml",
  txt: "text/plain; charset=utf-8",
};

// CORS: restrict to same origin (Caddy proxy)
app.use(cors({ origin: true }));
app.use(compression({
  threshold: 1024, // Only compress responses larger than 1KB
  level: 6, // Balanced compression level
}));
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use((err: any, _req: any, res: any, next: any) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next(err);
});

// Serve frontend static files (built with vite)
const DIST_DIR = process.env.READANY_DIST_DIR || path.resolve("../app/dist");
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, {
    maxAge: '1d', // Cache static assets for 1 day
    etag: true,
    lastModified: true,
  }));
}

// ==================== SECURITY HELPERS ====================

/** Resolve a path safely within a root directory — blocks path traversal */
function safePath(root: string, ...segments: string[]): string | null {
  const resolved = path.resolve(root, ...segments);
  if (!resolved.startsWith(path.resolve(root))) return null; // traversal blocked
  return resolved;
}

// ==================== BOOKS (read-only) ====================

// List all books
app.get("/api/books", (_req, res) => {
  const books = db.prepare("SELECT * FROM books ORDER BY updated_at DESC").all();
  res.setHeader("Cache-Control", "public, max-age=30"); // Cache for 30 seconds
  res.json(books);
});

// Get single book
app.get("/api/books/:id", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);
  if (!book) return res.status(404).json({ error: "not found" });
  res.json(book);
});

// Update reading progress
app.patch("/api/books/:id/progress", (req, res) => {
  const { progress, currentCfi } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (progress !== undefined) { updates.push("progress = ?"); values.push(progress); }
  if (currentCfi !== undefined) {
    // Validate CFI format or limit length to prevent XSS
    const cfiStr = String(currentCfi).slice(0, 500);
    updates.push("currentCfi = ?"); values.push(cfiStr);
  }
  updates.push("updated_at = ?");
  values.push(Date.now());
  values.push(req.params.id);

  db.prepare(`UPDATE books SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// Serve book file (for reader only - no download)
app.get("/api/books/:id/file", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id) as any;
  if (!book) return res.status(404).json({ error: "not found" });

  const fullPath = safePath(STORAGE_DIR, book.file_path);
  if (!fullPath || !fs.existsSync(fullPath)) return res.status(404).json({ error: "file missing" });

  const mime = BOOK_MIME_TYPES[book.format] || "application/octet-stream";
  
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, no-store");
  
  const stream = fs.createReadStream(fullPath);
  stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: "read error" }); });
  stream.pipe(res);
});

// ==================== BOOKMARKS ====================

app.get("/api/books/:id/bookmarks", (req, res) => {
  const rows = db.prepare("SELECT * FROM bookmarks WHERE book_id = ? ORDER BY created_at DESC").all(req.params.id);
  res.json(rows);
});

app.post("/api/books/:id/bookmarks", (req, res) => {
  const id = crypto.randomUUID();
  const { cfi, chapter_index, label } = req.body;
  db.prepare("INSERT INTO bookmarks (id, book_id, cfi, chapter_index, label, created_at) VALUES (?,?,?,?,?,?)")
    .run(id, req.params.id, cfi || null, chapter_index ?? null, label || null, Date.now());
  res.json(db.prepare("SELECT * FROM bookmarks WHERE id = ?").get(id));
});

app.delete("/api/bookmarks/:id", (req, res) => {
  db.prepare("DELETE FROM bookmarks WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ==================== READING SESSIONS ====================

app.post("/api/books/:id/sessions", (req, res) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare("INSERT INTO reading_sessions (id, book_id, started_at) VALUES (?,?,?)")
    .run(id, req.params.id, now);
  db.prepare("UPDATE books SET last_read_at = ?, updated_at = ? WHERE id = ?").run(now, now, req.params.id);
  res.json({ id, book_id: req.params.id, started_at: now });
});

app.patch("/api/sessions/:id", (req, res) => {
  const { ended_at, duration_seconds } = req.body;
  db.prepare("UPDATE reading_sessions SET ended_at = ?, duration_seconds = ? WHERE id = ?")
    .run(ended_at || Date.now(), duration_seconds || 0, req.params.id);
  res.json({ ok: true });
});

// ==================== FILE SYSTEM (safe paths only) ====================

app.get("/api/files/exists", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.json(false);
  const basename = path.basename(filePath);
  const cleanPath = filePath.replace(/^\/data\//, "");
  
  // Check data dir
  const dp = safePath(DATA_DIR, basename);
  if (dp && fs.existsSync(dp)) return res.json(true);
  // Check storage dir
  const sp1 = safePath(STORAGE_DIR, cleanPath);
  if (sp1 && fs.existsSync(sp1)) return res.json(true);
  const sp2 = safePath(STORAGE_DIR, basename);
  if (sp2 && fs.existsSync(sp2)) return res.json(true);
  
  res.json(false);
});

app.get("/api/files/read", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: "missing path" });
  const basename = path.basename(filePath);
  const cleanPath = filePath.replace(/^\/data\//, "");
  
  const dp = safePath(DATA_DIR, basename);
  if (dp && fs.existsSync(dp)) return res.sendFile(dp);
  
  for (const trySeg of [cleanPath, basename]) {
    const sp = safePath(STORAGE_DIR, trySeg);
    if (sp && fs.existsSync(sp)) return res.sendFile(sp);
  }
  res.status(404).json({ error: "not found" });
});

// Serve book file by path (for reader)
app.get("/api/files/book", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: "missing path" });
  const basename = path.basename(filePath);
  const cleanPath = filePath.replace(/^\/data\//, "");
  
  for (const trySeg of [cleanPath, basename]) {
    const sp = safePath(STORAGE_DIR, trySeg);
    if (sp && fs.existsSync(sp)) {
      const ext = path.extname(sp).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".epub": "application/epub+zip",
        ".pdf": "application/pdf",
        ".mobi": "application/x-mobipocket-ebook",
        ".txt": "text/plain; charset=utf-8",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", "inline");
      return fs.createReadStream(sp).pipe(res);
    }
  }
  res.status(404).json({ error: "not found" });
});

// Serve cover images
app.get("/api/covers/:filename", (req, res) => {
  const coverPath = safePath(STORAGE_DIR, "covers", req.params.filename);
  if (!coverPath || !fs.existsSync(coverPath)) return res.status(404).json({ error: "not found" });
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable"); // 7 days cache
  res.setHeader("ETag", `"${path.basename(coverPath)}"`);
  const stream = fs.createReadStream(coverPath);
  stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: "read error" }); });
  stream.pipe(res);
});

// ==================== SPA FALLBACK ====================

if (fs.existsSync(DIST_DIR)) {
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

// ==================== START ====================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ReadAny server running on http://0.0.0.0:${PORT}`);
  console.log(`Storage: ${STORAGE_DIR}`);
  console.log(`Database: ${path.resolve(DATA_DIR, "readany.db")}`);
  console.log(`Frontend: ${DIST_DIR}`);
});
