import { homedir, platform } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type CliPaths = {
  packageRoot: string;
  binPath: string;
  agentHome: string;
  skillDir: string;
  skillFile: string;
  readanyHome: string;
  auditLogDir: string;
};

export function resolvePackageRoot(metaUrl = import.meta.url): string {
  const currentFile = fileURLToPath(metaUrl);
  const currentDir = dirname(currentFile);
  return resolve(currentDir, "..");
}

export function resolveBinPath(metaUrl = import.meta.url): string {
  const currentFile = fileURLToPath(metaUrl);
  const currentDir = dirname(currentFile);
  const packageRoot = resolvePackageRoot(metaUrl);
  return currentDir.includes(`${sep}dist`)
    ? join(packageRoot, "dist", "bin", "readany.js")
    : join(packageRoot, "src", "bin", "readany.ts");
}

export function getAgentHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.AGENT_HOME ? resolve(env.AGENT_HOME) : join(homedir(), ".agent");
}

export function getReadAnyHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.READANY_HOME) return resolve(env.READANY_HOME);

  if (platform() === "win32") {
    return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "ReadAny");
  }

  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "ReadAny");
  }

  return join(env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "readany");
}

export function getCliPaths(env: NodeJS.ProcessEnv = process.env): CliPaths {
  const packageRoot = resolvePackageRoot();
  const agentHome = getAgentHome(env);
  const readanyHome = getReadAnyHome(env);
  const skillDir = join(agentHome, "skills", "readany");

  return {
    packageRoot,
    binPath: resolveBinPath(),
    agentHome,
    skillDir,
    skillFile: join(skillDir, "SKILL.md"),
    readanyHome,
    auditLogDir: join(readanyHome, "logs", "cli"),
  };
}
