import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { parseCommand, runCommand } from "./commands.js";
import { ensureCoreInitialized, resetCoreForTests } from "./data.js";
import { createSkillContent } from "./skill.js";

async function createWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "readany-cli-workspace-"));
  const dataRoot = join(root, "library");
  const skillsDir = join(root, "agent", "skills", "readany");
  const cliHome = join(root, "readany-home");
  await mkdir(dataRoot, { recursive: true });
  await mkdir(skillsDir, { recursive: true });
  await mkdir(cliHome, { recursive: true });

  return {
    root,
    dataRoot,
    env: {
      ...process.env,
      AGENT_HOME: join(root, "agent"),
      READANY_HOME: dataRoot,
    } as NodeJS.ProcessEnv,
  };
}

async function seedLibrary(dataRoot: string): Promise<void> {
  await resetCoreForTests();
  await ensureCoreInitialized({ ...process.env, READANY_HOME: dataRoot });
  const db = new Database(join(dataRoot, "readany.db"));
  db.exec(`
    INSERT INTO books (
      id, file_path, format, title, author, publisher, language, isbn, description,
      cover_url, publish_date, rating, reviews, subjects, total_pages, total_chapters,
      group_id, added_at, last_opened_at, updated_at, deleted_at, progress, current_cfi,
      is_vectorized, vectorize_progress, tags, file_hash, sync_status
    ) VALUES (
      'book-1', 'books/agent.epub', 'epub', 'Agent Systems', 'Ada Reader', NULL, 'en',
      NULL, 'A book about agent architecture', NULL, NULL, NULL, NULL, '["AI"]',
      100, 8, NULL, 1000, 2000, 3000, NULL, 0.5, 'epubcfi(/6/2)', 1, 1,
      '["ai","agent"]', 'hash-1', 'local'
    );

    INSERT INTO notes (
      id, book_id, highlight_id, cfi, title, content, chapter_title, tags, created_at, updated_at
    ) VALUES (
      'note-1', 'book-1', NULL, 'epubcfi(/6/4)', 'Planning note',
      'Agents need safe tool boundaries.', 'Tools', '["agent"]', 4000, 4000
    );

    INSERT INTO highlights (
      id, book_id, cfi, text, color, note, chapter_title, created_at, updated_at
    ) VALUES (
      'highlight-1', 'book-1', 'epubcfi(/6/8)', 'Draft-first editing keeps users safe.',
      'yellow', 'Important safety point', 'Safety', 5000, 5000
    );
  `);
  db.close();

  const localDb = new Database(join(dataRoot, "readany_local.db"));
  localDb.exec(`
    INSERT INTO chunks (
      id, book_id, chapter_index, chapter_title, content, token_count,
      start_cfi, end_cfi, segment_cfis, embedding, updated_at
    ) VALUES
    (
      'chunk-1', 'book-1', 1, 'Tools',
      'Agents need safe tool boundaries and permissioned local context.',
      9, 'epubcfi(/6/10)', 'epubcfi(/6/12)', '["epubcfi(/6/10)"]', NULL, 6000
    ),
    (
      'chunk-2', 'book-1', 2, 'Drafts',
      'Draft-first editing keeps EPUB sources safe while AI proposes changes.',
      10, 'epubcfi(/6/14)', 'epubcfi(/6/16)', '["epubcfi(/6/14)"]', NULL, 6000
    );
  `);
  localDb.close();
}

describe("commands", () => {
  it("parses json and profile flags", () => {
    expect(parseCommand(["doctor", "--json", "--profile", "editor"])).toEqual({
      name: "doctor",
      args: [],
      json: true,
      profile: "editor",
      mode: undefined,
      options: {},
    });
  });

  it("returns version", async () => {
    const result = await runCommand(["--version"], await createWorkspace().then((w) => w.env));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe("0.1.0");
  });

  it("installs and reports skill status", async () => {
    const workspace = await createWorkspace();
    const skillFile = join(workspace.root, "agent", "skills", "readany", "SKILL.md");
    await writeFile(skillFile, createSkillContent(), "utf8");

    const status = await runCommand(["skill", "status"], workspace.env);
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.data).toMatchObject({ installed: true });
    }
  });

  it("runs doctor with readonly profile", async () => {
    const workspace = await createWorkspace();
    const result = await runCommand(["doctor", "--profile", "readonly"], workspace.env);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        version: "0.1.0",
        profile: "readonly",
        tools: { count: 8 },
      });
    }
  });

  it("returns empty book list from an empty workspace", async () => {
    const workspace = await createWorkspace();
    const result = await runCommand(["books", "list"], workspace.env);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ books: [] });
    }
  });

  it("parses generic string options", () => {
    expect(parseCommand(["notes", "search", "agent", "--book", "book-1", "--limit", "5"])).toEqual({
      name: "notes",
      args: ["search", "agent"],
      json: false,
      profile: undefined,
      mode: undefined,
      options: {
        book: "book-1",
        limit: "5",
      },
    });
  });

  it("reads seeded books, notes, and highlights through core queries", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const books = await runCommand(["books", "search", "agent"], workspace.env);
    expect(books.ok).toBe(true);
    if (books.ok) {
      expect(books.data).toMatchObject({
        books: [
          {
            id: "book-1",
            meta: {
              title: "Agent Systems",
              author: "Ada Reader",
            },
          },
        ],
      });
    }

    const notes = await runCommand(["notes", "search", "boundaries"], workspace.env);
    expect(notes.ok).toBe(true);
    if (notes.ok) {
      expect(notes.data).toMatchObject({
        notes: [{ id: "note-1", title: "Planning note" }],
      });
    }

    const highlights = await runCommand(["highlights", "search", "draft-first"], workspace.env);
    expect(highlights.ok).toBe(true);
    if (highlights.ok) {
      expect(highlights.data).toMatchObject({
        highlights: [{ id: "highlight-1", text: "Draft-first editing keeps users safe." }],
      });
    }
  });

  it("searches indexed chunks with BM25 rag search", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const result = await runCommand(
      ["rag", "search", "permissioned context", "--book", "book-1", "--limit", "1"],
      workspace.env,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        results: [
          {
            matchType: "bm25",
            chunk: {
              id: "chunk-1",
              bookId: "book-1",
              chapterTitle: "Tools",
              startCfi: "epubcfi(/6/10)",
            },
          },
        ],
      });
    }
  });

  it("lists and reads indexed chapters from stored chunks", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const chapters = await runCommand(["chapters", "list", "book-1"], workspace.env);
    expect(chapters.ok).toBe(true);
    if (chapters.ok) {
      expect(chapters.data).toMatchObject({
        chapters: [
          {
            id: "1",
            index: 1,
            title: "Tools",
            chunkCount: 1,
            startCfi: "epubcfi(/6/10)",
          },
          {
            id: "2",
            index: 2,
            title: "Drafts",
            chunkCount: 1,
            startCfi: "epubcfi(/6/14)",
          },
        ],
      });
    }

    const chapter = await runCommand(["chapter", "get", "book-1", "2"], workspace.env);
    expect(chapter.ok).toBe(true);
    if (chapter.ok) {
      expect(chapter.data).toMatchObject({
        chapter: {
          id: "2",
          bookId: "book-1",
          title: "Drafts",
          content: "Draft-first editing keeps EPUB sources safe while AI proposes changes.",
          chunks: [{ id: "chunk-2", startCfi: "epubcfi(/6/14)" }],
        },
      });
    }
  });

  it("returns chapter_not_found for missing indexed chapters", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const result = await runCommand(["chapter", "get", "book-1", "99"], workspace.env);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "chapter_not_found" },
    });
  });

  it("requires a book id for rag search", async () => {
    const result = await runCommand(["rag", "search", "context"], (await createWorkspace()).env);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "missing_book_id" },
    });
  });

  it("rejects unsupported rag modes", async () => {
    const result = await runCommand(
      ["rag", "search", "context", "--book", "book-1", "--mode", "hybrid"],
      (await createWorkspace()).env,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "unsupported_rag_mode" },
    });
  });

  it("does not fail when audit logs are unavailable", async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace.dataRoot, "logs"), { recursive: true });
    const blockedLogDir = join(workspace.dataRoot, "logs", "cli");
    await writeFile(blockedLogDir, "not-a-directory", "utf8");

    const result = await runCommand(["tools", "list"], workspace.env);
    expect(result.ok).toBe(true);
  });
});
