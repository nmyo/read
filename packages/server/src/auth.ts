/**
 * Authentication API routes
 */
import { Router } from "express";
import crypto from "node:crypto";
import db from "./db.js";

const router = Router();

// Simple password hashing (use bcrypt in production)
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

// Middleware to get current user from session
export function getCurrentUser(req: any): { id: string; username: string } | null {
  const sessionId = req.cookies?.session_id;
  if (!sessionId) return null;

  const session = db.prepare(
    "SELECT user_id, expires_at FROM user_sessions WHERE id = ?"
  ).get(sessionId) as any;

  if (!session || session.expires_at < Date.now()) {
    return null;
  }

  const user = db.prepare(
    "SELECT id, username FROM users WHERE id = ?"
  ).get(session.user_id) as any;

  return user || null;
}

// Register
router.post("/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "用户名和密码不能为空" });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: "用户名至少3个字符" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "密码至少6个字符" });
  }

  // Check if username exists
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(400).json({ error: "用户名已存在" });
  }

  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const now = Date.now();

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, username, passwordHash, now);

  // Create session
  const sessionId = generateSessionId();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  db.prepare(
    "INSERT INTO user_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(sessionId, id, expiresAt, now);

  res.cookie("session_id", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ user: { id, username, createdAt: now } });
});

// Login
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "用户名和密码不能为空" });
  }

  const user = db.prepare(
    "SELECT id, username, password_hash, created_at FROM users WHERE username = ?"
  ).get(username) as any;

  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  // Create session
  const sessionId = generateSessionId();
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

  db.prepare(
    "INSERT INTO user_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).run(sessionId, user.id, expiresAt, now);

  res.cookie("session_id", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ user: { id: user.id, username: user.username, createdAt: user.created_at } });
});

// Logout
router.post("/logout", (req, res) => {
  const sessionId = req.cookies?.session_id;
  if (sessionId) {
    db.prepare("DELETE FROM user_sessions WHERE id = ?").run(sessionId);
  }
  res.clearCookie("session_id");
  res.json({ ok: true });
});

// Get current user
router.get("/me", (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.json({ user: null });
  }
  res.json({ user });
});

export default router;
