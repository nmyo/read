import type { PermissionScope } from "./profiles.js";

export type ToolRisk = "low" | "medium" | "high";

export type ReadAnyTool = {
  name: string;
  description: string;
  scopes: PermissionScope[];
  risk: ToolRisk;
};

export const READANY_TOOLS: readonly ReadAnyTool[] = [
  {
    name: "books.list",
    description: "List books in the ReadAny library.",
    scopes: ["book.read"],
    risk: "low",
  },
  {
    name: "books.search",
    description: "Search books by metadata and query text.",
    scopes: ["book.read"],
    risk: "low",
  },
  {
    name: "books.get",
    description: "Get metadata for a single book.",
    scopes: ["book.read"],
    risk: "low",
  },
  {
    name: "chapters.list",
    description: "List chapters for a book.",
    scopes: ["book.read", "content.read"],
    risk: "low",
  },
  {
    name: "chapters.get",
    description: "Read a chapter from a book.",
    scopes: ["book.read", "content.read"],
    risk: "low",
  },
  {
    name: "notes.search",
    description: "Search notes in the ReadAny library.",
    scopes: ["note.read"],
    risk: "low",
  },
  {
    name: "highlights.search",
    description: "Search highlights in the ReadAny library.",
    scopes: ["note.read"],
    risk: "low",
  },
  {
    name: "rag.search",
    description: "Search ReadAny semantic context and citations.",
    scopes: ["rag.search"],
    risk: "low",
  },
];

export function listTools(): readonly ReadAnyTool[] {
  return READANY_TOOLS;
}
