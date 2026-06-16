import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { CLI_VERSION } from "./version.js";
import type { AccessProfile } from "./profiles.js";
import type { CliPaths } from "./paths.js";
import { getSkillStatus } from "./skill.js";
import { listTools } from "./tool-registry.js";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  message: string;
};

export type DoctorReport = {
  version: string;
  profile: AccessProfile;
  paths: CliPaths;
  runtime: {
    node: string;
    executable: string;
    nativeSqliteAvailable: boolean;
    nativeSqlitePath?: string;
  };
  tools: {
    count: number;
  };
  mcp: {
    defaultProfile: AccessProfile;
    serveArgs: string[];
    supportedProfiles: AccessProfile[];
    supportedClients: string[];
    toolCount: number;
  };
  checks: DoctorCheck[];
};

async function canAccess(path: string, mode: number): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

function resolveNativeSqlite() {
  try {
    return import.meta.resolve("better-sqlite3");
  } catch {
    return undefined;
  }
}

export async function runDoctor(paths: CliPaths, profile: AccessProfile): Promise<DoctorReport> {
  await mkdir(paths.auditLogDir, { recursive: true });

  const skillStatus = await getSkillStatus(paths.skillFile);
  const readanyHomeWritable = await canAccess(paths.readanyHome, constants.W_OK);
  const auditLogWritable = await canAccess(paths.auditLogDir, constants.W_OK);
  const nativeSqlitePath = resolveNativeSqlite();
  const toolCount = listTools().length;

  return {
    version: CLI_VERSION,
    profile,
    paths,
    runtime: {
      node: process.version,
      executable: process.execPath,
      nativeSqliteAvailable: Boolean(nativeSqlitePath),
      nativeSqlitePath,
    },
    tools: {
      count: toolCount,
    },
    mcp: {
      defaultProfile: "readonly",
      serveArgs: ["mcp", "serve", "--profile", "readonly"],
      supportedProfiles: ["readonly", "assistant", "editor", "publisher"],
      supportedClients: ["generic", "claude", "cursor", "codex"],
      toolCount,
    },
    checks: [
      {
        name: "node-runtime",
        ok: true,
        message: `Node runtime is available at ${process.execPath} (${process.version}).`,
      },
      {
        name: "native-sqlite",
        ok: Boolean(nativeSqlitePath),
        message: nativeSqlitePath
          ? "better-sqlite3 is resolvable for library and MCP data commands."
          : "better-sqlite3 is not resolvable; management commands may work, but library and MCP data commands will fail.",
      },
      {
        name: "readany-home",
        ok: readanyHomeWritable,
        message: readanyHomeWritable
          ? "ReadAny home is writable."
          : "ReadAny home is not writable.",
      },
      {
        name: "audit-log",
        ok: auditLogWritable,
        message: auditLogWritable
          ? "CLI audit log directory is writable."
          : "CLI audit log directory is not writable.",
      },
      {
        name: "skill",
        ok: skillStatus.installed,
        message: skillStatus.installed
          ? `ReadAny skill is installed at ${skillStatus.path}.`
          : `ReadAny skill is not installed at ${skillStatus.path}.`,
      },
    ],
  };
}
