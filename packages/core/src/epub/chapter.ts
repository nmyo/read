import { DOMParser } from "@xmldom/xmldom";
import { getPlatformService } from "../services";
import type { EpubDraftManifest } from "./draft";
import { withEpubPackageResourceReader } from "./inspect";

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

async function readEpubChapterBytes(
  bytes: Uint8Array,
  chapterId: string,
  options: { contentLimit?: number },
): Promise<Omit<EpubChapterReadResult, "source" | "draftId" | "bookId">> {
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
    const chapterXml = await readTextEntry(resourcePath);
    if (!chapterXml) throw new Error(`EPUB chapter file was not found: ${item.href}`);

    const title = extractTitle(chapterXml);
    const text = extractReadableText(chapterXml);
    const contentLimit = clampContentLimit(options.contentLimit);
    const truncated = text.length > contentLimit;
    return {
      id: item.id,
      href: item.href,
      mediaType: item.mediaType,
      title,
      content: truncated ? text.slice(0, contentLimit) : text,
      contentTruncated: truncated,
      contentLimit,
    };
  });
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
