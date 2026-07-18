import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.READANY_DATA_DIR || "./data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "readany.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    cover_url TEXT,
    format TEXT NOT NULL DEFAULT 'epub',
    file_size INTEGER,
    file_path TEXT,
    file_hash TEXT,
    progress REAL DEFAULT 0,
    last_read_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    cfi TEXT,
    chapter_index INTEGER,
    label TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reading_sessions (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_seconds INTEGER DEFAULT 0,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_book ON reading_sessions(book_id);
`);

export default db;
