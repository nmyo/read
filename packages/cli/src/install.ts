import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";

export type InstallMode = "user" | "global";

export type InstallOptions = {
  binPath: string;
  mode?: InstallMode;
  userBinDir?: string;
  globalBinDir?: string;
  platformName?: NodeJS.Platform;
};

export type InstallResult = {
  installed: true;
  path: string;
  target: string;
  mode: InstallMode;
};

export type UninstallResult = {
  removed: boolean;
  path: string;
  mode: InstallMode;
};

function getDefaultUserBinDir(platformName: NodeJS.Platform): string {
  if (platformName === "win32") {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "ReadAny", "bin");
  }

  return join(homedir(), ".local", "bin");
}

function getDefaultGlobalBinDir(platformName: NodeJS.Platform): string {
  if (platformName === "win32") {
    return join(process.env.ProgramFiles ?? "C:\\Program Files", "ReadAny", "bin");
  }

  return "/usr/local/bin";
}

export function resolveShimPath(options: InstallOptions): {
  path: string;
  mode: InstallMode;
  platformName: NodeJS.Platform;
} {
  const mode = options.mode ?? "user";
  const platformName = options.platformName ?? platform();
  const binDir =
    mode === "global"
      ? (options.globalBinDir ?? getDefaultGlobalBinDir(platformName))
      : (options.userBinDir ?? getDefaultUserBinDir(platformName));
  const commandName = platformName === "win32" ? "readany.cmd" : "readany";

  return {
    path: join(binDir, commandName),
    mode,
    platformName,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function assertManagedShim(shimPath: string): Promise<void> {
  if (!(await pathExists(shimPath))) return;

  const stat = await lstat(shimPath);
  if (stat.isSymbolicLink()) return;

  const name = basename(shimPath);
  throw new Error(`${name} already exists and is not managed by ReadAny CLI: ${shimPath}`);
}

export async function installCli(options: InstallOptions): Promise<InstallResult> {
  const shim = resolveShimPath(options);
  await mkdir(dirname(shim.path), { recursive: true });
  await assertManagedShim(shim.path);
  await rm(shim.path, { force: true });

  if (shim.platformName === "win32") {
    await writeFile(
      shim.path,
      `@echo off\r\nnode "${options.binPath}" %*\r\n`,
      "utf8",
    );
  } else {
    await symlink(options.binPath, shim.path);
    await chmod(options.binPath, 0o755).catch(() => {});
  }

  return {
    installed: true,
    path: shim.path,
    target: options.binPath,
    mode: shim.mode,
  };
}

export async function uninstallCli(options: InstallOptions): Promise<UninstallResult> {
  const shim = resolveShimPath(options);
  if (!(await pathExists(shim.path))) {
    return { removed: false, path: shim.path, mode: shim.mode };
  }

  await assertManagedShim(shim.path);
  await rm(shim.path, { force: true });
  return { removed: true, path: shim.path, mode: shim.mode };
}
