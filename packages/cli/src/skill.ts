import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CLI_VERSION } from "./version.js";

export type SkillStatus = {
  installed: boolean;
  path: string;
  version?: string;
};

export type SkillInstallResult = {
  installed: true;
  path: string;
  version: string;
};

export type SkillUninstallResult = {
  removed: boolean;
  path: string;
};

const MANAGED_MARKER = "<!-- readany-cli-managed -->";

export function createSkillContent(version = CLI_VERSION): string {
  return `${MANAGED_MARKER}
---
name: readany
description: Use ReadAny CLI and MCP to safely access the user's local ReadAny library, notes, knowledge base, RAG context, and EPUB draft workflows.
---

# ReadAny

Use this skill when the user asks an external AI agent to search, read, organize, or edit content stored in ReadAny.

## Capabilities

- Read book metadata, chapters, highlights, notes, bookmarks, and skills.
- Search ReadAny with metadata, keyword, semantic retrieval, and knowledge tools.
- Read the current reader context snapshot when the desktop client provides one.
- Use draft-first EPUB editing workflows when an editing profile is enabled.
- Patch EPUB chapters, metadata, toc, history, diff, undo, validate, and export through ReadAny drafts.
- Export new artifacts only when the active profile allows export.
- Ask the user before high-risk actions.

## Safety Rules

- Start with readonly access unless the user explicitly asks for editing or publishing.
- Never request arbitrary shell, arbitrary SQL, or unrestricted filesystem access.
- Do not overwrite original books; use ReadAny drafts and exports.
- For destructive or high-risk actions, ask the user to confirm in ReadAny.

## Commands

\`\`\`bash
readany doctor --json
readany mcp serve --profile readonly
readany books list --json
readany bookmarks list <book-id> --json
readany skills list --json
readany epub draft create <book-id> --profile editor --json
readany epub chapter patch <draft-id> <chapter-id> --xhtml <file> --profile editor --json
readany epub metadata patch <draft-id> --patch <file> --profile editor --json
readany epub toc rebuild <draft-id> --profile editor --json
readany epub undo <draft-id> <operation-id> --profile editor --json
readany epub validate <draft-id> --profile publisher --json
readany epub export <draft-id> --output <path> --profile publisher --json
readany skill status --json
\`\`\`

Managed by ReadAny CLI ${version}.
`;
}

function parseSkillVersion(content: string): string | undefined {
  const match = content.match(/Managed by ReadAny CLI ([^\s.]+(?:\.[^\s.]+)*)\./);
  return match?.[1];
}

export async function getSkillStatus(skillFile: string): Promise<SkillStatus> {
  try {
    const content = await readFile(skillFile, "utf8");
    return {
      installed: content.includes(MANAGED_MARKER),
      path: skillFile,
      version: parseSkillVersion(content),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { installed: false, path: skillFile };
    }
    throw error;
  }
}

export async function installSkill(skillFile: string): Promise<SkillInstallResult> {
  await mkdir(dirname(skillFile), { recursive: true });
  await writeFile(skillFile, createSkillContent(), "utf8");
  return {
    installed: true,
    path: skillFile,
    version: CLI_VERSION,
  };
}

export async function uninstallSkill(skillFile: string): Promise<SkillUninstallResult> {
  const status = await getSkillStatus(skillFile);
  if (!status.installed) {
    return { removed: false, path: skillFile };
  }

  await rm(dirname(skillFile), { recursive: true, force: true });
  return { removed: true, path: skillFile };
}
