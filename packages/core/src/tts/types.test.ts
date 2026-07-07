import { describe, expect, it } from "vitest";

import { normalizeTTSConfig } from "./types";

describe("normalizeTTSConfig", () => {
  it("preserves persisted default profile settings", () => {
    const config = normalizeTTSConfig({
      engine: "openai-compatible",
      activeProfileId: "openai-compatible-default",
      profiles: [
        {
          id: "openai-compatible-default",
          name: "Custom OpenAI TTS",
          provider: "openai-compatible",
          baseUrl: "https://example.com/v1",
          apiKey: "secret-key",
          endpoint: "chat-completions",
          model: "custom-tts",
          voice: "reader",
          format: "wav",
          stylePrompt: "Read calmly.",
        },
      ],
    });

    expect(config.openaiTtsBaseUrl).toBe("https://example.com/v1");
    expect(config.openaiTtsApiKey).toBe("secret-key");
    expect(config.openaiTtsEndpoint).toBe("chat-completions");
    expect(config.openaiTtsModel).toBe("custom-tts");
    expect(config.openaiTtsVoice).toBe("reader");
    expect(config.openaiTtsFormat).toBe("wav");
    expect(config.openaiTtsStylePrompt).toBe("Read calmly.");
  });

  it("preserves Xiaomi profile base URL settings", () => {
    const config = normalizeTTSConfig({
      engine: "xiaomi",
      activeProfileId: "xiaomi-mimo-default",
      profiles: [
        {
          id: "xiaomi-mimo-default",
          name: "Xiaomi Token Plan",
          provider: "xiaomi",
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          apiKey: "tp-secret",
          voice: "Serena",
          model: "mimo-v2.5-tts",
          format: "pcm16",
          stylePrompt: "Read softly.",
        },
      ],
    });

    expect(config.xiaomiBaseUrl).toBe("https://token-plan-cn.xiaomimimo.com/v1");
    expect(config.xiaomiApiKey).toBe("tp-secret");
    expect(config.xiaomiVoice).toBe("Serena");
    expect(config.xiaomiStylePrompt).toBe("Read softly.");
  });
});
