import express from "express";
import cors from "cors";
import multer from "multer";
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
app.use(express.json());

// Serve frontend static files (built with vite)
const DIST_DIR = process.env.READANY_DIST_DIR || path.resolve("../app/dist");
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

// --- File upload (multer) ---
const upload = multer({
  storage: multer.diskStorage({
    destination: STORAGE_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".epub", ".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// ==================== BOOKS ====================

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

// Upload book
app.post("/api/books/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });

  const id = crypto.randomUUID();
  const ext = path.extname(req.file.originalname).toLowerCase().slice(1);
  const now = Date.now();

  db.prepare(`
    INSERT INTO books (id, title, author, format, file_size, file_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname)),
    req.body.author || null,
    ext,
    req.file.size,
    req.file.filename,
    now,
    now,
  );

  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  res.json(book);
});

// Update book metadata (title, author, progress, cover)
app.patch("/api/books/:id", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);
  if (!book) return res.status(404).json({ error: "not found" });

  const { title, author, progress, cover_url } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { updates.push("title = ?"); values.push(title); }
  if (author !== undefined) { updates.push("author = ?"); values.push(author); }
  if (progress !== undefined) { updates.push("progress = ?"); values.push(progress); }
  if (cover_url !== undefined) { updates.push("cover_url = ?"); values.push(cover_url); }

  if (updates.length > 0) {
    updates.push("updated_at = ?");
    values.push(Date.now());
    values.push(req.params.id);
    db.prepare(`UPDATE books SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  res.json(db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id));
});

// Delete book (file + metadata)
app.delete("/api/books/:id", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id) as any;
  if (!book) return res.status(404).json({ error: "not found" });

  // Delete file from storage
  if (book.file_path) {
    const fullPath = path.join(STORAGE_DIR, book.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  db.prepare("DELETE FROM books WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// Serve book file (for reader)
app.get("/api/books/:id/file", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id) as any;
  if (!book) return res.status(404).json({ error: "not found" });

  const fullPath = path.join(STORAGE_DIR, book.file_path);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "file missing" });

  const mime = book.format === "pdf" ? "application/pdf" : "application/epub+zip";
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(book.title)}.${book.format}"`);
  fs.createReadStream(fullPath).pipe(res);
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
  // Update last_read_at
  db.prepare("UPDATE books SET last_read_at = ?, updated_at = ? WHERE id = ?").run(now, now, req.params.id);
  res.json({ id, book_id: req.params.id, started_at: now });
});

app.patch("/api/sessions/:id", (req, res) => {
  const { ended_at, duration_seconds } = req.body;
  db.prepare("UPDATE reading_sessions SET ended_at = ?, duration_seconds = ? WHERE id = ?")
    .run(ended_at || Date.now(), duration_seconds || 0, req.params.id);
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
  try {
    db.prepare(sql).run(...(params || []));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
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
