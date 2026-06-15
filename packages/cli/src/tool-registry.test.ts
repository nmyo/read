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
    ]);
  });

  it("keeps first-phase tools low risk", () => {
    expect(listTools().every((tool) => tool.risk === "low")).toBe(true);
  });
});
