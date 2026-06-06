import { describe, expect, it, vi } from "vitest";
import type { AIConfig } from "../../types";
import { streamReadingAgent } from "../agents/reading-agent";
import type { ToolDefinition } from "../tools";
import { getAvailableTools } from "../tools";

const createReactAgentMock = vi.hoisted(() => vi.fn());

vi.mock("@langchain/langgraph/prebuilt", () => ({
  createReactAgent: createReactAgentMock,
}));

vi.mock("../llm-provider", () => ({
  createChatModel: vi.fn(async () => ({
    stream: vi.fn(),
  })),
}));

function makeAIConfig(): AIConfig {
  return {
    endpoints: [
      {
        id: "endpoint-1",
        name: "Mock",
        provider: "custom",
        apiKey: "",
        baseUrl: "https://example.com/v1",
        models: ["mock-model"],
        modelsFetched: true,
      },
    ],
    activeEndpointId: "endpoint-1",
    activeModel: "mock-model",
    temperature: 0.7,
    maxTokens: 1000,
    slidingWindowSize: 8,
  };
}

describe("streamReadingAgent tool registration", () => {
  it("registers fallback tools when only bookId is available", async () => {
    createReactAgentMock.mockReturnValue({
      streamEvents: vi.fn(() => ({
        [Symbol.asyncIterator]: async function* () {
          // no-op stream
        },
      })),
    });

    const events = streamReadingAgent(
      {
        aiConfig: makeAIConfig(),
        book: null,
        bookId: "book-1",
        semanticContext: null,
        enabledSkills: [],
        isVectorized: false,
        getAvailableTools,
      },
      "介绍一下这本书",
    );

    for await (const _event of events) {
      // drain stream
    }

    const call = createReactAgentMock.mock.calls[createReactAgentMock.mock.calls.length - 1]?.[0];
    const toolNames = (call.tools as ToolDefinition[]).map((tool) => tool.name);

    expect(toolNames).toContain("fallbackToc");
    expect(toolNames).toContain("fallbackSearch");
    expect(toolNames).toContain("fallbackChapterContext");
    expect(toolNames).not.toContain("addCitation");
  });
});
