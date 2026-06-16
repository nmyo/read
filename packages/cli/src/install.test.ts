import { lstat, readFile, mkdir, symlink, writeFile } from "node:fs/promises";
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
    const content = await readFile(installed.path, "utf8");
    expect(content).toContain("readany-cli-managed");
    expect(content).toContain(`node "${binPath}" %*`);

    expect(
      await uninstallCli({
        binPath,
        userBinDir,
        platformName: "win32",
      }),
    ).toEqual({
      removed: true,
      path: join(userBinDir, "readany.cmd"),
      mode: "user",
    });
  });

  it("does not overwrite or remove unmanaged user commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-unmanaged-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");
    const unmanaged = join(userBinDir, "readany");
    await mkdir(userBinDir, { recursive: true });
    await writeFile(unmanaged, "#!/bin/sh\necho user command\n", "utf8");

    await expect(
      installCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);

    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);
    expect(await readFile(unmanaged, "utf8")).toContain("user command");
  });

  it("does not overwrite or remove symlinks to a different target", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-other-symlink-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const otherTarget = join(root, "other", "readany.js");
    const userBinDir = join(root, "bin");
    const unmanaged = join(userBinDir, "readany");
    await mkdir(userBinDir, { recursive: true });
    await mkdir(join(root, "other"), { recursive: true });
    await writeFile(otherTarget, "#!/usr/bin/env node\n", "utf8");
    await symlink(otherTarget, unmanaged);

    await expect(
      installCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);

    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "darwin",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);

    const stat = await lstat(unmanaged);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it("does not remove unmanaged Windows command shims", async () => {
    const root = await mkdtemp(join(tmpdir(), "readany-cli-win-unmanaged-"));
    const binPath = join(root, "dist", "bin", "readany.js");
    const userBinDir = join(root, "bin");
    const unmanaged = join(userBinDir, "readany.cmd");
    await mkdir(userBinDir, { recursive: true });
    await writeFile(unmanaged, "@echo off\r\necho user command\r\n", "utf8");

    await expect(
      installCli({
        binPath,
        userBinDir,
        platformName: "win32",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);

    await expect(
      uninstallCli({
        binPath,
        userBinDir,
        platformName: "win32",
      }),
    ).rejects.toThrow(/not managed by ReadAny CLI/);
    expect(await readFile(unmanaged, "utf8")).toContain("user command");
  });
});
