import type { Book } from "../types";
import { generateId } from "../utils/generate-id";
import { getPlatformService } from "../services";
import { inspectEpubBytes, type EpubInspectResult } from "./inspect";

export type EpubDraftManifest = {
  version: 1;
  draftId: string;
  bookId: string;
  sourceFilePath: string;
  draftFilePath: string;
  sourceHash: string;
  createdAt: string;
  updatedAt: string;
  status: "draft";
  inspect: EpubInspectResult;
};

export type EpubDraftCreateHistoryEntry = {
  id: string;
  timestamp: string;
  action: "epub.draft.create";
  bookId: string;
  draftId: string;
  sourceHash: string;
};

export type EpubDraftPatchHistoryEntry = {
  id: string;
  timestamp: string;
  action: "epub.chapter.patch" | "epub.metadata.patch";
  bookId: string;
  draftId: string;
  chapterId?: string;
  href?: string;
  beforeHash: string;
  afterHash: string;
  fields?: string[];
};

export type EpubDraftHistoryEntry = EpubDraftCreateHistoryEntry | EpubDraftPatchHistoryEntry;

export type EpubDraftCreateResult = {
  draftId: string;
  bookId: string;
  sourceFilePath: string;
  draftFilePath: string;
  manifestPath: string;
  historyPath: string;
  sourceHash: string;
  createdAt: string;
  inspect: EpubInspectResult;
};

export async function createEpubDraft(
  book: Book,
  options: {
    now?: Date;
    draftId?: string;
  } = {},
): Promise<EpubDraftCreateResult> {
  if (book.format !== "epub") {
    throw new Error(`Book ${book.id} is ${book.format}; only EPUB drafts are currently supported.`);
  }

  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const sourceAbsolutePath = await platform.joinPath(dataDir, book.filePath);
  if (!(await platform.exists(sourceAbsolutePath))) {
    throw new Error(`Book file was not found for ${book.id}: ${book.filePath}`);
  }

  const sourceBytes = await platform.readFile(sourceAbsolutePath);
  const inspect = await inspectEpubBytes(sourceBytes);
  const sourceHash = await sha256Hex(sourceBytes);
  const draftId = options.draftId ?? generateDraftId(book.id);
  const createdAt = (options.now ?? new Date()).toISOString();
  const draftDir = await platform.joinPath(dataDir, "drafts", "epub", draftId);
  const draftFilePath = `drafts/epub/${draftId}/source.epub`;
  const manifestPath = `drafts/epub/${draftId}/manifest.json`;
  const historyPath = `drafts/epub/${draftId}/history.jsonl`;

  await platform.mkdir(draftDir);
  await platform.writeFile(await platform.joinPath(dataDir, draftFilePath), sourceBytes);

  const manifest: EpubDraftManifest = {
    version: 1,
    draftId,
    bookId: book.id,
    sourceFilePath: book.filePath,
    draftFilePath,
    sourceHash,
    createdAt,
    updatedAt: createdAt,
    status: "draft",
    inspect,
  };
  await platform.writeTextFile(
    await platform.joinPath(dataDir, manifestPath),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const historyEntry: EpubDraftHistoryEntry = {
    id: generateId(),
    timestamp: createdAt,
    action: "epub.draft.create",
    bookId: book.id,
    draftId,
    sourceHash,
  };
  await platform.writeTextFile(
    await platform.joinPath(dataDir, historyPath),
    `${JSON.stringify(historyEntry)}\n`,
  );

  return {
    draftId,
    bookId: book.id,
    sourceFilePath: book.filePath,
    draftFilePath,
    manifestPath,
    historyPath,
    sourceHash,
    createdAt,
    inspect,
  };
}

function generateDraftId(bookId: string): string {
  return `${slugify(bookId)}-${generateId()}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "book";
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
