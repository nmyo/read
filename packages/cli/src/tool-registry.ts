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
    description: "List chapters for a ReadAny book from indexed chunks, or fallback EPUB/PDF structure when no chunks exist.",
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
    description: "Read a chapter from indexed chunks, or fallback EPUB/PDF content when no chunks exist.",
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
          description: "1-based chunk offset within an indexed chapter. Ignored for fallback EPUB/PDF reads.",
        },
        chunkCount: {
          type: "number",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of indexed chunks to return. Ignored for fallback EPUB/PDF reads.",
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
    name: "notes.export",
    description: "Export notes and highlights for one book to a markdown, JSON, Obsidian, or Notion file.",
    scopes: ["epub.export"],
    risk: "high",
    inputSchema: {
      type: "object",
      properties: {
        bookId: {
          type: "string",
          minLength: 1,
          description: "ReadAny book id to export annotations for.",
        },
        outputPath: {
          type: "string",
          minLength: 1,
          description: "Output file path to write. Existing files are not overwritten unless overwrite is true.",
        },
        format: {
          type: "string",
          enum: ["markdown", "json", "obsidian", "notion"],
          description: "Export format. Defaults to markdown.",
        },
        overwrite: {
          type: "boolean",
          description: "Allow replacing an existing output file.",
        },
      },
      required: ["bookId", "outputPath"],
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
    name: "audit.list",
    description: "List recent ReadAny CLI/MCP audit entries without tool arguments or content payloads.",
    scopes: ["stats.read"],
    risk: "low",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          minimum: 1,
          maximum: 200,
          description: "Maximum number of audit entries to return.",
        },
        source: {
          type: "string",
          enum: ["cli", "mcp"],
          description: "Optional audit source filter.",
        },
        ok: {
          type: "boolean",
          description: "Optional success/failure filter.",
        },
        actionPrefix: {
          type: "string",
          minLength: 1,
          description: "Optional action prefix filter, such as tools/call or epub export.",
        },
        date: {
          type: "string",
          minLength: 10,
          description: "Optional YYYY-MM-DD audit log date.",
        },
      },
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
  {
    name: "epub.draft.create",
    description: "Create a draft workspace for an EPUB without modifying the original book file.",
    scopes: ["epub.draft"],
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
  {
    name: "epub.draft.discard",
    description: "Discard an EPUB draft workspace and mark it as inactive.",
    scopes: ["epub.draft"],
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB draft id.",
        },
        reason: {
          type: "string",
          minLength: 1,
          description: "Optional discard reason.",
        },
      },
      required: ["draftId"],
      additionalProperties: false,
    },
  },
  {
    name: "epub.chapter.read",
    description: "Read a chapter resource from an EPUB draft workspace.",
    scopes: ["epub.draft"],
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB draft id.",
        },
        chapterId: {
          type: "string",
          minLength: 1,
          description: "EPUB manifest item id for a readable XHTML chapter.",
        },
        contentLimit: {
          type: "number",
          minimum: 1,
          maximum: 50000,
          description: "Maximum number of content characters to return.",
        },
      },
      required: ["draftId", "chapterId"],
      additionalProperties: false,
    },
  },
  {
    name: "epub.chapter.patch",
    description: "Replace a readable XHTML chapter resource inside an EPUB draft workspace.",
    scopes: ["epub.draft"],
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB draft id.",
        },
        chapterId: {
          type: "string",
          minLength: 1,
          description: "EPUB manifest item id for the XHTML chapter to replace.",
        },
        xhtml: {
          type: "string",
          minLength: 1,
          description: "Full replacement XHTML document for the chapter.",
        },
      },
      required: ["draftId", "chapterId", "xhtml"],
      additionalProperties: false,
    },
  },
  {
    name: "epub.metadata.patch",
    description: "Patch metadata fields inside an EPUB draft workspace package document.",
    scopes: ["epub.draft"],
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB draft id.",
        },
        metadata: {
          type: "object",
          description:
            "Metadata fields to patch: title, creator, language, publisher, description, modified, subjects.",
        },
      },
      required: ["draftId", "metadata"],
      additionalProperties: false,
    },
  },
  {
    name: "epub.toc.rebuild",
    description: "Rebuild the EPUB3 nav table of contents from draft spine chapters.",
    scopes: ["epub.draft"],
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB draft id.",
        },
      },
      required: ["draftId"],
      additionalProperties: false,
    },
  },
  {
    name: "epub.history",
    description: "Read operation history for an EPUB draft workspace.",
    scopes: ["epub.draft"],
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB draft id.",
        },
      },
      required: ["draftId"],
      additionalProperties: false,
    },
  },
  {
    name: "epub.diff",
    description: "Compare an EPUB draft workspace against its original source EPUB.",
    scopes: ["epub.draft"],
    risk: "medium",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB draft id.",
        },
      },
      required: ["draftId"],
      additionalProperties: false,
    },
  },
  {
    name: "epub.validate",
    description: "Validate an active EPUB draft before export without modifying files.",
    scopes: ["epub.export"],
    risk: "high",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB draft id.",
        },
      },
      required: ["draftId"],
      additionalProperties: false,
    },
  },
  {
    name: "epub.export",
    description: "Export a validated EPUB draft to a new EPUB file.",
    scopes: ["epub.export"],
    risk: "high",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          minLength: 1,
          description: "ReadAny EPUB draft id.",
        },
        outputPath: {
          type: "string",
          minLength: 1,
          description: "Destination EPUB path. Existing files are rejected unless overwrite is true.",
        },
        overwrite: {
          type: "boolean",
          description: "Allow replacing an existing output file.",
        },
      },
      required: ["draftId", "outputPath"],
      additionalProperties: false,
    },
  },
];

export function listTools(): readonly ReadAnyTool[] {
  return READANY_TOOLS;
}
