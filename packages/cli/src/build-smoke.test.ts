import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { seedLibrary } from "../scripts/agent-smoke.mjs";

const cliRoot = resolve(import.meta.dirname, "..");
const binPath = resolve(cliRoot, "dist/bin/readany.js");

function runBuiltCli(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd: cliRoot,
    env,
    encoding: "utf8",
  });
}

function runBuiltMcp(requests: unknown[], env: NodeJS.ProcessEnv): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, "mcp", "serve", "--profile", "readonly"], {
      cwd: cliRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `MCP smoke exited with ${code}: ${Buffer.concat(stderr).toString("utf8")}`,
          ),
        );
        return;
      }

      try {
        const lines = Buffer.concat(stdout).toString("utf8").trim().split("\n").filter(Boolean);
        resolve(lines.map((line) => JSON.parse(line)));
      } catch (error) {
        reject(error);
      }
    });

    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
    child.stdin.end();
  });
}

describe("built CLI smoke", () => {
  beforeAll(() => {
    const result = spawnSync(process.execPath, [resolve(cliRoot, "scripts/build.mjs")], {
      cwd: cliRoot,
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("runs management commands without loading better-sqlite3", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-built-smoke-"));
    const blockBetterSqlite = join(root, "block-better-sqlite.cjs");
    await writeFile(
      blockBetterSqlite,
      `
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "better-sqlite3") {
    throw new Error("better-sqlite3 should not be loaded for management commands");
  }
  return originalLoad.call(this, request, parent, isMain);
};
`,
      "utf8",
    );

    const env = {
      ...process.env,
      NODE_OPTIONS: `--require ${blockBetterSqlite}`,
      READANY_HOME: join(root, "readany-home"),
      AGENT_HOME: join(root, "agent"),
    };

    const version = runBuiltCli(["--version"], env);
    expect(version.status, version.stderr).toBe(0);
    expect(version.stdout.trim()).toBe("0.1.0");

    const status = runBuiltCli(["skill", "status", "--json"], env);
    expect(status.status, status.stderr).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      ok: true,
      data: { installed: false },
    });

    const doctor = runBuiltCli(["doctor", "--json"], env);
    expect(doctor.status, doctor.stderr).toBe(0);
    expect(JSON.parse(doctor.stdout)).toMatchObject({
      ok: true,
      data: {
        version: "0.1.0",
        runtime: {
          node: expect.stringMatching(/^v/),
          executable: process.execPath,
          nativeSqliteAvailable: true,
          nativeSqlitePath: expect.stringContaining("better-sqlite3"),
        },
        distribution: {
          kind: "node-script",
          usesNodeRuntime: true,
          nativeBinary: false,
          entrypoint: binPath,
          modulePath: binPath,
          bundleRoot: resolve(cliRoot, "dist"),
          builtBundle: true,
          desktopResourceBundle: false,
        },
        tools: { count: 28 },
        mcp: {
          defaultProfile: "readonly",
          serveArgs: ["mcp", "serve", "--profile", "readonly"],
          supportedProfiles: ["readonly", "assistant", "editor", "publisher"],
          supportedClients: ["generic", "claude", "cursor", "codex"],
          toolCount: 28,
        },
      },
    });

    const mcpConfig = runBuiltCli(["mcp", "config", "--json"], env);
    expect(mcpConfig.status, mcpConfig.stderr).toBe(0);
    expect(JSON.parse(mcpConfig.stdout)).toMatchObject({
      ok: true,
      data: {
        client: "generic",
        format: "json",
        profile: "readonly",
        snippet: expect.stringContaining('"mcpServers"'),
        mcpServers: {
          readany: {
            command: "readany",
            args: ["mcp", "serve", "--profile", "readonly"],
          },
        },
      },
    });
    const codexConfig = runBuiltCli(
      ["mcp", "config", "--client", "codex", "--json"],
      env,
    );
    expect(codexConfig.status, codexConfig.stderr).toBe(0);
    expect(JSON.parse(codexConfig.stdout)).toMatchObject({
      ok: true,
      data: {
        client: "codex",
        format: "toml",
        profile: "readonly",
        snippet: expect.stringContaining("[mcp_servers.readany]"),
      },
    });

    const tools = runBuiltCli(["tools", "list", "--json"], env);
    expect(tools.status, tools.stderr).toBe(0);
    expect(JSON.parse(tools.stdout)).toMatchObject({
      ok: true,
      data: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "books.list" }),
          expect.objectContaining({ name: "epub.export" }),
        ]),
      },
    });

    const install = runBuiltCli(["skill", "install", "--json"], env);
    expect(install.status, install.stderr).toBe(0);
    expect(JSON.parse(install.stdout)).toMatchObject({
      ok: true,
      data: { installed: true, version: "0.1.0" },
    });

    const update = runBuiltCli(["skill", "update", "--json"], env);
    expect(update.status, update.stderr).toBe(0);
    expect(JSON.parse(update.stdout)).toMatchObject({
      ok: true,
      data: { updated: true, version: "0.1.0" },
    });

    const installedStatus = runBuiltCli(["skill", "status", "--json"], env);
    expect(installedStatus.status, installedStatus.stderr).toBe(0);
    expect(JSON.parse(installedStatus.stdout)).toMatchObject({
      ok: true,
      data: { installed: true, version: "0.1.0" },
    });

    const uninstall = runBuiltCli(["skill", "uninstall", "--json"], env);
    expect(uninstall.status, uninstall.stderr).toBe(0);
    expect(JSON.parse(uninstall.stdout)).toMatchObject({
      ok: true,
      data: { removed: true },
    });
  });

  it("serves MCP over stdio from the built CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-built-mcp-"));
    const env = {
      ...process.env,
      READANY_HOME: join(root, "readany-home"),
      AGENT_HOME: join(root, "agent"),
    };
    const responses = await runBuiltMcp(
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "books.list",
            arguments: { limit: 1 },
          },
        },
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "epub.export",
            arguments: {
              draftId: "draft-smoke",
              outputPath: join(root, "exports", "blocked.epub"),
            },
          },
        },
      ],
      env,
    );

    expect(responses).toHaveLength(4);
    expect(responses[0]).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "readany" } },
    });
    expect(responses[1]).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: [
          { name: "books.list" },
          { name: "books.search" },
          { name: "books.get" },
          { name: "chapters.list" },
          { name: "chapters.get" },
          { name: "context.get" },
          { name: "bookmarks.list" },
          { name: "skills.list" },
          { name: "notes.search" },
          { name: "notes.export" },
          { name: "knowledge.export" },
          { name: "knowledge.search" },
          { name: "highlights.search" },
          { name: "rag.search" },
          { name: "audit.list" },
          { name: "epub.inspect" },
          { name: "epub.draft.create" },
          { name: "epub.draft.discard" },
          { name: "epub.chapter.read" },
          { name: "epub.chapter.patch" },
          { name: "epub.chapters.patch" },
          { name: "epub.metadata.patch" },
          { name: "epub.toc.rebuild" },
          { name: "epub.history" },
          { name: "epub.diff" },
          { name: "epub.undo" },
          { name: "epub.validate" },
          { name: "epub.export" },
        ],
      },
    });
    expect(responses[2]).toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      result: {
        isError: false,
      },
    });

    const toolResult = JSON.parse(
      (responses[2] as { result: { content: Array<{ text: string }> } }).result.content[0].text,
    );
    expect(toolResult).toMatchObject({
      ok: true,
      data: { books: [] },
    });

    expect(responses[3]).toMatchObject({
      jsonrpc: "2.0",
      id: 4,
      result: {
        isError: true,
      },
    });
    const deniedResult = JSON.parse(
      (responses[3] as { result: { content: Array<{ text: string }> } }).result.content[0].text,
    );
    expect(deniedResult).toMatchObject({
      ok: false,
      error: { code: "permission_denied" },
    });
  });

  it("runs the external agent MCP smoke workflow", () => {
    const result = spawnSync(process.execPath, [resolve(cliRoot, "scripts/agent-smoke.mjs")], {
      cwd: cliRoot,
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    const summary = JSON.parse(result.stdout) as {
      ok: boolean;
      checks: string[];
      exportPath: string;
      sourceHash: string;
      exportHash: string;
    };
    expect(summary).toMatchObject({
      ok: true,
      checks: expect.arrayContaining([
        "readonly MCP initialize/tools/list/books.search/rag.search",
        "copyable MCP config snippets",
        "tools/list safety metadata",
        "readonly PDF fallback chapters.list/chapters.get",
        "readonly write denial",
        "editor draft create, batch chapter patch, and toc rebuild",
        "publisher validate and export",
        "MCP audit export entry",
        "source EPUB hash unchanged",
        "exported EPUB reimport inspect and chapter reads",
      ]),
      exportPath: expect.stringMatching(/agent-smoke-export\.epub$/),
      sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      exportHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("runs real-sample acceptance helper against fixture data", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-real-acceptance-"));
    const dataRoot = join(root, "library");
    const env = {
      ...process.env,
      READANY_HOME: dataRoot,
      AGENT_HOME: join(root, "agent"),
    };
    expect(runBuiltCli(["doctor", "--json"], env).status).toBe(0);
    expect(runBuiltCli(["books", "list", "--json"], env).status).toBe(0);
    await seedLibrary(dataRoot);

    const evidencePath = join(root, "evidence", "real-sample.json");
    const exportDir = join(root, "exports");
    const result = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/real-sample-acceptance.mjs"),
        "--readany-home",
        dataRoot,
        "--book",
        "agent-smoke-book",
        "--epub-book",
        "agent-smoke-book",
        "--pdf-book",
        "agent-smoke-pdf",
        "--rag-query",
        "bounded MCP",
        "--draft-export",
        "--export-dir",
        exportDir,
        "--evidence",
        evidencePath,
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout) as {
      ok: boolean;
      checks: string[];
      evidencePath: string;
      summary: {
        commandCount: number;
        checkCount: number;
        sampleFileCount: number;
        sampleFormats: string[];
        citationTargetCount: number;
        citationTargetTypes: string[];
        draftExport: boolean;
        pdfChecked: boolean;
        doctorFailedChecks: string[];
        manualAcceptanceRequiredCount: number;
        manualAcceptanceRequiredIds: string[];
      };
    };
    expect(output).toMatchObject({
      ok: true,
      evidencePath,
      checks: expect.arrayContaining([
        "doctor runtime and MCP diagnostics",
        "books.list contains primary real sample",
        "chapter.get primary sample",
        "rag.search primary sample",
        "epub.inspect real sample",
        "epub.export real sample draft",
        "epub.export inspect real sample output",
        "epub.draft.discard real sample cleanup",
        "pdf chapter.get real sample",
        "audit.list bounded metadata",
      ]),
      summary: {
        commandCount: expect.any(Number),
        checkCount: expect.any(Number),
        sampleFileCount: 2,
        sampleFormats: expect.arrayContaining(["epub", "pdf"]),
        citationTargetCount: expect.any(Number),
        citationTargetTypes: expect.arrayContaining(["chapter", "rag-chunk", "pdf-page"]),
        draftExport: true,
        pdfChecked: true,
        doctorFailedChecks: expect.any(Array),
        manualAcceptanceRequiredCount: 6,
        manualAcceptanceRequiredIds: expect.arrayContaining([
          "external-agent-clients",
          "packaged-app-matrix",
          "runtime-bundle",
        ]),
      },
    });

    const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as {
      environment: {
        platform: string;
        arch: string;
        node: string;
        pnpm: string;
        cliVersion: string;
        gitCommit: string;
        gitBranch: string;
      };
      doctor: {
        version: string;
        runtime: {
          node: string;
          executable: string;
          nativeSqliteAvailable: boolean;
        };
        distribution: {
          kind: string;
          usesNodeRuntime: boolean;
          nativeBinary: boolean;
          entrypoint?: string;
          modulePath: string;
          bundleRoot?: string;
          builtBundle: boolean;
          desktopResourceBundle: boolean;
        };
        tools: {
          count: number;
        };
        mcp: {
          defaultProfile: string;
          serveArgs: string[];
          supportedProfiles: string[];
          supportedClients: string[];
          toolCount: number;
        };
        checks: Array<{
          name: string;
          ok: boolean;
          message: string;
        }>;
      };
      sampleFiles: Array<{
        labels: string[];
        bookId: string;
        format: string;
        filePath: string;
        absoluteFilePath: string;
        bytes: number;
        sha256: string;
      }>;
      citationTargets: Array<{
        type: string;
        bookId: string;
        chapterId?: string;
        chunkId?: string;
        chapterIndex?: number;
        chapterTitle?: string;
        page?: number;
        cfi?: string;
        startCfi?: string;
        endCfi?: string;
        source?: string;
        matchType?: string;
      }>;
      summary: typeof output.summary;
      manualAcceptanceRequired: Array<{
        id: string;
        label: string;
        evidence: string[];
        commands: string[];
      }>;
    };
    expect(evidence.environment).toMatchObject({
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cliVersion: "0.1.0",
      gitCommit: expect.stringMatching(/^unavailable|[a-f0-9]{40}$/),
      gitBranch: expect.any(String),
      pnpm: expect.any(String),
    });
    expect(evidence.doctor).toMatchObject({
      version: "0.1.0",
      runtime: {
        node: process.version,
        executable: process.execPath,
        nativeSqliteAvailable: true,
      },
      distribution: {
        kind: "node-script",
        usesNodeRuntime: true,
        nativeBinary: false,
        entrypoint: binPath,
        modulePath: binPath,
        bundleRoot: resolve(cliRoot, "dist"),
        builtBundle: true,
        desktopResourceBundle: false,
      },
      tools: { count: 28 },
      mcp: {
        defaultProfile: "readonly",
        serveArgs: ["mcp", "serve", "--profile", "readonly"],
        supportedProfiles: ["readonly", "assistant", "editor", "publisher"],
        supportedClients: ["generic", "claude", "cursor", "codex"],
        toolCount: 28,
      },
      checks: expect.arrayContaining([
        expect.objectContaining({ name: "node-runtime", ok: true }),
        expect.objectContaining({ name: "native-sqlite", ok: true }),
      ]),
    });
    expect(evidence.summary).toEqual(output.summary);
    expect(evidence.summary.commandCount).toBe(evidence.commands.length);
    expect(evidence.summary.checkCount).toBe(evidence.checks.length);
    expect(evidence.summary.citationTargetCount).toBe(evidence.citationTargets.length);
    expect(evidence.citationTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "chapter",
          bookId: "agent-smoke-book",
          chapterId: expect.any(String),
          startCfi: expect.stringMatching(/^epubcfi/),
        }),
        expect.objectContaining({
          type: "rag-chunk",
          bookId: "agent-smoke-book",
          chunkId: expect.any(String),
          cfi: expect.stringMatching(/^epubcfi/),
          startCfi: expect.stringMatching(/^epubcfi/),
          matchType: "bm25",
        }),
        expect.objectContaining({
          type: "pdf-page",
          bookId: "agent-smoke-pdf",
          chapterId: "page-1",
          page: 1,
          cfi: "page:1",
          source: "pdf",
        }),
      ]),
    );
    expect(evidence.sampleFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.arrayContaining(["primary", "epub"]),
          bookId: "agent-smoke-book",
          format: "epub",
          filePath: "books/agent-smoke.epub",
          absoluteFilePath: join(dataRoot, "books", "agent-smoke.epub"),
          bytes: expect.any(Number),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          labels: ["pdf"],
          bookId: "agent-smoke-pdf",
          format: "pdf",
          filePath: "books/agent-smoke.pdf",
          absoluteFilePath: join(dataRoot, "books", "agent-smoke.pdf"),
          bytes: expect.any(Number),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );
    expect(evidence.sampleFiles.every((sample) => sample.bytes > 0)).toBe(true);
    expect(evidence.manualAcceptanceRequired).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "external-agent-clients" }),
        expect.objectContaining({ id: "packaged-app-matrix" }),
        expect.objectContaining({ id: "runtime-bundle" }),
      ]),
    );
    expect(evidence.manualAcceptanceRequired).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "external-agent-clients",
          evidence: expect.arrayContaining(["tools/list output"]),
          commands: expect.arrayContaining([
            "readany mcp config --client codex --profile readonly --json",
            "readany audit list --source mcp --json",
          ]),
        }),
        expect.objectContaining({
          id: "runtime-bundle",
          evidence: expect.arrayContaining(["nativeSqliteAvailable and nativeSqlitePath"]),
          commands: expect.arrayContaining(["readany doctor --json"]),
        }),
      ]),
    );

    const validateEvidence = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/validate-acceptance.mjs"),
        "--evidence",
        evidencePath,
        "--json",
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );
    expect(validateEvidence.status, validateEvidence.stderr).toBe(0);
    expect(JSON.parse(validateEvidence.stdout)).toMatchObject({
      ok: true,
      validated: { evidence: evidencePath },
      errors: [],
    });

    const scaffoldPath = join(root, "evidence", "scaffold-record.md");
    const scaffold = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/scaffold-acceptance-record.mjs"),
        "--evidence",
        evidencePath,
        "--output",
        scaffoldPath,
        "--milestone",
        "M5 test scaffold",
        "--reviewer",
        "Vitest",
        "--desktop-package",
        "fixture package",
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );
    expect(scaffold.status, scaffold.stderr).toBe(0);
    expect(JSON.parse(scaffold.stdout)).toMatchObject({ ok: true, outputPath: scaffoldPath });
    const scaffoldRecord = await readFile(scaffoldPath, "utf8");
    expect(scaffoldRecord).toContain("## Manual Acceptance Closure");
    expect(scaffoldRecord).toContain(`sample SHA-256：${evidence.sampleFiles[0]?.sha256}`);
    expect(scaffoldRecord).toContain(
      `citation target：${evidence.citationTargets.find((target) => target.type === "rag-chunk")?.cfi}`,
    );
    expect(scaffoldRecord).toContain("distribution：builtBundle: true");
    expect(scaffoldRecord).toContain("sample-source | pending");

    const validateScaffold = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/validate-acceptance.mjs"),
        "--record",
        scaffoldPath,
        "--evidence",
        evidencePath,
        "--json",
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );
    expect(validateScaffold.status, validateScaffold.stderr).toBe(0);
    expect(JSON.parse(validateScaffold.stdout)).toMatchObject({
      ok: true,
      validated: { record: scaffoldPath, evidence: evidencePath },
    });

    const strictScaffold = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/validate-acceptance.mjs"),
        "--record",
        scaffoldPath,
        "--evidence",
        evidencePath,
        "--strict-m5",
        "--json",
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );
    expect(strictScaffold.status).toBe(1);
    expect(JSON.parse(strictScaffold.stdout)).toMatchObject({
      ok: false,
      strictM5: true,
      errors: expect.arrayContaining([
        "Strict M5 record still has unchecked scope items.",
        "Strict M5 record result is not a full pass.",
      ]),
    });

    const partialRecordPath = resolve(
      cliRoot,
      "../../docs/readany-cli/acceptance/2026-06-16-m3-m4-implementation.md",
    );
    const validatePartialRecord = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/validate-acceptance.mjs"),
        "--record",
        partialRecordPath,
        "--json",
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );
    expect(validatePartialRecord.status, validatePartialRecord.stderr).toBe(0);
    expect(JSON.parse(validatePartialRecord.stdout)).toMatchObject({
      ok: true,
      warnings: expect.arrayContaining([
        "Record is marked partial; use --strict-m5 only for final M5 acceptance.",
      ]),
    });

    const validateViaPackageScript = spawnSync(
      "pnpm",
      [
        "--filter",
        "@readany/cli",
        "acceptance:validate",
        "--",
        "--record",
        "docs/readany-cli/acceptance/2026-06-16-m3-m4-implementation.md",
        "--json",
      ],
      {
        cwd: resolve(cliRoot, "../.."),
        env,
        encoding: "utf8",
        shell: process.platform === "win32",
      },
    );
    expect(validateViaPackageScript.status, validateViaPackageScript.stderr).toBe(0);
    expect(JSON.parse(validateViaPackageScript.stdout.match(/\{[\s\S]*\}\s*$/)?.[0] ?? "{}")).toMatchObject({
      ok: true,
    });

    const strictPartialRecord = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/validate-acceptance.mjs"),
        "--record",
        partialRecordPath,
        "--strict-m5",
        "--json",
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );
    expect(strictPartialRecord.status).toBe(1);
    expect(JSON.parse(strictPartialRecord.stdout)).toMatchObject({
      ok: false,
      strictM5: true,
      errors: expect.arrayContaining([
        "Strict M5 record still has unchecked scope items.",
        "Strict M5 record result is not a full pass.",
        "Strict M5 record must include at least two completed external agent rows.",
        "Strict M5 record must include macOS in the packaged app matrix.",
      ]),
    });

    const strictRecordPath = join(root, "evidence", "strict-m5-record.md");
    await writeFile(
      strictRecordPath,
      `# ReadAny CLI M5 Acceptance

## 基本信息
- 日期：2026-06-16

## 本次验收范围
- [x] CLI 基础命令
- [x] 外部 agent 接入
- [x] macOS / Windows / Linux install matrix

## 本次明确不验收
-

## 执行命令
\`\`\`bash
pnpm --filter @readany/cli acceptance:validate -- --strict-m5
\`\`\`

## 验收结果
\`\`\`text
通过
\`\`\`

## 证据摘要
- CLI check：pass

## 安全边界证据
- readonly 写入拒绝：pass

## 真实样本证据
- RAG result 引用字段：pass

## 外部 Agent 证据
| 客户端 | 版本 | MCP 配置 profile | tools/list | read flow | draft/export flow | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| Codex | 1.0.0 | readonly/editor/publisher | pass | pass | pass | pass |
| Claude Desktop | 2.0.0 | readonly/editor/publisher | pass | pass | pass | pass |

## 打包 / 安装矩阵
| 平台 | 包来源 | 安装 | \`readany doctor --json\` | Skill install/status | MCP initialize/tools/list | Draft export | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| macOS | release dmg | pass | pass | pass | pass | pass | pass |
| Windows | release msi | pass | pass | pass | pass | pass | pass |
| Linux | release appimage | pass | pass | pass | pass | pass | pass |

## Manual Acceptance Closure
| id | status | evidence | owner |
| --- | --- | --- | --- |
| sample-source | resolved | sample source recorded | QA |
| external-agent-clients | resolved | Codex and Claude Desktop rows complete | QA |
| desktop-settings | resolved | settings page evidence attached | QA |
| packaged-app-matrix | resolved | macOS Windows Linux matrix complete | QA |
| reader-jumpback | resolved | citation target evidence attached | QA |
| runtime-bundle | resolved | doctor distribution evidence attached | QA |

## 当前可对外说明
- M5 complete.

## 当前不能对外宣称
-

## 已知问题
-

## 是否允许进入下一阶段
- [x] 是
`,
      "utf8",
    );
    const strictFullRecord = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/validate-acceptance.mjs"),
        "--record",
        strictRecordPath,
        "--strict-m5",
        "--json",
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );
    expect(strictFullRecord.status, strictFullRecord.stderr || strictFullRecord.stdout).toBe(0);
    expect(JSON.parse(strictFullRecord.stdout)).toMatchObject({
      ok: true,
      strictM5: true,
      errors: [],
    });

    const strictFullRecordWithEvidence = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/validate-acceptance.mjs"),
        "--record",
        strictRecordPath,
        "--evidence",
        evidencePath,
        "--strict-m5",
        "--json",
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );
    expect(strictFullRecordWithEvidence.status).toBe(1);
    expect(JSON.parse(strictFullRecordWithEvidence.stdout)).toMatchObject({
      ok: false,
      strictM5: true,
      errors: expect.arrayContaining([
        "Strict M5 record must reference at least one sample SHA-256 from evidence.",
        "Strict M5 record must reference at least one citation target from evidence.",
        "Strict M5 record must reference doctor distribution flags from evidence.",
      ]),
    });

    const anchoredStrictRecordPath = join(root, "evidence", "strict-m5-record-with-anchors.md");
    await writeFile(
      anchoredStrictRecordPath,
      `${await readFile(strictRecordPath, "utf8")}

## Evidence Anchors
- sample SHA-256：${evidence.sampleFiles[0]?.sha256}
- citation target：${evidence.citationTargets.find((target) => target.type === "rag-chunk")?.cfi}
- distribution：builtBundle: true
- distribution：desktopResourceBundle: false
- distribution：nativeBinary: false
`,
      "utf8",
    );
    const anchoredStrictFullRecord = spawnSync(
      process.execPath,
      [
        resolve(cliRoot, "scripts/validate-acceptance.mjs"),
        "--record",
        anchoredStrictRecordPath,
        "--evidence",
        evidencePath,
        "--strict-m5",
        "--json",
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
      },
    );
    expect(anchoredStrictFullRecord.status, anchoredStrictFullRecord.stderr || anchoredStrictFullRecord.stdout).toBe(0);
    expect(JSON.parse(anchoredStrictFullRecord.stdout)).toMatchObject({
      ok: true,
      strictM5: true,
      errors: [],
    });
  });
});
