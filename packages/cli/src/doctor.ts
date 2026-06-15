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
  tools: {
    count: number;
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

export async function runDoctor(paths: CliPaths, profile: AccessProfile): Promise<DoctorReport> {
  await mkdir(paths.auditLogDir, { recursive: true });

  const skillStatus = await getSkillStatus(paths.skillFile);
  const readanyHomeWritable = await canAccess(paths.readanyHome, constants.W_OK);
  const auditLogWritable = await canAccess(paths.auditLogDir, constants.W_OK);

  return {
    version: CLI_VERSION,
    profile,
    paths,
    tools: {
      count: listTools().length,
    },
    checks: [
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
