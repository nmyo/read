import { DOMParser } from "@xmldom/xmldom";
import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
  configure,
} from "@zip.js/zip.js";
import { getPlatformService } from "../services";
import type { EpubDraftManifest } from "./draft";
import { generateId } from "../utils/generate-id";
import { inspectEpubBytes } from "./inspect";
import { withEpubPackageResourceReader } from "./inspect";

configure({ useWebWorkers: false });

export type EpubChapterReadResult = {
  source: "draft" | "book";
  id: string;
  href: string;
  mediaType?: string;
  title?: string;
  content: string;
  contentTruncated: boolean;
  contentLimit: number;
  draftId?: string;
  bookId?: string;
};

export type EpubChapterPatchResult = {
  draftId: string;
  bookId: string;
  chapterId: string;
  href: string;
  resourcePath: string;
  beforeHash: string;
  afterHash: string;
  changed: boolean;
  operationId: string;
  updatedAt: string;
  title?: string;
  contentPreview: string;
  contentPreviewTruncated: boolean;
  manifestPath: string;
  historyPath: string;
};

export async function readEpubChapterFromDraft(
  draftId: string,
  chapterId: string,
  options: { contentLimit?: number } = {},
): Promise<EpubChapterReadResult> {
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const manifestPath = await platform.joinPath(dataDir, "drafts", "epub", draftId, "manifest.json");
  if (!(await platform.exists(manifestPath))) {
    throw new Error(`EPUB draft was not found: ${draftId}`);
  }

  const manifest = JSON.parse(await platform.readTextFile(manifestPath)) as EpubDraftManifest;
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }

  const chapter = await readEpubChapterBytes(
    await platform.readFile(draftPath),
    chapterId,
    options,
  );
  return {
    ...chapter,
    source: "draft",
    draftId,
    bookId: manifest.bookId,
  };
}

export async function patchEpubChapterInDraft(
  draftId: string,
  chapterId: string,
  xhtml: string,
  options: { now?: Date; previewLimit?: number } = {},
): Promise<EpubChapterPatchResult> {
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const draftDir = await platform.joinPath(dataDir, "drafts", "epub", draftId);
  const manifestPath = await platform.joinPath(draftDir, "manifest.json");
  const historyPath = await platform.joinPath(draftDir, "history.jsonl");
  if (!(await platform.exists(manifestPath))) {
    throw new Error(`EPUB draft was not found: ${draftId}`);
  }

  const manifest = JSON.parse(await platform.readTextFile(manifestPath)) as EpubDraftManifest;
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }

  assertReadableXhtml(xhtml);
  const draftBytes = await platform.readFile(draftPath);
  const chapterResource = await findChapterResource(draftBytes, chapterId);
  const beforeXml = chapterResource.content;
  const beforeHash = await sha256Hex(new TextEncoder().encode(beforeXml));
  const afterHash = await sha256Hex(new TextEncoder().encode(xhtml));
  const changed = beforeHash !== afterHash;
  const updatedAt = (options.now ?? new Date()).toISOString();
  const operationId = generateId();

  if (changed) {
    const patchedBytes = await replaceZipTextEntry(draftBytes, chapterResource.resourcePath, xhtml);
    await platform.writeFile(draftPath, patchedBytes);
  }

  const nextManifest: EpubDraftManifest = {
    ...manifest,
    updatedAt,
    inspect: changed ? await inspectEpubBytes(await platform.readFile(draftPath)) : manifest.inspect,
  };
  await platform.writeTextFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);

  await appendHistoryLine(historyPath, {
    id: operationId,
    timestamp: updatedAt,
    action: "epub.chapter.patch",
    bookId: manifest.bookId,
    draftId,
    chapterId,
    href: chapterResource.href,
    beforeHash,
    afterHash,
  });

  const text = extractReadableText(xhtml);
  const previewLimit = clampContentLimit(options.previewLimit ?? 1000);
  const previewTruncated = text.length > previewLimit;
  return {
    draftId,
    bookId: manifest.bookId,
    chapterId,
    href: chapterResource.href,
    resourcePath: chapterResource.resourcePath,
    beforeHash,
    afterHash,
    changed,
    operationId,
    updatedAt,
    title: extractTitle(xhtml),
    contentPreview: previewTruncated ? text.slice(0, previewLimit) : text,
    contentPreviewTruncated: previewTruncated,
    manifestPath: `drafts/epub/${draftId}/manifest.json`,
    historyPath: `drafts/epub/${draftId}/history.jsonl`,
  };
}

export async function readEpubChapterFromBookFile(
  bookId: string,
  bookFilePath: string,
  chapterId: string,
  options: { contentLimit?: number } = {},
): Promise<EpubChapterReadResult> {
  const platform = getPlatformService();
  const dataDir = await platform.getDataDir();
  const absolutePath = await platform.joinPath(dataDir, bookFilePath);
  if (!(await platform.exists(absolutePath))) {
    throw new Error(`Book file was not found for ${bookId}: ${bookFilePath}`);
  }

  const chapter = await readEpubChapterBytes(
    await platform.readFile(absolutePath),
    chapterId,
    options,
  );
  return {
    ...chapter,
    source: "book",
    bookId,
  };
}

async function findChapterResource(
  bytes: Uint8Array,
  chapterId: string,
): Promise<{
  id: string;
  href: string;
  mediaType: string;
  resourcePath: string;
  content: string;
}> {
  return withEpubPackageResourceReader(bytes, async ({ packagePath, packageDir, readTextEntry }) => {
    const opfXml = await readTextEntry(packagePath);
    if (!opfXml) throw new Error(`EPUB package document was not found: ${packagePath}`);

    const manifestItems = parseManifestItems(opfXml);
    const item = manifestItems.find((candidate) => candidate.id === chapterId);
    if (!item) {
      throw new Error(`EPUB chapter resource was not found: ${chapterId}`);
    }
    if (!item.mediaType.includes("html")) {
      throw new Error(`EPUB resource is not a readable XHTML chapter: ${chapterId}`);
    }

    const resourcePath = resolvePackagePath(packageDir, item.href);
    const content = await readTextEntry(resourcePath);
    if (!content) throw new Error(`EPUB chapter file was not found: ${item.href}`);
    return {
      ...item,
      resourcePath,
      content,
    };
  });
}

async function readEpubChapterBytes(
  bytes: Uint8Array,
  chapterId: string,
  options: { contentLimit?: number },
): Promise<Omit<EpubChapterReadResult, "source" | "draftId" | "bookId">> {
  const chapter = await findChapterResource(bytes, chapterId);
  const title = extractTitle(chapter.content);
  const text = extractReadableText(chapter.content);
  const contentLimit = clampContentLimit(options.contentLimit);
  const truncated = text.length > contentLimit;
  return {
    id: chapter.id,
    href: chapter.href,
    mediaType: chapter.mediaType,
    title,
    content: truncated ? text.slice(0, contentLimit) : text,
    contentTruncated: truncated,
    contentLimit,
  };
}

function parseManifestItems(opfXml: string): Array<{ id: string; href: string; mediaType: string }> {
  const doc = new DOMParser().parseFromString(opfXml, "application/xml") as unknown as Document;
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "item")
    .map((item) => ({
      id: item.getAttribute("id") ?? "",
      href: item.getAttribute("href") ?? "",
      mediaType: item.getAttribute("media-type") ?? "",
    }))
    .filter((item) => item.id && item.href);
}

function extractTitle(xml: string): string | undefined {
  const doc = new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
  const heading = Array.from(doc.getElementsByTagName("*")).find((element) =>
    /^h[1-6]$/i.test(element.localName),
  );
  return heading?.textContent?.replace(/\s+/g, " ").trim() || undefined;
}

function extractReadableText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
  const body = Array.from(doc.getElementsByTagName("*")).find(
    (element) => element.localName === "body",
  );
  const root = body ?? doc.documentElement;
  const chunks: string[] = [];
  collectText(root, chunks);
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function assertReadableXhtml(xml: string): void {
  const doc = new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
  const parserError = Array.from(doc.getElementsByTagName("*")).find(
    (element) => element.localName === "parsererror",
  );
  if (parserError) {
    throw new Error("Patched chapter XHTML could not be parsed.");
  }
  const body = Array.from(doc.getElementsByTagName("*")).find(
    (element) => element.localName === "body",
  );
  if (!body) {
    throw new Error("Patched chapter XHTML must include a body element.");
  }
}

function collectText(node: Node, chunks: string[]): void {
  if (node.nodeType === 3) {
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    if (text) chunks.push(text);
    return;
  }

  if (node.nodeType !== 1) return;
  const element = node as Element;
  if (["script", "style", "svg"].includes(element.localName.toLowerCase())) return;
  for (const child of Array.from(element.childNodes)) {
    collectText(child, chunks);
  }
}

function clampContentLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return 12000;
  return Math.min(Math.floor(limit), 50000);
}

function resolvePackagePath(packageDir: string, href: string): string {
  if (!packageDir) return href;
  return `${packageDir}${href}`.replace(/\/{2,}/g, "/");
}

async function replaceZipTextEntry(
  bytes: Uint8Array,
  targetPath: string,
  content: string,
): Promise<Uint8Array> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  const writer = new ZipWriter(new Uint8ArrayWriter(), { extendedTimestamp: false });
  const writeOptions = {
    level: 0,
    lastAccessDate: new Date(0),
    lastModDate: new Date(0),
  };
  let replaced = false;

  try {
    const entries = await reader.getEntries();
    for (const entry of entries) {
      if (entry.directory) {
        await writer.add(entry.filename, undefined, { directory: true });
        continue;
      }

      if (entry.filename === targetPath) {
        await writer.add(entry.filename, new TextReader(content), writeOptions);
        replaced = true;
        continue;
      }

      if (!entry.getData) continue;
      await writer.add(
        entry.filename,
        new Uint8ArrayReader(await entry.getData(new Uint8ArrayWriter())),
        writeOptions,
      );
    }
  } finally {
    await reader.close();
  }

  if (!replaced) {
    await writer.close();
    throw new Error(`EPUB chapter file was not found: ${targetPath}`);
  }

  return writer.close();
}

async function appendHistoryLine(path: string, entry: unknown): Promise<void> {
  const platform = getPlatformService();
  const existing = (await platform.exists(path)) ? await platform.readTextFile(path) : "";
  await platform.writeTextFile(path, `${existing}${JSON.stringify(entry)}\n`);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
