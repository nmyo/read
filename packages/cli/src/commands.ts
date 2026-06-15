import { CLI_VERSION } from "./version.js";
import { getCliPaths } from "./paths.js";
import { parseAccessProfile } from "./profiles.js";
import { failure, success, type CommandResult } from "./result.js";
import { runDoctor } from "./doctor.js";
import { installCli, uninstallCli, type InstallMode } from "./install.js";
import { getSkillStatus, installSkill, uninstallSkill } from "./skill.js";
import { listTools } from "./tool-registry.js";
import {
  getBookById,
  listBookmarks,
  listBooks,
  listHighlights,
  listNotes,
  listSkills,
  searchBooks,
} from "./data.js";

export type ParsedCommand = {
  name: string;
  args: string[];
  json: boolean;
  profile?: string;
  mode?: InstallMode;
  options: Record<string, string | boolean>;
};

export function parseCommand(argv: string[]): ParsedCommand {
  const args = [...argv];
  let json = false;
  let profile: string | undefined;
  let mode: InstallMode | undefined;
  const options: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--profile") {
      profile = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--user") {
      mode = "user";
      continue;
    }

    if (arg === "--global") {
      mode = "global";
      continue;
    }

    if (arg === "--version" || arg === "--help") {
      positional.push(arg);
      continue;
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[index + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        index += 1;
      } else {
        options[key] = true;
      }
      continue;
    }

    positional.push(arg);
  }

  return {
    name: positional[0] ?? "help",
    args: positional.slice(1),
    json,
    profile,
    mode,
    options,
  };
}

function getLimit(command: ParsedCommand, fallback: number): number {
  const raw = command.options.limit;
  if (typeof raw !== "string") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getStringOption(command: ParsedCommand, name: string): string | undefined {
  const value = command.options[name];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function createHelpText(): string {
  return `ReadAny CLI ${CLI_VERSION}

Usage:
  readany --version
  readany doctor [--json] [--profile readonly]
  readany skill install
  readany skill uninstall
  readany skill status [--json]
  readany tools list [--json]
  readany books list [--json] [--limit 50]
  readany books search <query> [--json]
  readany book get <book-id> [--json]
  readany notes search <query> [--json] [--book <book-id>]
  readany highlights search <query> [--json] [--book <book-id>]
  readany mcp serve --profile readonly
`;
}

export async function runCommand(argv: string[], env = process.env): Promise<CommandResult> {
  const command = parseCommand(argv);
  const paths = getCliPaths(env);

  try {
    if (command.name === "--version" || command.name === "version") {
      return success(CLI_VERSION);
    }

    if (command.name === "help" || command.name === "--help" || command.name === "-h") {
      return success(createHelpText());
    }

    if (command.name === "doctor") {
      const profile = parseAccessProfile(command.profile);
      return success(await runDoctor(paths, profile));
    }

    if (command.name === "skill") {
      const subcommand = command.args[0] ?? "status";

      if (subcommand === "install") {
        return success(await installSkill(paths.skillFile));
      }

      if (subcommand === "uninstall") {
        return success(await uninstallSkill(paths.skillFile));
      }

      if (subcommand === "status") {
        return success(await getSkillStatus(paths.skillFile));
      }

      return failure("unknown_skill_command", `Unknown skill command: ${subcommand}`);
    }

    if (command.name === "tools") {
      const subcommand = command.args[0] ?? "list";
      if (subcommand === "list") {
        return success({ tools: listTools() });
      }

      return failure("unknown_tools_command", `Unknown tools command: ${subcommand}`);
    }

    if (command.name === "mcp") {
      const subcommand = command.args[0];
      if (subcommand === "serve") {
        return failure("mcp_serve_requires_stdio", "mcp serve must be run from the CLI entrypoint");
      }

      return failure("unknown_mcp_command", `Unknown MCP command: ${subcommand ?? ""}`.trim());
    }

    if (command.name === "install") {
      return success(await installCli({ binPath: paths.binPath, mode: command.mode }));
    }

    if (command.name === "uninstall") {
      return success(await uninstallCli({ binPath: paths.binPath, mode: command.mode }));
    }

    if (command.name === "books") {
      const subcommand = command.args[0] ?? "list";
      if (subcommand === "list") {
        return success({ books: await listBooks(getLimit(command, 50), env) });
      }
      if (subcommand === "search") {
        const query = command.args.slice(1).join(" ");
        if (!query) {
          return failure("missing_query", "books search requires a query");
        }
        return success({ books: await searchBooks(query, getLimit(command, 20), env) });
      }
      return failure("unknown_books_command", `Unknown books command: ${subcommand}`);
    }

    if (command.name === "book") {
      const subcommand = command.args[0] ?? "get";
      if (subcommand === "get") {
        const bookId = command.args[1];
        if (!bookId) return failure("missing_book_id", "book get requires a book id");
        return success({ book: await getBookById(bookId, env) });
      }
      return failure("unknown_book_command", `Unknown book command: ${subcommand}`);
    }

    if (command.name === "notes") {
      const subcommand = command.args[0] ?? "search";
      if (subcommand === "search") {
        const query = command.args.slice(1).join(" ");
        if (!query) {
          return failure("missing_query", "notes search requires a query");
        }
        return success({
          notes: await listNotes({
            query,
            bookId: getStringOption(command, "book"),
            limit: getLimit(command, 50),
            env,
          }),
        });
      }
      return failure("unknown_notes_command", `Unknown notes command: ${subcommand}`);
    }

    if (command.name === "highlights") {
      const subcommand = command.args[0] ?? "search";
      if (subcommand === "search") {
        const query = command.args.slice(1).join(" ");
        if (!query) {
          return failure("missing_query", "highlights search requires a query");
        }
        return success({
          highlights: await listHighlights({
            query,
            bookId: getStringOption(command, "book"),
            limit: getLimit(command, 50),
            env,
          }),
        });
      }
      return failure("unknown_highlights_command", `Unknown highlights command: ${subcommand}`);
    }

    if (command.name === "bookmarks") {
      const subcommand = command.args[0] ?? "list";
      if (subcommand === "list") {
        const bookId = command.args[1];
        if (!bookId) return failure("missing_book_id", "bookmarks list requires a book id");
        return success({ bookmarks: await listBookmarks(bookId, env) });
      }
      return failure("unknown_bookmarks_command", `Unknown bookmarks command: ${subcommand}`);
    }

    if (command.name === "skills") {
      const subcommand = command.args[0] ?? "list";
      if (subcommand === "list") {
        return success({ skills: await listSkills(env) });
      }
      return failure("unknown_skills_command", `Unknown skills command: ${subcommand}`);
    }

    return failure("unknown_command", `Unknown command: ${command.name}`);
  } catch (error) {
    return failure(
      "command_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}
