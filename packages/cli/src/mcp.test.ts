import Database from "better-sqlite3";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStoreOnlyZip, type ZipEntry } from "@readany/core/utils/store-only-zip";
import { describe, expect, it } from "vitest";
import { getAuditLogFilePath } from "./audit-log.js";
import { ensureCoreInitialized, resetCoreForTests } from "./data.js";
import { handleMcpRequest } from "./mcp.js";
import { READANY_TOOLS } from "./tool-registry.js";

const encoder = new TextEncoder();

function textEntry(name: string, content: string): ZipEntry {
  return { name, data: encoder.encode(content) };
}

function buildInspectableEpub(): Uint8Array {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>MCP for Readers</dc:title><dc:creator>Ada Reader</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry(
      "OPS/nav.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter-1.xhtml">Agent Access</a></li></ol></nav></body></html>`,
    ),
    textEntry("OPS/chapter-1.xhtml", "<html><body>Agent Access</body></html>"),
  ]);
}

async function createEnv() {
  const root = await mkdtemp(join(tmpdir(), "readany-cli-mcp-"));
  const dataRoot = join(root, "library");
  await mkdir(dataRoot, { recursive: true });
  await mkdir(join(dataRoot, "books"), { recursive: true });
  return {
    ...process.env,
    READANY_HOME: dataRoot,
    AGENT_HOME: join(root, "agent"),
  } as NodeJS.ProcessEnv;
}

async function seedBook(env: NodeJS.ProcessEnv): Promise<void> {
  await resetCoreForTests();
  await ensureCoreInitialized(env);
  const db = new Database(join(env.READANY_HOME!, "readany.db"));
  db.exec(`
    INSERT INTO books (
      id, file_path, format, title, author, publisher, language, isbn, description,
      cover_url, publish_date, rating, reviews, subjects, total_pages, total_chapters,
      group_id, added_at, last_opened_at, updated_at, deleted_at, progress, current_cfi,
      is_vectorized, vectorize_progress, tags, file_hash, sync_status
    ) VALUES (
      'mcp-book', 'books/mcp.epub', 'epub', 'MCP for Readers', 'Ada Reader', NULL, 'en',
      NULL, 'MCP access for ReadAny', NULL, NULL, NULL, NULL, '["AI"]',
      100, 8, NULL, 1000, 2000, 3000, NULL, 0.5, 'epubcfi(/6/2)', 1, 1,
      '["mcp"]', 'hash-mcp', 'local'
    );

    INSERT INTO notes (
      id, book_id, highlight_id, cfi, title, content, chapter_title, tags, created_at, updated_at
    ) VALUES (
      'mcp-note', 'mcp-book', NULL, 'epubcfi(/6/28)', 'MCP note',
      'MCP export should stay file-based.', 'Agent Access', '["mcp"]', 7000, 7000
    );

    INSERT INTO highlights (
      id, book_id, cfi, text, color, note, chapter_title, created_at, updated_at
    ) VALUES (
      'mcp-highlight', 'mcp-book', 'epubcfi(/6/30)',
      'External agents should receive export metadata, not full exported files.',
      'yellow', 'Export boundary', 'Agent Access', 8000, 8000
    );
  `);
  db.close();
  await writeFile(join(env.READANY_HOME!, "books", "mcp.epub"), buildInspectableEpub());

  const localDb = new Database(join(env.READANY_HOME!, "readany_local.db"));
  localDb.exec(`
    INSERT INTO chunks (
      id, book_id, chapter_index, chapter_title, content, token_count,
      start_cfi, end_cfi, segment_cfis, embedding, updated_at
    ) VALUES
    (
      'mcp-chunk-1', 'mcp-book', 1, 'Agent Access',
      'MCP access lets external agents search ReadAny chunks safely.',
      9, 'epubcfi(/6/20)', 'epubcfi(/6/22)', '["epubcfi(/6/20)"]', NULL, 6000
    ),
    (
      'mcp-chunk-1b', 'mcp-book', 1, 'Agent Access',
      'Chunk range controls keep MCP chapter reads bounded.',
      8, 'epubcfi(/6/22)', 'epubcfi(/6/23)', '["epubcfi(/6/22)"]', NULL, 6000
    ),
    (
      'mcp-chunk-2', 'mcp-book', 2, 'Draft Safety',
      'Draft-first editing protects original EPUB files.',
      7, 'epubcfi(/6/24)', 'epubcfi(/6/26)', '["epubcfi(/6/24)"]', NULL, 6000
    );
  `);
  localDb.close();
}

describe("mcp", () => {
  it("returns server capabilities during initialize", async () => {
    const response = await handleMcpRequest({ method: "initialize" }, "readonly", await createEnv());
    expect(response).toMatchObject({
      capabilities: { tools: {} },
      serverInfo: { name: "readany" },
    });
  });

  it("lists implemented readonly tools only", async () => {
    const response = await handleMcpRequest({ method: "tools/list" }, "readonly", await createEnv());
    expect(response).toMatchObject({
      tools: [
        { name: "books.list" },
        { name: "books.search" },
        { name: "books.get" },
        { name: "chapters.list" },
        { name: "chapters.get" },
        { name: "notes.search" },
        { name: "notes.export" },
        { name: "highlights.search" },
        { name: "rag.search" },
        { name: "audit.list" },
        { name: "epub.inspect" },
        { name: "epub.draft.create" },
        { name: "epub.draft.discard" },
        { name: "epub.chapter.read" },
        { name: "epub.chapter.patch" },
        { name: "epub.metadata.patch" },
        { name: "epub.toc.rebuild" },
        { name: "epub.history" },
        { name: "epub.diff" },
        { name: "epub.validate" },
        { name: "epub.export" },
      ],
    });
  });

  it("calls a readonly tool", async () => {
    const env = await createEnv();
    await seedBook(env);
    const response = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "books.search",
          arguments: { query: "mcp" },
        },
      },
      "readonly",
      env,
    );

    expect(response).toMatchObject({ isError: false });
    const text = (response as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      ok: true,
      data: {
        books: [{ id: "mcp-book", meta: { title: "MCP for Readers" } }],
      },
    });
  });

  it("gates notes.export by publisher profile and writes an export file", async () => {
    const env = await createEnv();
    await seedBook(env);
    const outputPath = join(env.READANY_HOME!, "exports", "mcp-notes.md");

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "notes.export",
          arguments: { bookId: "mcp-book", outputPath },
        },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const publisherResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "notes.export",
          arguments: { bookId: "mcp-book", outputPath, format: "markdown" },
        },
      },
      "publisher",
      env,
    );
    expect(publisherResponse).toMatchObject({ isError: false });
    const publisherText = (publisherResponse as { content: Array<{ text: string }> }).content[0]
      .text;
    expect(JSON.parse(publisherText)).toMatchObject({
      ok: true,
      data: {
        export: {
          bookId: "mcp-book",
          outputPath,
          format: "markdown",
          noteCount: 1,
          highlightCount: 1,
        },
      },
    });
    expect(publisherText).not.toContain("MCP export should stay file-based.");

    const exported = await readFile(outputPath, "utf8");
    expect(exported).toContain("# MCP for Readers");
    expect(exported).toContain("MCP export should stay file-based.");
    expect(exported).toContain("External agents should receive export metadata");
  });

  it("rejects unknown tools", async () => {
    const response = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.undo", arguments: {} },
      },
      "readonly",
      await createEnv(),
    );

    expect(response).toMatchObject({ isError: true });
    const text = (response as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      error: { code: "unknown_tool" },
    });
  });

  it("lists recent audit entries without leaking tool arguments", async () => {
    const env = await createEnv();
    await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "books.search",
          arguments: { query: "secret-mcp-query" },
        },
      },
      "readonly",
      env,
    );

    const response = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "audit.list",
          arguments: { source: "mcp", limit: 5 },
        },
      },
      "readonly",
      env,
    );
    expect(response).toMatchObject({ isError: false });
    const text = (response as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      ok: true,
      data: {
        audit: {
          limit: 5,
          entries: [
            {
              source: "mcp",
              action: "tools/call:books.search",
              ok: true,
            },
          ],
        },
      },
    });
    expect(text).not.toContain("secret-mcp-query");
  });

  it("gates epub.inspect by editor profile", async () => {
    const env = await createEnv();
    await seedBook(env);

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.inspect", arguments: { bookId: "mcp-book" } },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.inspect", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: false });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: true,
      data: {
        epub: {
          bookId: "mcp-book",
          filePath: "books/mcp.epub",
          packagePath: "OPS/package.opf",
          metadata: {
            title: "MCP for Readers",
            creator: "Ada Reader",
          },
          toc: {
            count: 1,
            items: [{ label: "Agent Access" }],
          },
        },
      },
    });
  });

  it("gates epub.draft.create by editor profile and creates a draft", async () => {
    const env = await createEnv();
    await seedBook(env);
    const sourcePath = join(env.READANY_HOME!, "books", "mcp.epub");
    const sourceBefore = await readFile(sourcePath);

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: false });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    const parsed = JSON.parse(editorText) as {
      ok: true;
      data: {
        draft: {
          draftFilePath: string;
          manifestPath: string;
          historyPath: string;
          sourceHash: string;
        };
      };
    };
    expect(parsed).toMatchObject({
      ok: true,
      data: {
        draft: {
          bookId: "mcp-book",
          sourceFilePath: "books/mcp.epub",
          draftFilePath: expect.stringMatching(/^drafts\/epub\/mcp-book-.+\/source\.epub$/),
          sourceHash: expect.any(String),
        },
      },
    });
    expect(await readFile(sourcePath)).toEqual(sourceBefore);
    expect(await readFile(join(env.READANY_HOME!, parsed.data.draft.draftFilePath))).toEqual(
      sourceBefore,
    );
  });

  it("gates epub.chapter.read by editor profile and reads a draft chapter", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "epub.chapter.read",
          arguments: { draftId, chapterId: "chapter-1" },
        },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "epub.chapter.read",
          arguments: { draftId, chapterId: "chapter-1", contentLimit: 12 },
        },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: false });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: true,
      data: {
        chapter: {
          source: "draft",
          draftId,
          bookId: "mcp-book",
          id: "chapter-1",
          href: "chapter-1.xhtml",
          content: "Agent Access",
        },
      },
    });
  });

  it("gates epub.draft.discard by editor profile and discards a draft", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.discard", arguments: { draftId } },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.discard", arguments: { draftId, reason: "no longer needed" } },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: false });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: true,
      data: {
        discarded: {
          draftId,
          bookId: "mcp-book",
          status: "discarded",
        },
      },
    });
  });

  it("gates epub.chapter.patch by editor profile and patches a draft chapter", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "epub.chapter.patch",
          arguments: {
            draftId,
            chapterId: "chapter-1",
            xhtml:
              `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Agent Updated</h1><p>Patched by MCP.</p></body></html>`,
          },
        },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "epub.chapter.patch",
          arguments: {
            draftId,
            chapterId: "chapter-1",
            xhtml:
              `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Agent Updated</h1><p>Patched by MCP.</p></body></html>`,
          },
        },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: false });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: true,
      data: {
        patch: {
          draftId,
          bookId: "mcp-book",
          chapterId: "chapter-1",
          href: "chapter-1.xhtml",
          resourcePath: "OPS/chapter-1.xhtml",
          changed: true,
          title: "Agent Updated",
        },
      },
    });
  });

  it("gates epub.metadata.patch by editor profile and patches draft metadata", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "epub.metadata.patch",
          arguments: {
            draftId,
            metadata: { title: "MCP Metadata Revised" },
          },
        },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "epub.metadata.patch",
          arguments: {
            draftId,
            metadata: {
              title: "MCP Metadata Revised",
              creator: "Ada Editor",
              subjects: ["AI", "MCP"],
            },
          },
        },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: false });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: true,
      data: {
        metadata: {
          draftId,
          bookId: "mcp-book",
          packagePath: "OPS/package.opf",
          changed: true,
          metadata: {
            title: "MCP Metadata Revised",
            creator: "Ada Editor",
            subjects: ["AI", "MCP"],
          },
        },
      },
    });
  });

  it("rejects epub.metadata.patch without a metadata object", async () => {
    const response = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "epub.metadata.patch",
          arguments: { draftId: "draft-1", metadata: "title" },
        },
      },
      "editor",
      await createEnv(),
    );

    expect(response).toMatchObject({ isError: true });
    const text = (response as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      error: { code: "invalid_tool_arguments" },
    });
  });

  it("gates epub.toc.rebuild by editor profile and rebuilds draft toc", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.toc.rebuild", arguments: { draftId } },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.toc.rebuild", arguments: { draftId } },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: false });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: true,
      data: {
        toc: {
          draftId,
          bookId: "mcp-book",
          navPath: "OPS/nav.xhtml",
          itemCount: 1,
        },
      },
    });
  });

  it("gates epub.history by editor profile and returns draft operations", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.history", arguments: { draftId } },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.history", arguments: { draftId } },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: false });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: true,
      data: {
        history: {
          draftId,
          bookId: "mcp-book",
          entries: [{ action: "epub.draft.create", draftId }],
        },
      },
    });
  });

  it("gates epub.diff by editor profile and returns draft resource changes", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const patchResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "epub.chapter.patch",
          arguments: {
            draftId,
            chapterId: "chapter-1",
            xhtml:
              `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Diffed Agent Access</h1><p>MCP diff changed this chapter.</p></body></html>`,
          },
        },
      },
      "editor",
      env,
    );
    expect(patchResponse).toMatchObject({ isError: false });

    const readonlyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.diff", arguments: { draftId } },
      },
      "readonly",
      env,
    );
    expect(readonlyResponse).toMatchObject({ isError: true });
    const readonlyText = (readonlyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(readonlyText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.diff", arguments: { draftId } },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: false });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: true,
      data: {
        diff: {
          draftId,
          bookId: "mcp-book",
          changedCount: 1,
          entries: expect.arrayContaining([
            expect.objectContaining({
              path: "OPS/chapter-1.xhtml",
              status: "modified",
            }),
          ]),
        },
      },
    });
  });

  it("gates epub.validate by publisher profile and validates a draft", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.validate", arguments: { draftId } },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: true });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const publisherResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.validate", arguments: { draftId } },
      },
      "publisher",
      env,
    );
    expect(publisherResponse).toMatchObject({ isError: false });
    const publisherText = (publisherResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(publisherText)).toMatchObject({
      ok: true,
      data: {
        validation: {
          draftId,
          bookId: "mcp-book",
          valid: true,
          errorCount: 0,
          issues: [],
        },
      },
    });
    expect(String(publisherText)).not.toContain(env.READANY_HOME);
  });

  it("gates epub.export by publisher profile and writes a new EPUB", async () => {
    const env = await createEnv();
    await seedBook(env);
    const sourcePath = join(env.READANY_HOME!, "books", "mcp.epub");
    const sourceBytes = await readFile(sourcePath);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;
    const outputPath = join(env.READANY_HOME!, "..", "exports", "mcp-export.epub");

    const editorResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.export", arguments: { draftId, outputPath } },
      },
      "editor",
      env,
    );
    expect(editorResponse).toMatchObject({ isError: true });
    const editorText = (editorResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(editorText)).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const publisherResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.export", arguments: { draftId, outputPath } },
      },
      "publisher",
      env,
    );
    expect(publisherResponse).toMatchObject({ isError: false });
    const publisherText = (publisherResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(publisherText)).toMatchObject({
      ok: true,
      data: {
        export: {
          draftId,
          bookId: "mcp-book",
          outputPath,
          outputHash: expect.any(String),
          outputSize: sourceBytes.byteLength,
          validation: {
            valid: true,
          },
        },
      },
    });
    expect(await readFile(outputPath)).toEqual(sourceBytes);
    expect(await readFile(sourcePath)).toEqual(sourceBytes);

    const secondResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.export", arguments: { draftId, outputPath } },
      },
      "publisher",
      env,
    );
    expect(secondResponse).toMatchObject({ isError: true });
    const secondText = (secondResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(secondText)).toMatchObject({
      ok: false,
      error: { code: "command_failed" },
    });
  });

  it("blocks draft reads after discard", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const discardResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.discard", arguments: { draftId } },
      },
      "editor",
      env,
    );
    expect(discardResponse).toMatchObject({ isError: false });

    const historyResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.history", arguments: { draftId } },
      },
      "editor",
      env,
    );
    expect(historyResponse).toMatchObject({ isError: false });
    const historyText = (historyResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(historyText)).toMatchObject({
      ok: true,
      data: {
        history: {
          draftId,
          status: "discarded",
          entries: [
            expect.objectContaining({ action: "epub.draft.create" }),
            expect.objectContaining({ action: "epub.draft.discard" }),
          ],
        },
      },
    });

    const chapterResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.chapter.read", arguments: { draftId, chapterId: "chapter-1" } },
      },
      "editor",
      env,
    );
    expect(chapterResponse).toMatchObject({ isError: true });
    const chapterText = (chapterResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(chapterText)).toMatchObject({
      ok: false,
      error: { code: "command_failed" },
    });
    expect(String(chapterText)).toMatch(/discarded/i);
  });


  it("calls rag.search with readonly profile", async () => {
    const env = await createEnv();
    await seedBook(env);
    const response = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "rag.search",
          arguments: { query: "external agents", bookId: "mcp-book", limit: 1 },
        },
      },
      "readonly",
      env,
    );

    expect(response).toMatchObject({ isError: false });
    const text = (response as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      ok: true,
      data: {
        results: [
          {
            matchType: "bm25",
            chunk: {
              id: "mcp-chunk-1",
              bookId: "mcp-book",
              chapterTitle: "Agent Access",
              startCfi: "epubcfi(/6/20)",
            },
          },
        ],
      },
    });
  });

  it("calls chapters list and get with readonly profile", async () => {
    const env = await createEnv();
    await seedBook(env);

    const listResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "chapters.list",
          arguments: { bookId: "mcp-book" },
        },
      },
      "readonly",
      env,
    );
    expect(listResponse).toMatchObject({ isError: false });
    const listText = (listResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(listText)).toMatchObject({
      ok: true,
      data: {
        chapters: [
          {
            id: "1",
            title: "Agent Access",
            startCfi: "epubcfi(/6/20)",
            chunkCount: 2,
          },
          {
            id: "2",
            title: "Draft Safety",
            startCfi: "epubcfi(/6/24)",
          },
        ],
      },
    });

    const getResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "chapters.get",
          arguments: { bookId: "mcp-book", chapterId: "1", chunkStart: 2, chunkCount: 1 },
        },
      },
      "readonly",
      env,
    );
    expect(getResponse).toMatchObject({ isError: false });
    const getText = (getResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(getText)).toMatchObject({
      ok: true,
      data: {
        chapter: {
          id: "1",
          totalChunkCount: 2,
          returnedChunkCount: 1,
          chunkStart: 2,
          rangeTruncated: true,
          content: "Chunk range controls keep MCP chapter reads bounded.",
          chunks: [{ id: "mcp-chunk-1b" }],
        },
      },
    });
  });

  it("falls back to epub chapters when no chunks are indexed", async () => {
    const env = await createEnv();
    await resetCoreForTests();
    await ensureCoreInitialized(env);
    const db = new Database(join(env.READANY_HOME!, "readany.db"));
    db.exec(`
      INSERT INTO books (
        id, file_path, format, title, author, publisher, language, isbn, description,
        cover_url, publish_date, rating, reviews, subjects, total_pages, total_chapters,
        group_id, added_at, last_opened_at, updated_at, deleted_at, progress, current_cfi,
        is_vectorized, vectorize_progress, tags, file_hash, sync_status
      ) VALUES (
        'fallback-book', 'books/fallback.epub', 'epub', 'Fallback Book', 'Ada Reader', NULL, 'en',
        NULL, 'Fallback epub only', NULL, NULL, NULL, NULL, '["AI"]',
        100, 1, NULL, 1000, 2000, 3000, NULL, 0.5, 'epubcfi(/6/2)', 0, 0,
        '["epub"]', 'hash-fallback', 'local'
      );
    `);
    db.close();
    await writeFile(join(env.READANY_HOME!, "books", "fallback.epub"), buildInspectableEpub());

    const listResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "chapters.list",
          arguments: { bookId: "fallback-book" },
        },
      },
      "readonly",
      env,
    );
    expect(listResponse).toMatchObject({ isError: false });
    const listText = (listResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(listText)).toMatchObject({
      ok: true,
      data: {
        chapters: [
          {
            source: "epub",
            id: "chapter-1",
            title: "Agent Access",
            href: "chapter-1.xhtml",
          },
        ],
      },
    });

    const getResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "chapters.get",
          arguments: { bookId: "fallback-book", chapterId: "chapter-1" },
        },
      },
      "readonly",
      env,
    );
    expect(getResponse).toMatchObject({ isError: false });
    const getText = (getResponse as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(getText)).toMatchObject({
      ok: true,
      data: {
        chapter: {
          source: "book",
          bookId: "fallback-book",
          id: "chapter-1",
          content: "Agent Access",
        },
      },
    });
  });

  it("rejects rag.search without a book id", async () => {
    const response = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "rag.search",
          arguments: { query: "external agents" },
        },
      },
      "readonly",
      await createEnv(),
    );

    expect(response).toMatchObject({ isError: true });
    const text = (response as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      error: { code: "invalid_tool_arguments" },
    });
  });

  it("rejects tool arguments outside the registered schema", async () => {
    const response = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "books.search",
          arguments: { query: "mcp", rawSql: "select * from books" },
        },
      },
      "readonly",
      await createEnv(),
    );

    expect(response).toMatchObject({ isError: true });
    const text = (response as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      error: { code: "invalid_tool_arguments" },
    });
  });

  it("rejects epub.chapter.patch without xhtml", async () => {
    const env = await createEnv();
    await seedBook(env);
    const createResponse = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "mcp-book" } },
      },
      "editor",
      env,
    );
    const createText = (createResponse as { content: Array<{ text: string }> }).content[0].text;
    const draftId = (JSON.parse(createText) as { data: { draft: { draftId: string } } }).data.draft
      .draftId;

    const response = await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "epub.chapter.patch",
          arguments: { draftId, chapterId: "chapter-1" },
        },
      },
      "editor",
      env,
    );

    expect(response).toMatchObject({ isError: true });
    const text = (response as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      error: { code: "invalid_tool_arguments" },
    });
  });

  it("enforces tool argument schema limits", async () => {
    const env = await createEnv();
    const cases = [
      {
        name: "books.search",
        arguments: { query: "   " },
        message: "empty string",
      },
      {
        name: "books.list",
        arguments: { limit: 1000 },
        message: "number maximum",
      },
      {
        name: "rag.search",
        arguments: { query: "mcp", bookId: "mcp-book", mode: "hybrid" },
        message: "enum value",
      },
      {
        name: "notes.export",
        arguments: { bookId: "mcp-book", outputPath: "notes.md", format: "xml" },
        message: "export format enum",
        profile: "publisher",
      },
    ];

    for (const item of cases) {
      const response = await handleMcpRequest(
        {
          method: "tools/call",
          params: {
            name: item.name,
            arguments: item.arguments,
          },
        },
        item.profile ?? "readonly",
        env,
      );

      expect(response, item.message).toMatchObject({ isError: true });
      const text = (response as { content: Array<{ text: string }> }).content[0].text;
      expect(JSON.parse(text), item.message).toMatchObject({
        ok: false,
        error: { code: "invalid_tool_arguments" },
      });
    }
  });

  it("records MCP audit entries without leaking tool arguments", async () => {
    const env = await createEnv();
    await handleMcpRequest(
      {
        method: "tools/call",
        params: {
          name: "books.search",
          arguments: { query: "secret-search-text" },
        },
      },
      "readonly",
      env,
    );

    const auditPath = getAuditLogFilePath(
      join(env.READANY_HOME!, "logs", "cli"),
      new Date().toISOString(),
    );
    const auditContent = await readFile(auditPath, "utf8");
    expect(auditContent).toContain('"source":"mcp"');
    expect(auditContent).toContain('"action":"tools/call:books.search"');
    expect(auditContent).not.toContain("secret-search-text");
  });

  it("rejects tools when the profile is missing required scopes", async () => {
    const temporaryTool = {
      name: "test.admin.backup",
      description: "Test admin-only tool.",
      scopes: ["admin.backup"],
      risk: "high",
      inputSchema: {
        type: "object",
        additionalProperties: false,
      },
    } as const;
    (READANY_TOOLS as unknown as typeof temporaryTool[]).push(temporaryTool);

    try {
      const response = await handleMcpRequest(
        {
          method: "tools/call",
          params: { name: temporaryTool.name, arguments: {} },
        },
        "readonly",
        await createEnv(),
      );

      expect(response).toMatchObject({ isError: true });
      const text = (response as { content: Array<{ text: string }> }).content[0].text;
      expect(JSON.parse(text)).toMatchObject({
        ok: false,
        error: { code: "permission_denied" },
      });
    } finally {
      (READANY_TOOLS as unknown as typeof temporaryTool[]).pop();
    }
  });
});
