import { getPlatformService } from "../services/platform";
import { DEFAULT_XIAOMI_TTS_BASE_URL, type TTSConfig } from "./types";

export const CLOUD_TTS_PCM_SAMPLE_RATE = 24000;

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/u, "");
  const normalizedPath = path.replace(/^\/+/u, "");
  return `${normalizedBase}/${normalizedPath}`;
}

function openAIHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export function buildXiaomiTTSMessages(text: string, config: TTSConfig) {
  return [
    {
      role: "user",
      content: config.xiaomiStylePrompt || "自然、平稳、适合长时间听书。",
    },
    {
      role: "assistant",
      content: text,
    },
  ];
}

export function buildXiaomiTTSUrl(config: Pick<TTSConfig, "xiaomiBaseUrl">): string {
  return joinUrl(config.xiaomiBaseUrl || DEFAULT_XIAOMI_TTS_BASE_URL, "/chat/completions");
}

export function buildOpenAIChatTTSMessages(text: string, config: TTSConfig) {
  const stylePrompt = config.openaiTtsStylePrompt || "自然、平稳、适合长时间听书。";
  return [
    {
      role: "user",
      content: stylePrompt,
    },
    {
      role: "assistant",
      content: text,
    },
  ];
}

export async function fetchXiaomiTTSWav(text: string, config: TTSConfig): Promise<Uint8Array> {
  if (!config.xiaomiApiKey) throw new Error("Xiaomi MiMo API key is required");

  const platform = getPlatformService();
  const response = await platform.fetch(buildXiaomiTTSUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.xiaomiApiKey,
    },
    body: JSON.stringify({
      model: "mimo-v2.5-tts",
      messages: buildXiaomiTTSMessages(text, config),
      audio: {
        format: "wav",
        voice: config.xiaomiVoice || "Chloe",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Xiaomi MiMo TTS failed: ${response.status}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { audio?: { data?: string } } }>;
  };
  const audioData = result.choices?.[0]?.message?.audio?.data;
  if (!audioData) throw new Error("No audio data in Xiaomi MiMo response");
  return base64ToBytes(audioData);
}

export async function fetchOpenAITTSAudio(text: string, config: TTSConfig): Promise<Uint8Array> {
  if (!config.openaiTtsApiKey) throw new Error("OpenAI-compatible TTS API key is required");

  const platform = getPlatformService();
  if (config.openaiTtsEndpoint === "chat-completions") {
    const response = await platform.fetch(joinUrl(config.openaiTtsBaseUrl, "/chat/completions"), {
      method: "POST",
      headers: openAIHeaders(config.openaiTtsApiKey),
      body: JSON.stringify({
        model: config.openaiTtsModel,
        messages: buildOpenAIChatTTSMessages(text, config),
        audio: {
          format: config.openaiTtsFormat === "pcm16" ? "wav" : config.openaiTtsFormat,
          voice: config.openaiTtsVoice,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible chat TTS failed: ${response.status}`);
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { audio?: { data?: string } } }>;
    };
    const audioData = result.choices?.[0]?.message?.audio?.data;
    if (!audioData) throw new Error("No audio data in OpenAI-compatible chat TTS response");
    return base64ToBytes(audioData);
  }

  const response = await platform.fetch(joinUrl(config.openaiTtsBaseUrl, "/audio/speech"), {
    method: "POST",
    headers: openAIHeaders(config.openaiTtsApiKey),
    body: JSON.stringify({
      model: config.openaiTtsModel,
      input: text,
      voice: config.openaiTtsVoice,
      response_format: config.openaiTtsFormat,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible audio speech failed: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
