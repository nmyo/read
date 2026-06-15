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
}

describe("commands", () => {
  it("parses json and profile flags", () => {
    expect(parseCommand(["doctor", "--json", "--profile", "editor"])).toEqual({
      name: "doctor",
      args: [],
      json: true,
      profile: "editor",
      mode: undefined,
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

  it("returns a clear not implemented response for mcp serve", async () => {
    const result = await runCommand(["mcp", "serve", "--profile", "readonly"], await createWorkspace().then((w) => w.env));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_implemented");
      expect(result.error.message).toContain("MCP server is not implemented yet");
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
});
