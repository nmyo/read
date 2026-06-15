import { lstat, readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installCli, resolveShimPath, uninstallCli } from "./install.js";

describe("cli install", () => {
  it("resolves user shim path", () => {
    expect(
      resolveShimPath({
        binPath: "/app/readany.js",
        userBinDir: "/tmp/bin",
        platformName: "darwin",
      }),
    ).toEqual({
      path: "/tmp/bin/readany",
      mode: "user",
      platformName: "darwin",
    });
  });

  it("installs and uninstalls a unix symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-install-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");

    const installed = await installCli({
      binPath,
      userBinDir,
      platformName: "darwin",
    });
    expect(installed).toMatchObject({
      installed: true,
      path: join(userBinDir, "readany"),
      target: binPath,
      mode: "user",
    });

    const stat = await lstat(installed.path);
    expect(stat.isSymbolicLink()).toBe(true);

    expect(
      await uninstallCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).toEqual({
      removed: true,
      path: join(userBinDir, "readany"),
      mode: "user",
    });
  });

  it("installs a Windows command shim", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-win-install-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");

    const installed = await installCli({
      binPath,
      userBinDir,
      platformName: "win32",
    });

    expect(installed.path).toBe(join(userBinDir, "readany.cmd"));
    expect(await readFile(installed.path, "utf8")).toContain(`node "${binPath}" %*`);
  });
});
