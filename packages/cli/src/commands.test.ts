import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCommand, runCommand } from "./commands.js";

async function createEnv(): Promise<NodeJS.ProcessEnv> {
  const root = await mkdtemp(join(tmpdir(), "readany-cli-command-"));
  return {
    ...process.env,
    AGENT_HOME: join(root, "agent"),
    READANY_HOME: join(root, "readany"),
  };
}

describe("commands", () => {
  it("parses json and profile flags", () => {
    expect(parseCommand(["doctor", "--json", "--profile", "editor"])).toEqual({
      name: "doctor",
      args: [],
      json: true,
      profile: "editor",
    });
  });

  it("returns version", async () => {
    const result = await runCommand(["--version"], await createEnv());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe("0.1.0");
  });

  it("installs and reports skill status", async () => {
    const env = await createEnv();
    const install = await runCommand(["skill", "install"], env);
    expect(install.ok).toBe(true);

    const status = await runCommand(["skill", "status"], env);
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.data).toMatchObject({ installed: true });
    }
  });

  it("runs doctor with readonly profile", async () => {
    const result = await runCommand(["doctor", "--profile", "readonly"], await createEnv());
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
    const result = await runCommand(["mcp", "serve", "--profile", "readonly"], await createEnv());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_implemented");
      expect(result.error.message).toContain("MCP server is not implemented yet");
    }
  });
});
