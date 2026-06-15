import { setPlatformService } from "@readany/core/services";
import type { Book, Highlight, Note } from "@readany/core/types";
import type { SearchMode } from "@readany/core/types";
import {
  getAllHighlights,
  getAllNotes,
  getBook,
  getBooks,
  getChunks,
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
  const { clearChunkCache } = await import("@readany/core/rag");
  clearChunkCache();
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

export type SearchAnnotationsOptions = {
  query?: string;
  bookId?: string;
  limit?: number;
  env?: NodeJS.ProcessEnv;
};

export async function listHighlights(options: SearchAnnotationsOptions = {}) {
  const { bookId, query, limit = 50, env = process.env } = options;
  await ensureCoreInitialized(env);
  const highlights = bookId ? await getHighlights(bookId) : await getAllHighlights(limit);
  const needle = query?.trim().toLowerCase();
  if (!needle) return highlights.slice(0, limit);
  return highlights
    .filter((highlight) =>
      `${highlight.text} ${highlight.note ?? ""} ${highlight.chapterTitle ?? ""}`
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, limit);
}

export async function listNotes(options: SearchAnnotationsOptions = {}) {
  const { bookId, query, limit = 50, env = process.env } = options;
  await ensureCoreInitialized(env);
  const notes = bookId ? await getNotes(bookId) : await getAllNotes(limit);
  const needle = query?.trim().toLowerCase();
  if (!needle) return notes.slice(0, limit);
  return notes
    .filter((note) =>
      `${note.title} ${note.content} ${note.chapterTitle ?? ""} ${(note.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, limit);
}

export async function listBookmarks(bookId: string, env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  return getBookmarks(bookId);
}

export async function listSkills(env: NodeJS.ProcessEnv = process.env) {
  await ensureCoreInitialized(env);
  return getSkills();
}

export type ChapterListOptions = {
  bookId: string;
  env?: NodeJS.ProcessEnv;
};

export type ChapterGetOptions = ChapterListOptions & {
  chapterId: string;
  contentLimit?: number;
  chunkStart?: number;
  chunkCount?: number;
};

export type IndexedChapterSummary = {
  id: string;
  bookId: string;
  index: number;
  title: string;
  chunkCount: number;
  tokenCount: number;
  startCfi: string;
  endCfi: string;
};

export type IndexedChapter = IndexedChapterSummary & {
  totalChunkCount: number;
  returnedChunkCount: number;
  chunkStart: number;
  rangeTruncated: boolean;
  content: string;
  contentTruncated: boolean;
  chunks: Array<{
    id: string;
    content: string;
    tokenCount: number;
    startCfi: string;
    endCfi: string;
    segmentCfis?: string[];
  }>;
};

function chapterIdFromIndex(index: number): string {
  return String(index);
}

function getChapterIndexFromId(chapterId: string): number | null {
  const parsed = Number.parseInt(chapterId, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function listIndexedChapters(
  options: ChapterListOptions,
): Promise<IndexedChapterSummary[]> {
  const { bookId, env = process.env } = options;
  await ensureCoreInitialized(env);
  const chunks = await getChunks(bookId);
  const chapters = new Map<number, IndexedChapterSummary>();

  for (const chunk of chunks) {
    const existing = chapters.get(chunk.chapterIndex);
    if (!existing) {
      chapters.set(chunk.chapterIndex, {
        id: chapterIdFromIndex(chunk.chapterIndex),
        bookId,
        index: chunk.chapterIndex,
        title: chunk.chapterTitle || `Chapter ${chunk.chapterIndex + 1}`,
        chunkCount: 1,
        tokenCount: chunk.tokenCount,
        startCfi: chunk.startCfi,
        endCfi: chunk.endCfi,
      });
      continue;
    }

    existing.chunkCount += 1;
    existing.tokenCount += chunk.tokenCount;
    if (!existing.startCfi && chunk.startCfi) existing.startCfi = chunk.startCfi;
    if (chunk.endCfi) existing.endCfi = chunk.endCfi;
  }

  return Array.from(chapters.values()).sort((a, b) => a.index - b.index);
}

export async function getIndexedChapter(options: ChapterGetOptions): Promise<IndexedChapter | null> {
  const {
    bookId,
    chapterId,
    contentLimit,
    chunkStart,
    chunkCount,
    env = process.env,
  } = options;
  const chapterIndex = getChapterIndexFromId(chapterId);
  if (chapterIndex === null) return null;

  await ensureCoreInitialized(env);
  const allChunks = (await getChunks(bookId)).filter((chunk) => chunk.chapterIndex === chapterIndex);
  if (allChunks.length === 0) return null;

  const start = clampPositiveInteger(chunkStart, 1, allChunks.length);
  const requestedCount =
    chunkCount === undefined
      ? allChunks.length
      : clampPositiveInteger(chunkCount, allChunks.length, allChunks.length);
  const chunks = allChunks.slice(start - 1, start - 1 + requestedCount);
  if (chunks.length === 0) return null;

  const maxContentChars = clampPositiveInteger(contentLimit, 12000, 50000);
  const fullContent = chunks.map((chunk) => chunk.content).join("\n\n");
  const content = truncateContent(fullContent, maxContentChars);
  const tokenCount = allChunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
  const first = chunks[0];
  const last = chunks[chunks.length - 1];

  return {
    id: chapterIdFromIndex(chapterIndex),
    bookId,
    index: chapterIndex,
    title: first.chapterTitle || `Chapter ${chapterIndex + 1}`,
    chunkCount: allChunks.length,
    tokenCount,
    totalChunkCount: allChunks.length,
    returnedChunkCount: chunks.length,
    chunkStart: start,
    rangeTruncated: chunks.length < allChunks.length,
    startCfi: first.startCfi,
    endCfi: last.endCfi,
    content: content.content,
    contentTruncated: content.truncated,
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      startCfi: chunk.startCfi,
      endCfi: chunk.endCfi,
      segmentCfis: chunk.segmentCfis,
    })),
  };
}

export type RagSearchOptions = {
  query: string;
  bookId: string;
  mode?: SearchMode;
  limit?: number;
  contentLimit?: number;
  env?: NodeJS.ProcessEnv;
};

export type RagSearchItem = {
  score: number;
  matchType: SearchMode;
  highlights?: string[];
  chunk: {
    id: string;
    bookId: string;
    chapterIndex: number;
    chapterTitle: string;
    content: string;
    contentTruncated: boolean;
    tokenCount: number;
    startCfi: string;
    endCfi: string;
    segmentCfis?: string[];
  };
};

function clampPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || !value || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function truncateContent(content: string, limit: number): { content: string; truncated: boolean } {
  if (content.length <= limit) return { content, truncated: false };
  return { content: content.slice(0, limit), truncated: true };
}

export async function searchRag(options: RagSearchOptions): Promise<RagSearchItem[]> {
  const {
    query,
    bookId,
    mode = "bm25",
    limit,
    contentLimit,
    env = process.env,
  } = options;

  if (mode !== "bm25") {
    throw new Error("Only BM25 RAG search is currently available through ReadAny CLI.");
  }

  await ensureCoreInitialized(env);
  const { search } = await import("@readany/core/rag");
  const results = await search({
    query,
    bookId,
    mode,
    topK: clampPositiveInteger(limit, 5, 50),
    threshold: 0,
  });
  const maxContentChars = clampPositiveInteger(contentLimit, 1200, 4000);

  return results.map((result) => {
    const content = truncateContent(result.chunk.content, maxContentChars);
    return {
      score: result.score,
      matchType: result.matchType,
      highlights: result.highlights,
      chunk: {
        id: result.chunk.id,
        bookId: result.chunk.bookId,
        chapterIndex: result.chunk.chapterIndex,
        chapterTitle: result.chunk.chapterTitle,
        content: content.content,
        contentTruncated: content.truncated,
        tokenCount: result.chunk.tokenCount,
        startCfi: result.chunk.startCfi,
        endCfi: result.chunk.endCfi,
        segmentCfis: result.chunk.segmentCfis,
      },
    };
  });
}
