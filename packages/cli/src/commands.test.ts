import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { buildStoreOnlyZip, type ZipEntry } from "@readany/core/utils/store-only-zip";
import { describe, expect, it } from "vitest";
import { parseCommand, runCommand } from "./commands.js";
import { ensureCoreInitialized, resetCoreForTests } from "./data.js";
import { createSkillContent } from "./skill.js";

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
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Agent Systems</dc:title><dc:creator>Ada Reader</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/></spine></package>`,
    ),
    textEntry(
      "OPS/nav.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter-1.xhtml">Tools</a></li></ol></nav></body></html>`,
    ),
    textEntry("OPS/chapter-1.xhtml", "<html><body>Tools</body></html>"),
  ]);
}

async function createWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "readany-cli-workspace-"));
  const dataRoot = join(root, "library");
  const skillsDir = join(root, "agent", "skills", "readany");
  const cliHome = join(root, "readany-home");
  await mkdir(dataRoot, { recursive: true });
  await mkdir(join(dataRoot, "books"), { recursive: true });
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

  await writeFile(join(dataRoot, "books", "agent.epub"), buildInspectableEpub());

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
      'chunk-1b', 'book-1', 1, 'Tools',
      'Bounded chapter ranges keep external AI responses compact.',
      8, 'epubcfi(/6/12)', 'epubcfi(/6/13)', '["epubcfi(/6/12)"]', NULL, 6000
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
        tools: { count: 16 },
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

  it("creates an EPUB draft with editor profile without changing the source EPUB", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);
    const sourcePath = join(workspace.dataRoot, "books", "agent.epub");
    const sourceBefore = await readFile(sourcePath);

    const readonly = await runCommand(["epub", "draft", "create", "book-1"], workspace.env);
    expect(readonly).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const result = await runCommand(
      ["epub", "draft", "create", "book-1", "--profile", "editor"],
      workspace.env,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toMatchObject({
      draft: {
        bookId: "book-1",
        sourceFilePath: "books/agent.epub",
        draftFilePath: expect.stringMatching(/^drafts\/epub\/book-1-.+\/source\.epub$/),
        manifestPath: expect.stringMatching(/^drafts\/epub\/book-1-.+\/manifest\.json$/),
        historyPath: expect.stringMatching(/^drafts\/epub\/book-1-.+\/history\.jsonl$/),
        sourceHash: expect.any(String),
        inspect: {
          metadata: { title: "Agent Systems" },
        },
      },
    });

    const { draft } = result.data as {
      draft: {
        draftFilePath: string;
        manifestPath: string;
        historyPath: string;
        sourceHash: string;
      };
    };
    expect(draft.sourceHash).toHaveLength(64);
    expect(await readFile(sourcePath)).toEqual(sourceBefore);
    expect(await readFile(join(workspace.dataRoot, draft.draftFilePath))).toEqual(sourceBefore);

    const manifest = JSON.parse(
      await readFile(join(workspace.dataRoot, draft.manifestPath), "utf8"),
    );
    expect(manifest).toMatchObject({
      version: 1,
      bookId: "book-1",
      sourceFilePath: "books/agent.epub",
      draftFilePath: draft.draftFilePath,
      sourceHash: draft.sourceHash,
      status: "draft",
    });

    const history = await readFile(join(workspace.dataRoot, draft.historyPath), "utf8");
    expect(JSON.parse(history.trim())).toMatchObject({
      action: "epub.draft.create",
      bookId: "book-1",
      sourceHash: draft.sourceHash,
    });
  });

  it("reads an EPUB chapter from a draft with editor profile", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const draftResult = await runCommand(
      ["epub", "draft", "create", "book-1", "--profile", "editor"],
      workspace.env,
    );
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    const draftId = (draftResult.data as { draft: { draftId: string } }).draft.draftId;

    const readonly = await runCommand(
      ["epub", "chapter", "read", draftId, "chapter-1"],
      workspace.env,
    );
    expect(readonly).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const result = await runCommand(
      [
        "epub",
        "chapter",
        "read",
        draftId,
        "chapter-1",
        "--profile",
        "editor",
        "--limit",
        "12",
      ],
      workspace.env,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        chapter: {
          source: "draft",
          draftId,
          bookId: "book-1",
          id: "chapter-1",
          href: "chapter-1.xhtml",
          content: "Tools",
          contentTruncated: false,
        },
      });
    }
  });

  it("patches an EPUB draft chapter with editor profile", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);
    const sourcePath = join(workspace.dataRoot, "books", "agent.epub");
    const sourceBefore = await readFile(sourcePath);

    const draftResult = await runCommand(
      ["epub", "draft", "create", "book-1", "--profile", "editor"],
      workspace.env,
    );
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    const draftId = (draftResult.data as { draft: { draftId: string; historyPath: string } }).draft
      .draftId;
    const historyPath = (draftResult.data as { draft: { historyPath: string } }).draft.historyPath;
    const xhtmlPath = join(workspace.root, "chapter.xhtml");
    await writeFile(
      xhtmlPath,
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Updated Tools</h1><p>Draft chapter patched by the editor.</p></body></html>`,
      "utf8",
    );

    const readonly = await runCommand(
      ["epub", "chapter", "patch", draftId, "chapter-1", "--xhtml", xhtmlPath],
      workspace.env,
    );
    expect(readonly).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const result = await runCommand(
      [
        "epub",
        "chapter",
        "patch",
        draftId,
        "chapter-1",
        "--xhtml",
        xhtmlPath,
        "--profile",
        "editor",
      ],
      workspace.env,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      patch: {
        draftId,
        bookId: "book-1",
        chapterId: "chapter-1",
        href: "chapter-1.xhtml",
        resourcePath: "OPS/chapter-1.xhtml",
        changed: true,
        title: "Updated Tools",
        contentPreview: "Updated Tools Draft chapter patched by the editor.",
      },
    });

    expect(await readFile(sourcePath)).toEqual(sourceBefore);
    const readResult = await runCommand(
      ["epub", "chapter", "read", draftId, "chapter-1", "--profile", "editor"],
      workspace.env,
    );
    expect(readResult).toMatchObject({
      ok: true,
      data: {
        chapter: {
          title: "Updated Tools",
          content: "Updated Tools Draft chapter patched by the editor.",
        },
      },
    });

    const historyLines = (await readFile(join(workspace.dataRoot, historyPath), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(historyLines.at(-1)).toMatchObject({
      action: "epub.chapter.patch",
      draftId,
      bookId: "book-1",
      chapterId: "chapter-1",
    });
  });

  it("patches EPUB draft metadata with editor profile", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);
    const sourcePath = join(workspace.dataRoot, "books", "agent.epub");
    const sourceBefore = await readFile(sourcePath);

    const draftResult = await runCommand(
      ["epub", "draft", "create", "book-1", "--profile", "editor"],
      workspace.env,
    );
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    const draftId = (draftResult.data as { draft: { draftId: string; historyPath: string } }).draft
      .draftId;
    const historyPath = (draftResult.data as { draft: { historyPath: string } }).draft.historyPath;
    const patchPath = join(workspace.root, "metadata.json");
    await writeFile(
      patchPath,
      JSON.stringify({
        title: "Agent Systems Revised",
        creator: "Ada Editor",
        language: "zh-CN",
        publisher: "ReadAny Drafts",
        description: "Revised metadata from a controlled draft patch.",
        subjects: ["AI", "Agents"],
        modified: "2026-06-16T00:00:00Z",
      }),
      "utf8",
    );

    const readonly = await runCommand(
      ["epub", "metadata", "patch", draftId, "--patch", patchPath],
      workspace.env,
    );
    expect(readonly).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const result = await runCommand(
      [
        "epub",
        "metadata",
        "patch",
        draftId,
        "--patch",
        patchPath,
        "--profile",
        "editor",
      ],
      workspace.env,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      metadata: {
        draftId,
        bookId: "book-1",
        packagePath: "OPS/package.opf",
        changed: true,
        metadata: {
          title: "Agent Systems Revised",
          creator: "Ada Editor",
          language: "zh-CN",
          publisher: "ReadAny Drafts",
          description: "Revised metadata from a controlled draft patch.",
          modified: "2026-06-16T00:00:00Z",
          subjects: ["AI", "Agents"],
        },
      },
    });

    expect(await readFile(sourcePath)).toEqual(sourceBefore);
    const historyLines = (await readFile(join(workspace.dataRoot, historyPath), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(historyLines.at(-1)).toMatchObject({
      action: "epub.metadata.patch",
      draftId,
      bookId: "book-1",
      fields: ["title", "creator", "language", "publisher", "description", "modified", "subjects"],
    });
  });

  it("reads EPUB draft history with editor profile", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const draftResult = await runCommand(
      ["epub", "draft", "create", "book-1", "--profile", "editor"],
      workspace.env,
    );
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    const draftId = (draftResult.data as { draft: { draftId: string } }).draft.draftId;

    const readonly = await runCommand(["epub", "history", draftId], workspace.env);
    expect(readonly).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const result = await runCommand(
      ["epub", "history", draftId, "--profile", "editor"],
      workspace.env,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      history: {
        draftId,
        bookId: "book-1",
        status: "draft",
        historyPath: expect.stringMatching(/^drafts\/epub\/book-1-.+\/history\.jsonl$/),
        entries: [
          {
            action: "epub.draft.create",
            bookId: "book-1",
            draftId,
          },
        ],
      },
    });
  });

  it("discards an EPUB draft and blocks further draft access", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const draftResult = await runCommand(
      ["epub", "draft", "create", "book-1", "--profile", "editor"],
      workspace.env,
    );
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    const draftId = (draftResult.data as { draft: { draftId: string; historyPath: string } }).draft
      .draftId;
    const historyPath = (draftResult.data as { draft: { historyPath: string } }).draft.historyPath;

    const readonly = await runCommand(["epub", "draft", "discard", draftId], workspace.env);
    expect(readonly).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const discarded = await runCommand(
      ["epub", "draft", "discard", draftId, "--profile", "editor", "--reason", "no longer needed"],
      workspace.env,
    );
    expect(discarded.ok).toBe(true);
    if (!discarded.ok) return;
    expect(discarded.data).toMatchObject({
      discarded: {
        draftId,
        bookId: "book-1",
        status: "discarded",
        manifestPath: expect.stringMatching(/^drafts\/epub\/book-1-.+\/manifest\.json$/),
        historyPath: expect.stringMatching(/^drafts\/epub\/book-1-.+\/history\.jsonl$/),
      },
    });

    const manifest = JSON.parse(
      await readFile(join(workspace.dataRoot, `drafts/epub/${draftId}/manifest.json`), "utf8"),
    );
    expect(manifest.status).toBe("discarded");

    const historyLines = (await readFile(join(workspace.dataRoot, historyPath), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(historyLines.at(-1)).toMatchObject({
      action: "epub.draft.discard",
      draftId,
      bookId: "book-1",
      reason: "no longer needed",
    });

    const readAfterDiscard = await runCommand(
      ["epub", "chapter", "read", draftId, "chapter-1", "--profile", "editor"],
      workspace.env,
    );
    expect(readAfterDiscard).toMatchObject({
      ok: false,
      error: { code: "command_failed" },
    });
    if (!readAfterDiscard.ok) {
      expect(String(readAfterDiscard.error.message)).toMatch(/discarded/i);
    }
  });

  it("diffs an EPUB draft against the original with editor profile", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const draftResult = await runCommand(
      ["epub", "draft", "create", "book-1", "--profile", "editor"],
      workspace.env,
    );
    expect(draftResult.ok).toBe(true);
    if (!draftResult.ok) return;
    const draftId = (draftResult.data as { draft: { draftId: string } }).draft.draftId;

    const xhtmlPath = join(workspace.root, "chapter.xhtml");
    await writeFile(
      xhtmlPath,
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Diffed Tools</h1><p>Draft chapter changed before diff.</p></body></html>`,
      "utf8",
    );
    const patchResult = await runCommand(
      ["epub", "chapter", "patch", draftId, "chapter-1", "--xhtml", xhtmlPath, "--profile", "editor"],
      workspace.env,
    );
    expect(patchResult.ok).toBe(true);

    const readonly = await runCommand(["epub", "diff", draftId], workspace.env);
    expect(readonly).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const result = await runCommand(
      ["epub", "diff", draftId, "--profile", "editor"],
      workspace.env,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      diff: {
        draftId,
        bookId: "book-1",
        sourceFilePath: "books/agent.epub",
        draftFilePath: expect.stringMatching(/^drafts\/epub\/book-1-.+\/source\.epub$/),
        changedCount: 1,
        modifiedCount: 1,
        entries: expect.arrayContaining([
          expect.objectContaining({
            path: "OPS/chapter-1.xhtml",
            status: "modified",
            sourceHash: expect.any(String),
            draftHash: expect.any(String),
          }),
        ]),
      },
    });
    expect(JSON.stringify(result.data)).not.toContain(workspace.root);
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

  it("inspects an EPUB with editor profile", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const readonly = await runCommand(["epub", "inspect", "book-1"], workspace.env);
    expect(readonly).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });

    const result = await runCommand(
      ["epub", "inspect", "book-1", "--profile", "editor"],
      workspace.env,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        epub: {
          bookId: "book-1",
          filePath: "books/agent.epub",
          packagePath: "OPS/package.opf",
          metadata: {
            title: "Agent Systems",
            creator: "Ada Reader",
            language: "en",
          },
          manifest: { count: 2 },
          spine: { count: 1 },
          toc: {
            count: 1,
            items: [{ label: "Tools", href: "chapter-1.xhtml" }],
          },
        },
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
            chunkCount: 2,
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

  it("reads indexed chapter chunk ranges", async () => {
    const workspace = await createWorkspace();
    await seedLibrary(workspace.dataRoot);

    const result = await runCommand(
      ["chapter", "get", "book-1", "1", "--chunk-start", "2", "--chunk-count", "1"],
      workspace.env,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        chapter: {
          id: "1",
          chunkCount: 2,
          totalChunkCount: 2,
          returnedChunkCount: 1,
          chunkStart: 2,
          rangeTruncated: true,
          content: "Bounded chapter ranges keep external AI responses compact.",
          chunks: [{ id: "chunk-1b" }],
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
