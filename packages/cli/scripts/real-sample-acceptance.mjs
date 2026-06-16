import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");
const repoRoot = resolve(cliRoot, "../..");
const binPath = resolve(cliRoot, "dist/bin/readany.js");

function parseArgs(argv) {
  const options = {
    bookId: undefined,
    epubBookId: undefined,
    pdfBookId: undefined,
    ragQuery: undefined,
    knowledgeQuery: undefined,
    exportDir: undefined,
    evidencePath: undefined,
    draftExport: false,
    readanyHome: process.env.READANY_HOME,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--book") {
      options.bookId = next;
      index += 1;
    } else if (arg === "--epub-book") {
      options.epubBookId = next;
      index += 1;
    } else if (arg === "--pdf-book") {
      options.pdfBookId = next;
      index += 1;
    } else if (arg === "--rag-query") {
      options.ragQuery = next;
      index += 1;
    } else if (arg === "--knowledge-query") {
      options.knowledgeQuery = next;
      index += 1;
    } else if (arg === "--export-dir") {
      options.exportDir = next;
      index += 1;
    } else if (arg === "--evidence") {
      options.evidencePath = next;
      index += 1;
    } else if (arg === "--readany-home") {
      options.readanyHome = next;
      index += 1;
    } else if (arg === "--draft-export") {
      options.draftExport = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return `ReadAny real sample acceptance helper

Usage:
  pnpm --filter @readany/cli acceptance:real -- --book <book-id> --rag-query <query> [options]

Readonly by default:
  --book <book-id>             Primary real sample book id for books/chapters/RAG checks.
  --epub-book <book-id>        EPUB book id for epub.inspect; defaults to --book.
  --pdf-book <book-id>         Optional PDF book id for PDF page fallback checks.
  --rag-query <query>          Query expected to return at least one RAG result.
  --knowledge-query <query>    Knowledge query; defaults to --rag-query.
  --readany-home <path>        ReadAny data root; defaults to READANY_HOME.
  --evidence <path>            Write JSON evidence to this path.

Explicit write/export mode:
  --draft-export               Create, validate, export, and re-inspect an EPUB draft.
  --export-dir <path>          Required with --draft-export; export target directory.
`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runCli(args, env) {
  const cliArgs = [...args, "--json"];
  const result = spawnSync(process.execPath, [binPath, ...cliArgs], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });
  const raw = result.status === 0 ? result.stdout : result.stderr || result.stdout;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      ok: false,
      error: { code: "invalid_json", message: raw.trim() || "CLI did not return JSON" },
    };
  }
  return {
    command: ["readany", ...cliArgs].join(" "),
    status: result.status,
    ok: parsed.ok === true,
    data: parsed.data,
    error: parsed.error,
  };
}

function requireOk(step) {
  if (!step.ok) {
    const message = step.error?.message ?? `Command failed with status ${step.status}`;
    throw new Error(`${step.command}: ${message}`);
  }
  return step.data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function firstChapter(chapters) {
  return chapters.find((chapter) => chapter.id) ?? null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  if (!options.readanyHome) {
    throw new Error("Set READANY_HOME or pass --readany-home <path>.");
  }
  if (!options.bookId) {
    throw new Error("Pass --book <book-id>.");
  }
  if (!options.ragQuery) {
    throw new Error("Pass --rag-query <query>.");
  }
  if (options.draftExport && !options.exportDir) {
    throw new Error("--draft-export requires --export-dir <path>.");
  }

  const evidencePath =
    options.evidencePath ??
    join(await mkdtemp(join(tmpdir(), "readany-real-acceptance-")), "evidence.json");
  const env = {
    ...process.env,
    READANY_HOME: options.readanyHome,
  };
  const checks = [];
  const commands = [];

  const record = (name, step, details = {}) => {
    commands.push({
      name,
      command: step.command,
      status: step.status,
      ok: step.ok,
      errorCode: step.error?.code,
      details,
    });
    checks.push(name);
  };

  const books = runCli(["books", "list", "--limit", "50"], env);
  const booksData = requireOk(books);
  assert(
    booksData.books.some((book) => book.id === options.bookId),
    `Book ${options.bookId} was not found in books.list`,
  );
  record("books.list contains primary real sample", books, { bookId: options.bookId });

  const book = runCli(["book", "get", options.bookId], env);
  const bookData = requireOk(book);
  assert(bookData.book?.id === options.bookId, "book.get did not return the primary book");
  record("book.get primary sample", book, {
    bookId: options.bookId,
    format: bookData.book?.format,
    title: bookData.book?.meta?.title,
  });

  const chapters = runCli(["chapters", "list", options.bookId], env);
  const chaptersData = requireOk(chapters);
  const chapter = firstChapter(chaptersData.chapters);
  assert(chapter, `No chapters were returned for ${options.bookId}`);
  record("chapters.list primary sample", chapters, {
    bookId: options.bookId,
    count: chaptersData.chapters.length,
    firstChapterId: chapter.id,
    firstChapterSource: chapter.source,
  });

  const chapterRead = runCli(["chapter", "get", options.bookId, chapter.id, "--limit", "4000"], env);
  const chapterReadData = requireOk(chapterRead);
  assert(
    typeof chapterReadData.chapter?.content === "string" &&
      chapterReadData.chapter.content.length > 0,
    `chapter.get returned empty content for ${options.bookId}/${chapter.id}`,
  );
  record("chapter.get primary sample", chapterRead, {
    bookId: options.bookId,
    chapterId: chapter.id,
    source: chapterReadData.chapter.source,
    contentLength: chapterReadData.chapter.content.length,
    contentHash: sha256(chapterReadData.chapter.content),
  });

  const rag = runCli(["rag", "search", options.ragQuery, "--book", options.bookId, "--mode", "bm25", "--limit", "3"], env);
  const ragData = requireOk(rag);
  assert(Array.isArray(ragData.results) && ragData.results.length > 0, "rag.search returned no results");
  record("rag.search primary sample", rag, {
    bookId: options.bookId,
    queryHash: sha256(options.ragQuery),
    count: ragData.results.length,
    firstChunkId: ragData.results[0]?.chunk?.id,
  });

  const knowledgeQuery = options.knowledgeQuery ?? options.ragQuery;
  const knowledge = runCli(["knowledge", "search", knowledgeQuery, "--book", options.bookId, "--limit", "5"], env);
  const knowledgeData = requireOk(knowledge);
  assert(
    Array.isArray(knowledgeData.knowledge?.results),
    "knowledge.search did not return a results array",
  );
  record("knowledge.search bounded sample", knowledge, {
    bookId: options.bookId,
    queryHash: sha256(knowledgeQuery),
    count: knowledgeData.knowledge.results.length,
  });

  const context = runCli(["context", "get", "--limit", "2000"], env);
  const contextData = requireOk(context);
  record("context.get bounded snapshot", context, {
    available: contextData.readerContext?.available === true,
    bookId: contextData.readerContext?.context?.bookId,
  });

  const epubBookId = options.epubBookId ?? (bookData.book?.format === "epub" ? options.bookId : undefined);
  if (epubBookId) {
    const inspect = runCli(["epub", "inspect", epubBookId, "--profile", "editor"], env);
    const inspectData = requireOk(inspect);
    assert(inspectData.epub?.spine?.items?.length > 0, "epub.inspect returned no spine items");
    record("epub.inspect real sample", inspect, {
      bookId: epubBookId,
      packagePath: inspectData.epub.packagePath,
      spineCount: inspectData.epub.spine.items.length,
      tocCount: inspectData.epub.toc?.items?.length ?? 0,
    });

    if (options.draftExport) {
      await mkdir(options.exportDir, { recursive: true });
      const draftCreate = runCli(["epub", "draft", "create", epubBookId, "--profile", "editor"], env);
      const draftData = requireOk(draftCreate);
      const draftId = draftData.draft?.draftId;
      assert(draftId, "epub.draft.create did not return draftId");
      record("epub.draft.create real sample", draftCreate, { bookId: epubBookId, draftId });

      const validate = runCli(["epub", "validate", draftId, "--profile", "publisher"], env);
      const validateData = requireOk(validate);
      assert(validateData.validation?.valid === true, "epub.validate did not pass for real sample draft");
      record("epub.validate real sample draft", validate, { draftId });

      const exportPath = join(options.exportDir, `readany-real-sample-${Date.now()}.epub`);
      const exported = runCli(["epub", "export", draftId, "--output", exportPath, "--profile", "publisher"], env);
      requireOk(exported);
      const exportedBytes = await readFile(exportPath);
      record("epub.export real sample draft", exported, {
        draftId,
        outputPath: exportPath,
        outputHash: sha256(exportedBytes),
        outputBytes: exportedBytes.byteLength,
      });
    }
  }

  if (options.pdfBookId) {
    const pdfChapters = runCli(["chapters", "list", options.pdfBookId], env);
    const pdfChaptersData = requireOk(pdfChapters);
    const pdfPage = pdfChaptersData.chapters.find((item) => item.source === "pdf");
    assert(pdfPage, `No PDF fallback pages were returned for ${options.pdfBookId}`);
    record("pdf chapters.list real sample", pdfChapters, {
      bookId: options.pdfBookId,
      count: pdfChaptersData.chapters.length,
      firstPageId: pdfPage.id,
    });

    const pdfRead = runCli(["chapter", "get", options.pdfBookId, pdfPage.id, "--limit", "4000"], env);
    const pdfReadData = requireOk(pdfRead);
    assert(pdfReadData.chapter?.source === "pdf", "PDF chapter.get did not return PDF source");
    record("pdf chapter.get real sample", pdfRead, {
      bookId: options.pdfBookId,
      pageId: pdfPage.id,
      contentLength: pdfReadData.chapter.content?.length ?? 0,
      contentHash: sha256(pdfReadData.chapter.content ?? ""),
    });
  }

  const audit = runCli(["audit", "list", "--limit", "20"], env);
  const auditData = requireOk(audit);
  record("audit.list bounded metadata", audit, {
    count: auditData.audit?.entries?.length ?? 0,
  });

  const evidence = {
    ok: true,
    generatedAt: new Date().toISOString(),
    readanyHome: options.readanyHome,
    bookId: options.bookId,
    epubBookId: options.epubBookId,
    pdfBookId: options.pdfBookId,
    draftExport: options.draftExport,
    checks,
    commands,
    note: "This helper records real-sample evidence. It does not replace manual external-agent or packaged-app matrix acceptance.",
  };

  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, evidencePath, checks }, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
