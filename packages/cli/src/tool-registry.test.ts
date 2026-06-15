import { describe, expect, it } from "vitest";
import { listTools } from "./tool-registry.js";

describe("tool registry", () => {
  it("registers the first readonly tools", () => {
    const tools = listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "books.list",
      "books.search",
      "books.get",
      "notes.search",
      "highlights.search",
      "rag.search",
    ]);
  });

  it("keeps first-phase tools low risk", () => {
    expect(listTools().every((tool) => tool.risk === "low")).toBe(true);
  });

  it("declares input schemas for every exposed tool", () => {
    expect(
      listTools().every(
        (tool) =>
          tool.inputSchema.type === "object" &&
          tool.inputSchema.additionalProperties === false,
      ),
    ).toBe(true);
  });

  it("requires query input for search tools", () => {
    const searchTools = listTools().filter((tool) => tool.name.endsWith(".search"));
    expect(searchTools.every((tool) => tool.inputSchema.required?.includes("query"))).toBe(true);
  });
});
