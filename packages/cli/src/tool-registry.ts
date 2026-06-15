import type { PermissionScope } from "./profiles.js";

export type ToolRisk = "low" | "medium" | "high";

export type ReadAnyTool = {
  name: string;
  description: string;
  scopes: PermissionScope[];
  risk: ToolRisk;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
};

export const READANY_TOOLS: readonly ReadAnyTool[] = [
  {
    name: "books.list",
    description: "List books in the ReadAny library.",
    scopes: ["book.read"],
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of books to return.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "books.search",
    description: "Search books by metadata and query text.",
    scopes: ["book.read"],
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search query.",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of books to return.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "books.get",
    description: "Get metadata for a single book.",
    scopes: ["book.read"],
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          minLength: 1,
          description: "ReadAny book id.",
        },
      },
      required: ["bookId"],
      additionalProperties: false,
    },
  },
  {
    name: "chapters.list",
    description: "List indexed chapters for a ReadAny book from stored chunks.",
    scopes: ["content.read"],
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          minLength: 1,
          description: "ReadAny book id.",
        },
      },
      required: ["bookId"],
      additionalProperties: false,
    },
  },
  {
    name: "chapters.get",
    description: "Read an indexed chapter assembled from stored ReadAny chunks.",
    scopes: ["content.read"],
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          minLength: 1,
          description: "ReadAny book id.",
        },
        chapterId: {
          type: "string",
          minLength: 1,
          description: "Chapter id returned by chapters.list.",
        },
        chunkStart: {
          type: "number",
          minimum: 1,
          description: "1-based chunk offset within the chapter.",
        },
        chunkCount: {
          type: "number",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of indexed chunks to return.",
        },
        contentLimit: {
          type: "number",
          minimum: 1,
          maximum: 50000,
          description: "Maximum number of content characters to return.",
        },
      },
      required: ["bookId", "chapterId"],
      additionalProperties: false,
    },
  },
  {
    name: "notes.search",
    description: "Search notes in the ReadAny library.",
    scopes: ["note.read"],
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search query.",
        },
        bookId: {
          type: "string",
          minLength: 1,
          description: "Optional ReadAny book id filter.",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of notes to return.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "highlights.search",
    description: "Search highlights in the ReadAny library.",
    scopes: ["note.read"],
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search query.",
        },
        bookId: {
          type: "string",
          minLength: 1,
          description: "Optional ReadAny book id filter.",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of highlights to return.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "rag.search",
    description: "Search indexed ReadAny book chunks using BM25 keyword retrieval.",
    scopes: ["rag.search"],
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search query.",
        },
        bookId: {
          type: "string",
          minLength: 1,
          description: "ReadAny book id to search within.",
        },
        mode: {
          type: "string",
          enum: ["bm25"],
          description: "Search mode. Only bm25 is currently available through CLI/MCP.",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 50,
          description: "Maximum number of chunks to return.",
        },
      },
      required: ["query", "bookId"],
      additionalProperties: false,
    },
  },
  {
    name: "epub.inspect",
    description: "Inspect EPUB package metadata, manifest, spine, and table of contents.",
    scopes: ["epub.inspect"],
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB book id.",
        },
      },
      required: ["bookId"],
      additionalProperties: false,
    },
  },
];

export function listTools(): readonly ReadAnyTool[] {
  return READANY_TOOLS;
}
