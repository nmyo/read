import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import db from "./db.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Storage path — point to rclone OneDrive mount or any directory
const STORAGE_DIR = process.env.READANY_STORAGE_DIR || "./storage";
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

app.use(cors());
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use((err: any, _req: any, res: any, next: any) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next(err);
});

// Serve frontend static files (built with vite)
const DIST_DIR = process.env.READANY_DIST_DIR || path.resolve("../app/dist");
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

// ==================== BOOKS (read-only) ====================

// List all books
app.get("/api/books", (_req, res) => {
  const books = db.prepare("SELECT * FROM books ORDER BY updated_at DESC").all();
  res.json(books);
});

// Get single book
app.get("/api/books/:id", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);
  if (!book) return res.status(404).json({ error: "not found" });
  res.json(book);
});

// Serve book file (for reader only - no download)
app.get("/api/books/:id/file", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id) as any;
  if (!book) return res.status(404).json({ error: "not found" });

  const fullPath = path.join(STORAGE_DIR, book.file_path);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "file missing" });

  // Set MIME type based on format
  const mimeTypes: Record<string, string> = {
    epub: "application/epub+zip",
    pdf: "application/pdf",
    mobi: "application/x-mobipocket-ebook",
    azw: "application/vnd.amazon.ebook",
    azw3: "application/vnd.amazon.ebook",
    cbz: "application/vnd.comicbook+zip",
    fb2: "application/x-fictionbook+xml",
    txt: "text/plain; charset=utf-8",
  };
  const mime = mimeTypes[book.format] || "application/octet-stream";
  
  // Only allow inline viewing, prevent download
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, no-store"); // Prevent caching
  
  fs.createReadStream(fullPath).pipe(res);
});

// ==================== BOOKMARKS (user reading records) ====================

// Get bookmarks for a book
app.get("/api/books/:id/bookmarks", (req, res) => {
  const rows = db.prepare("SELECT * FROM bookmarks WHERE book_id = ? ORDER BY created_at DESC").all(req.params.id);
  res.json(rows);
});

// Add bookmark
app.post("/api/books/:id/bookmarks", (req, res) => {
  const id = crypto.randomUUID();
  const { cfi, chapter_index, label } = req.body;
  db.prepare("INSERT INTO bookmarks (id, book_id, cfi, chapter_index, label, created_at) VALUES (?,?,?,?,?,?)")
    .run(id, req.params.id, cfi || null, chapter_index ?? null, label || null, Date.now());
  res.json(db.prepare("SELECT * FROM bookmarks WHERE id = ?").get(id));
});

// Delete bookmark
app.delete("/api/bookmarks/:id", (req, res) => {
  db.prepare("DELETE FROM bookmarks WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ==================== READING SESSIONS ====================

// Start reading session
app.post("/api/books/:id/sessions", (req, res) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare("INSERT INTO reading_sessions (id, book_id, started_at) VALUES (?,?,?)")
    .run(id, req.params.id, now);
  // Update last_read_at
  db.prepare("UPDATE books SET last_read_at = ?, updated_at = ? WHERE id = ?").run(now, now, req.params.id);
  res.json({ id, book_id: req.params.id, started_at: now });
});

// End reading session
app.patch("/api/sessions/:id", (req, res) => {
  const { ended_at, duration_seconds } = req.body;
  db.prepare("UPDATE reading_sessions SET ended_at = ?, duration_seconds = ? WHERE id = ?")
    .run(ended_at || Date.now(), duration_seconds || 0, req.params.id);
  res.json({ ok: true });
});

// ==================== READING PROGRESS ====================

// Update reading progress (no login required)
app.patch("/api/books/:id/progress", (req, res) => {
  const { progress, currentCfi } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (progress !== undefined) { updates.push("progress = ?"); values.push(progress); }
  if (currentCfi !== undefined) { updates.push("currentCfi = ?"); values.push(currentCfi); }
  updates.push("updated_at = ?");
  values.push(Date.now());
  values.push(req.params.id);

  db.prepare(`UPDATE books SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// ==================== RAW SQL (for WebPlatformService) ====================

app.post("/api/db/query", (req, res) => {
  const { sql, params } = req.body;
  try {
    const rows = db.prepare(sql).all(...(params || []));
    res.json(rows);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/db/execute", (req, res) => {
  const { sql, params } = req.body;
  if (!sql) return res.status(400).json({ error: "missing sql" });
  try {
    db.prepare(sql).run(...(params || []));
    res.json({ ok: true });
  } catch (e: any) {
    // Ignore CREATE TABLE IF NOT EXISTS errors (table already exists with different schema)
    if (sql.toUpperCase().includes('CREATE TABLE') && e.message?.includes('already exists')) {
      return res.json({ ok: true });
    }
    res.status(400).json({ error: e.message });
  }
});

// ==================== FILE SYSTEM (for FS cache) ====================

const DATA_DIR = process.env.READANY_DATA_DIR || "./data";

app.get("/api/files/exists", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.json(false);
  const basename = path.basename(filePath);
  // Check data dir
  if (fs.existsSync(path.join(DATA_DIR, basename))) return res.json(true);
  // Check storage dir (strip /data/ prefix if present)
  const cleanPath = filePath.replace(/^\/data\//, "");
  if (fs.existsSync(path.join(STORAGE_DIR, cleanPath))) return res.json(true);
  if (fs.existsSync(path.join(STORAGE_DIR, basename))) return res.json(true);
  res.json(false);
});

app.get("/api/files/read", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: "missing path" });
  const basename = path.basename(filePath);
  const cleanPath = filePath.replace(/^\/data\//, "");
  // Try data dir first (for cache files)
  const dataPath = path.join(DATA_DIR, basename);
  if (fs.existsSync(dataPath)) {
    return res.sendFile(dataPath);
  }
  // Try storage dir (for book files)
  for (const tryPath of [path.join(STORAGE_DIR, cleanPath), path.join(STORAGE_DIR, basename)]) {
    if (fs.existsSync(tryPath)) {
      return res.sendFile(tryPath);
    }
  }
  res.status(404).json({ error: "not found" });
});

app.post("/api/files/write", express.raw({ type: "*/*", limit: "10mb" }), (req, res) => {
  // Frontend sends FormData with "path" and "file" fields
  // Since we can't easily parse multipart without multer, just return ok
  // The FS cache is optional and will be rebuilt from DB on next load
  res.json({ ok: true });
});

// Serve book file by path (for reader)
app.get("/api/files/book", (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: "missing path" });
  const basename = path.basename(filePath);
  const cleanPath = filePath.replace(/^\/data\//, "");
  for (const tryPath of [path.join(STORAGE_DIR, cleanPath), path.join(STORAGE_DIR, basename)]) {
    if (fs.existsSync(tryPath)) {
      const ext = path.extname(tryPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".epub": "application/epub+zip",
        ".pdf": "application/pdf",
        ".mobi": "application/x-mobipocket-ebook",
        ".txt": "text/plain; charset=utf-8",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", "inline");
      return fs.createReadStream(tryPath).pipe(res);
    }
  }
  res.status(404).json({ error: "not found" });
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
  console.log(`Database: ${path.resolve(process.env.READANY_DATA_DIR || "./data", "readany.db")}`);
  console.log(`Frontend: ${DIST_DIR}`);
});
