import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { CommandResult } from "./result.js";
import { failure, success } from "./result.js";
import type { AccessProfile, PermissionScope } from "./profiles.js";
import { parseAccessProfile, profileHasScope } from "./profiles.js";
import { listTools } from "./tool-registry.js";
import {
  getBookById,
  listBooks,
  listHighlights,
  listNotes,
  searchBooks,
} from "./data.js";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type ToolCallParams = {
  name?: string;
  arguments?: Record<string, unknown>;
};

function toMcpTool(tool: ReturnType<typeof listTools>[number]) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function parseArgs(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== "object") return {};
  return params as Record<string, unknown>;
}

function getString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getLimit(args: Record<string, unknown>, fallback: number): number {
  const value = args.limit;
  if (typeof value !== "number") return fallback;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function assertToolAllowed(profile: AccessProfile, scopes: PermissionScope[]): CommandResult<void> {
  const missingScopes = scopes.filter((scope) => !profileHasScope(profile, scope));
  if (missingScopes.length > 0) {
    return failure(
      "permission_denied",
      `Profile '${profile}' is missing required scopes: ${missingScopes.join(", ")}`,
    );
  }
  return success(undefined);
}

async function callReadAnyTool(
  profile: AccessProfile,
  toolName: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const tool = listTools().find((item) => item.name === toolName);
  if (!tool) {
    return failure("unknown_tool", `Unknown ReadAny tool: ${toolName}`);
  }

  const allowed = assertToolAllowed(profile, tool.scopes);
  if (!allowed.ok) return allowed;

  if (toolName === "books.list") {
    return success({ books: await listBooks(getLimit(args, 50), env) });
  }

  if (toolName === "books.search") {
    const query = getString(args, "query");
    if (!query) return failure("missing_query", "books.search requires query");
    return success({ books: await searchBooks(query, getLimit(args, 20), env) });
  }

  if (toolName === "books.get") {
    const bookId = getString(args, "bookId");
    if (!bookId) return failure("missing_book_id", "books.get requires bookId");
    return success({ book: await getBookById(bookId, env) });
  }

  if (toolName === "notes.search") {
    const query = getString(args, "query");
    if (!query) return failure("missing_query", "notes.search requires query");
    return success({
      notes: await listNotes({
        query,
        bookId: getString(args, "bookId"),
        limit: getLimit(args, 50),
        env,
      }),
    });
  }

  if (toolName === "highlights.search") {
    const query = getString(args, "query");
    if (!query) return failure("missing_query", "highlights.search requires query");
    return success({
      highlights: await listHighlights({
        query,
        bookId: getString(args, "bookId"),
        limit: getLimit(args, 50),
        env,
      }),
    });
  }

  return failure("not_implemented", `${toolName} is registered but not implemented yet.`);
}

function asMcpContent(result: CommandResult) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: !result.ok,
  };
}

export async function handleMcpRequest(
  request: JsonRpcRequest,
  profile: AccessProfile,
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  if (request.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "readany",
        version: "0.1.0",
      },
    };
  }

  if (request.method === "tools/list") {
    return {
      tools: listTools().map(toMcpTool),
    };
  }

  if (request.method === "tools/call") {
    const params = parseArgs(request.params) as ToolCallParams;
    const name = params.name;
    if (!name) return asMcpContent(failure("missing_tool_name", "tools/call requires name"));
    const args = params.arguments ?? {};
    return asMcpContent(await callReadAnyTool(profile, name, args, env));
  }

  return {
    error: {
      code: -32601,
      message: `Unknown MCP method: ${request.method ?? ""}`.trim(),
    },
  };
}

export async function serveMcp(argvProfile: string | undefined, env = process.env): Promise<void> {
  const profile = parseAccessProfile(argvProfile);
  const rl = createInterface({ input, terminal: false });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const request = JSON.parse(line) as JsonRpcRequest;
    const result = await handleMcpRequest(request, profile, env);
    output.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: request.id ?? null,
        result,
      })}\n`,
    );
  }
}
