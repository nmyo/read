import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

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
        tools: { count: 28 },
      },
    });

    const mcpConfig = runBuiltCli(["mcp", "config", "--json"], env);
    expect(mcpConfig.status, mcpConfig.stderr).toBe(0);
    expect(JSON.parse(mcpConfig.stdout)).toMatchObject({
      ok: true,
      data: {
        mcpServers: {
          readany: {
            command: "readany",
            args: ["mcp", "serve", "--profile", "readonly"],
          },
        },
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
});
