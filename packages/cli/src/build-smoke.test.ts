import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
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
  });
});
