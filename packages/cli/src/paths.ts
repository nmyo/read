import { homedir } from "node:os";
import { platform } from "node:os";
import { dirname, join, resolve } from "node:path";
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

function resolveExecutablePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.READANY_CLI_BIN_PATH || process.argv[1] || fileURLToPath(import.meta.url);
}

export function resolvePackageRoot(env: NodeJS.ProcessEnv = process.env): string {
  const executablePath = resolveExecutablePath(env);
  return resolve(dirname(executablePath), "..", "..");
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
  const packageRoot = resolvePackageRoot(env);
  const agentHome = getAgentHome(env);
  const readanyHome = getReadAnyHome(env);
  const skillDir = join(agentHome, "skills", "readany");
  const binPath = resolveExecutablePath(env);

  return {
    packageRoot,
    binPath,
    agentHome,
    skillDir,
    skillFile: join(skillDir, "SKILL.md"),
    readanyHome,
    auditLogDir: join(readanyHome, "logs", "cli"),
  };
}
