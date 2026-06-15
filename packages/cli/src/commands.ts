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
};

export function parseCommand(argv: string[]): ParsedCommand {
  const args = [...argv];
  let json = false;
  let profile: string | undefined;
  let mode: InstallMode | undefined;
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

    positional.push(arg);
  }

  return {
    name: positional[0] ?? "help",
    args: positional.slice(1),
    json,
    profile,
    mode,
  };
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
        const profile = parseAccessProfile(command.profile);
        return failure(
          "not_implemented",
          `MCP server is not implemented yet. Requested profile: ${profile}.`,
        );
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
        return success({ books: await listBooks(50, env) });
      }
      if (subcommand === "search") {
        const query = command.args.slice(1).join(" ");
        if (!query) {
          return failure("missing_query", "books search requires a query");
        }
        return success({ books: await searchBooks(query, 20, env) });
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
        return success({ notes: await listNotes(undefined, 50, env).then((items) =>
          items.filter((note) =>
            `${note.title} ${note.content} ${(note.tags ?? []).join(" ")}`.toLowerCase().includes(query.toLowerCase()),
          ),
        ) });
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
        return success({ highlights: await listHighlights(undefined, 50, env).then((items) =>
          items.filter((highlight) =>
            `${highlight.text} ${highlight.note ?? ""}`.toLowerCase().includes(query.toLowerCase()),
          ),
        ) });
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
