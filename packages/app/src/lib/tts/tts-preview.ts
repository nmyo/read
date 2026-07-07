import type { TTSConfig } from "@readany/core/tts";
import {
  BrowserTTSPlayer,
  DashScopeTTSPlayer,
  EdgeTTSPlayer,
  OpenAICompatibleTTSPlayer,
  XiaomiTTSPlayer,
} from "@readany/core/tts";

const systemPreviewPlayer = new BrowserTTSPlayer();
const edgePreviewPlayer = new EdgeTTSPlayer();
const dashscopePreviewPlayer = new DashScopeTTSPlayer();
const xiaomiPreviewPlayer = new XiaomiTTSPlayer();
const openAICompatiblePreviewPlayer = new OpenAICompatibleTTSPlayer();

function stopPlayer(player: { stop: () => void }) {
  try {
    player.stop();
  } catch (err) {
    console.warn("[TTS] Failed to stop preview player:", err);
  }
}

export function stopTTSPreview() {
  stopPlayer(systemPreviewPlayer);
  stopPlayer(edgePreviewPlayer);
  stopPlayer(dashscopePreviewPlayer);
  stopPlayer(xiaomiPreviewPlayer);
  stopPlayer(openAICompatiblePreviewPlayer);
}

export async function previewTTSConfig(text: string, config: TTSConfig) {
  stopTTSPreview();
  const player =
    config.engine === "edge"
      ? edgePreviewPlayer
      : config.engine === "dashscope"
        ? dashscopePreviewPlayer
        : config.engine === "xiaomi"
          ? xiaomiPreviewPlayer
          : config.engine === "openai-compatible"
            ? openAICompatiblePreviewPlayer
            : systemPreviewPlayer;
  try {
    await Promise.resolve(player.speak(text, config));
  } catch (error) {
    console.error("[TTSPreview] Preview failed", error);
  }
}
