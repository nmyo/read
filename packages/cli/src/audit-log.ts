import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { getCliPaths } from "./paths.js";
import type { AccessProfile } from "./profiles.js";

export type CliAuditEntry = {
  timestamp: string;
  source: "cli" | "mcp";
  action: string;
  profile?: AccessProfile;
  ok: boolean;
  code?: string;
};

export function getAuditLogFilePath(auditLogDir: string, timestamp: string): string {
  return join(auditLogDir, `${timestamp.slice(0, 10)}.jsonl`);
}

export async function appendCliAuditEntry(
  env: NodeJS.ProcessEnv,
  entry: CliAuditEntry,
): Promise<boolean> {
  try {
    const { auditLogDir } = getCliPaths(env);
    await mkdir(auditLogDir, { recursive: true });
    const path = getAuditLogFilePath(auditLogDir, entry.timestamp);
    await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}
