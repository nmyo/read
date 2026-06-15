import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { CommandResult } from "./result.js";
import { failure, success } from "./result.js";
import type { AccessProfile, PermissionScope } from "./profiles.js";
import { parseAccessProfile, profileHasScope } from "./profiles.js";
import { appendCliAuditEntry } from "./audit-log.js";
import { listTools } from "./tool-registry.js";
import type { ReadAnyTool } from "./tool-registry.js";
import {
  getBookById,
  getIndexedChapter,
  listIndexedChapters,
  listBooks,
  listHighlights,
  listNotes,
  searchRag,
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

type ToolPropertySchema = {
  type?: unknown;
  minLength?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  enum?: unknown;
};

function getResultErrorCode(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  if ("error" in result) return "jsonrpc_error";
  if (!("isError" in result) || result.isError !== true) return undefined;
  const content = (result as { content?: Array<{ text?: string }> }).content;
  const text = content?.[0]?.text;
  if (!text) return "tool_error";
  try {
    const parsed = JSON.parse(text) as CommandResult;
    return parsed.ok ? undefined : parsed.error.code;
  } catch {
    return "tool_error";
  }
}

async function recordMcpAudit(
  env: NodeJS.ProcessEnv,
  profile: AccessProfile,
  action: string,
  result: unknown,
): Promise<void> {
  const code = getResultErrorCode(result);
  await appendCliAuditEntry(env, {
    timestamp: new Date().toISOString(),
    source: "mcp",
    action,
    profile,
    ok: !code,
    code,
  });
}

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
  return getNumber(args, "limit", fallback);
}

function getNumber(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
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

function validateToolArguments(
  tool: ReadAnyTool,
  args: Record<string, unknown>,
): CommandResult<void> {
  const properties = tool.inputSchema.properties ?? {};
  const allowedKeys = new Set(Object.keys(properties));
  const unknownKeys = Object.keys(args).filter((key) => !allowedKeys.has(key));

  if (!tool.inputSchema.additionalProperties && unknownKeys.length > 0) {
    return failure(
      "invalid_tool_arguments",
      `Unknown arguments for ${tool.name}: ${unknownKeys.join(", ")}`,
    );
  }

  for (const key of tool.inputSchema.required ?? []) {
    if (!(key in args)) {
      return failure("invalid_tool_arguments", `${tool.name} requires argument: ${key}`);
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const schema = properties[key];
    if (!schema || typeof schema !== "object" || !("type" in schema)) continue;
    const typedSchema = schema as ToolPropertySchema;
    const type = typedSchema.type;
    if (type === "string" && typeof value !== "string") {
      return failure("invalid_tool_arguments", `${tool.name}.${key} must be a string`);
    }
    if (
      type === "string" &&
      typeof value === "string" &&
      typeof typedSchema.minLength === "number" &&
      value.trim().length < typedSchema.minLength
    ) {
      return failure(
        "invalid_tool_arguments",
        `${tool.name}.${key} must be at least ${typedSchema.minLength} characters`,
      );
    }
    if (type === "number" && typeof value !== "number") {
      return failure("invalid_tool_arguments", `${tool.name}.${key} must be a number`);
    }
    if (
      type === "number" &&
      typeof value === "number" &&
      typeof typedSchema.minimum === "number" &&
      value < typedSchema.minimum
    ) {
      return failure(
        "invalid_tool_arguments",
        `${tool.name}.${key} must be greater than or equal to ${typedSchema.minimum}`,
      );
    }
    if (
      type === "number" &&
      typeof value === "number" &&
      typeof typedSchema.maximum === "number" &&
      value > typedSchema.maximum
    ) {
      return failure(
        "invalid_tool_arguments",
        `${tool.name}.${key} must be less than or equal to ${typedSchema.maximum}`,
      );
    }
    if (
      Array.isArray(typedSchema.enum) &&
      !typedSchema.enum.some((allowedValue) => allowedValue === value)
    ) {
      return failure(
        "invalid_tool_arguments",
        `${tool.name}.${key} must be one of: ${typedSchema.enum.join(", ")}`,
      );
    }
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

  const validArguments = validateToolArguments(tool, args);
  if (!validArguments.ok) return validArguments;

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

  if (toolName === "chapters.list") {
    const bookId = getString(args, "bookId");
    if (!bookId) return failure("missing_book_id", "chapters.list requires bookId");
    return success({ chapters: await listIndexedChapters({ bookId, env }) });
  }

  if (toolName === "chapters.get") {
    const bookId = getString(args, "bookId");
    if (!bookId) return failure("missing_book_id", "chapters.get requires bookId");
    const chapterId = getString(args, "chapterId");
    if (!chapterId) return failure("missing_chapter_id", "chapters.get requires chapterId");
    const chapter = await getIndexedChapter({
      bookId,
      chapterId,
      chunkStart: getNumber(args, "chunkStart", 1),
      chunkCount:
        typeof args.chunkCount === "number" && Number.isFinite(args.chunkCount) && args.chunkCount > 0
          ? Math.floor(args.chunkCount)
          : undefined,
      contentLimit: getNumber(args, "contentLimit", 12000),
      env,
    });
    if (!chapter) {
      return failure("chapter_not_found", `Chapter ${chapterId} was not found in ${bookId}`);
    }
    return success({ chapter });
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

  if (toolName === "rag.search") {
    const query = getString(args, "query");
    if (!query) return failure("missing_query", "rag.search requires query");
    const bookId = getString(args, "bookId");
    if (!bookId) return failure("missing_book_id", "rag.search requires bookId");
    const mode = getString(args, "mode") ?? "bm25";
    if (mode !== "bm25") {
      return failure("unsupported_rag_mode", "Only mode bm25 is currently supported");
    }
    return success({
      results: await searchRag({
        query,
        bookId,
        mode,
        limit: getLimit(args, 5),
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
  let action = request.method ?? "unknown";
  let result: unknown;

  if (request.method === "initialize") {
    result = {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "readany",
        version: "0.1.0",
      },
    };
    await recordMcpAudit(env, profile, action, result);
    return result;
  }

  if (request.method === "tools/list") {
    result = {
      tools: listTools().map(toMcpTool),
    };
    await recordMcpAudit(env, profile, action, result);
    return result;
  }

  if (request.method === "tools/call") {
    const params = parseArgs(request.params) as ToolCallParams;
    const name = params.name;
    action = name ? `tools/call:${name}` : "tools/call";
    if (!name) {
      result = asMcpContent(failure("missing_tool_name", "tools/call requires name"));
      await recordMcpAudit(env, profile, action, result);
      return result;
    }
    const args = params.arguments ?? {};
    result = asMcpContent(await callReadAnyTool(profile, name, args, env));
    await recordMcpAudit(env, profile, action, result);
    return result;
  }

  result = {
    error: {
      code: -32601,
      message: `Unknown MCP method: ${request.method ?? ""}`.trim(),
    },
  };
  await recordMcpAudit(env, profile, action, result);
  return result;
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
