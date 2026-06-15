import { describe, expect, it } from "vitest";
import { listTools } from "./tool-registry.js";

describe("tool registry", () => {
  it("registers the first readonly tools", () => {
    const tools = listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "books.list",
      "books.search",
      "books.get",
      "chapters.list",
      "chapters.get",
      "notes.search",
      "highlights.search",
      "rag.search",
      "epub.inspect",
      "epub.draft.create",
    ]);
  });

  it("keeps write and inspect risk levels explicit", () => {
    const tools = listTools();
    expect(
      tools
        .filter((tool) => !tool.name.startsWith("epub."))
        .every((tool) => tool.risk === "low"),
    ).toBe(true);
    expect(tools.find((tool) => tool.name === "epub.inspect")?.risk).toBe("medium");
    expect(tools.find((tool) => tool.name === "epub.draft.create")?.risk).toBe("medium");
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

  it("exposes range controls for chapter reads", () => {
    const chapterTool = listTools().find((tool) => tool.name === "chapters.get");
    expect(chapterTool?.inputSchema.properties).toMatchObject({
      chunkStart: expect.any(Object),
      chunkCount: expect.any(Object),
      contentLimit: expect.any(Object),
    });
  });
});
