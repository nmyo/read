import Database from "better-sqlite3";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAuditLogFilePath } from "./audit-log.js";
import { ensureCoreInitialized, resetCoreForTests } from "./data.js";
import { handleMcpRequest } from "./mcp.js";
import { READANY_TOOLS } from "./tool-registry.js";

async function createEnv() {
  const root = await mkdtemp(join(tmpdir(), "readany-cli-mcp-"));
  const dataRoot = join(root, "library");
  await mkdir(dataRoot, { recursive: true });
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
  `);
  db.close();

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
        { name: "notes.search" },
        { name: "highlights.search" },
        { name: "rag.search" },
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

  it("rejects unknown tools", async () => {
    const response = await handleMcpRequest(
      {
        method: "tools/call",
        params: { name: "epub.export", arguments: {} },
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
      error: { code: "missing_book_id" },
    });
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
