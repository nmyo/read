import { setPlatformService } from "@readany/core/services";
import type { Book, Highlight, Note } from "@readany/core/types";
import {
  getAllHighlights,
  getAllNotes,
  getBook,
  getBooks,
  getBookmarks,
  getHighlights,
  getNotes,
  closeDB,
  getSkills,
  initDatabase,
} from "@readany/core/db";
import { createNodePlatformService } from "./platform/node-platform.js";

let initialized = false;
let initializedHome: string | undefined;

export async function ensureCoreInitialized(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const nextHome = env.READANY_HOME;
  if (initialized && initializedHome === nextHome) return;
  if (initialized) {
    await closeDB();
  }
  setPlatformService(createNodePlatformService(env));
  await initDatabase();
  initialized = true;
  initializedHome = nextHome;
}

export async function resetCoreForTests(): Promise<void> {
  await closeDB();
  initialized = false;
  initializedHome = undefined;
}

export async function listBooks(limit = 50, env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  const books = await getBooks();
  return books.slice(0, limit);
}

export async function searchBooks(query: string, limit = 20, env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  const needle = query.trim().toLowerCase();
  const books = await getBooks();
  return books.filter((book: Book) => {
    const haystack = [
      book.meta.title,
      book.meta.author,
      book.meta.description,
      ...(book.tags || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  }).slice(0, limit);
}

export async function getBookById(bookId: string, env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  return getBook(bookId);
}

export async function listHighlights(
  bookId?: string,
  limit = 50,
  env: NodeJS.ProcessEnv = process.env,
) {
  await ensureCoreInitialized(env);
  return bookId ? getHighlights(bookId) : getAllHighlights(limit);
}

export async function listNotes(
  bookId?: string,
  limit = 50,
  env: NodeJS.ProcessEnv = process.env,
) {
  await ensureCoreInitialized(env);
  return bookId ? getNotes(bookId) : getAllNotes(limit);
}

export async function listBookmarks(bookId: string, env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  return getBookmarks(bookId);
}

export async function listSkills(env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  return getSkills();
}
