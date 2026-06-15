import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
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

export type CliAuditQuery = {
  limit?: number;
  source?: CliAuditEntry["source"];
  ok?: boolean;
  actionPrefix?: string;
  date?: string;
};

export type CliAuditListResult = {
  entries: CliAuditEntry[];
  limit: number;
};

export function isCliAuditSource(value: string): value is CliAuditEntry["source"] {
  return value === "cli" || value === "mcp";
}

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

export async function listCliAuditEntries(
  env: NodeJS.ProcessEnv,
  query: CliAuditQuery = {},
): Promise<CliAuditListResult> {
  const { auditLogDir } = getCliPaths(env);
  const limit = clampLimit(query.limit);
  const files = await getAuditLogFiles(auditLogDir, query.date);
  const entries: CliAuditEntry[] = [];

  for (const file of files) {
    const content = await readTextIfPresent(join(auditLogDir, file));
    if (!content) continue;

    const lines = content.split("\n").filter(Boolean).reverse();
    for (const line of lines) {
      const entry = parseAuditEntry(line);
      if (!entry || !matchesAuditQuery(entry, query)) continue;
      entries.push(entry);
      if (entries.length >= limit) {
        return { entries, limit };
      }
    }
  }

  return { entries, limit };
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return 50;
  return Math.min(Math.floor(limit), 200);
}

async function getAuditLogFiles(auditLogDir: string, date: string | undefined): Promise<string[]> {
  if (date) return [`${date}.jsonl`];
  try {
    return (await readdir(auditLogDir))
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function readTextIfPresent(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function parseAuditEntry(line: string): CliAuditEntry | null {
  try {
    const parsed = JSON.parse(line) as Partial<CliAuditEntry>;
    if (
      typeof parsed.timestamp !== "string" ||
      (parsed.source !== "cli" && parsed.source !== "mcp") ||
      typeof parsed.action !== "string" ||
      typeof parsed.ok !== "boolean"
    ) {
      return null;
    }
    return {
      timestamp: parsed.timestamp,
      source: parsed.source,
      action: parsed.action,
      profile: parsed.profile,
      ok: parsed.ok,
      code: parsed.code,
    };
  } catch {
    return null;
  }
}

function matchesAuditQuery(entry: CliAuditEntry, query: CliAuditQuery): boolean {
  if (query.source && entry.source !== query.source) return false;
  if (typeof query.ok === "boolean" && entry.ok !== query.ok) return false;
  if (query.actionPrefix && !entry.action.startsWith(query.actionPrefix)) return false;
  return true;
}
