import type { TTSConfig } from "@readany/core/tts";
import { ExpoAVEdgeTTSPlayer } from "./expo-av-edge-player";
import { ExpoSpeechTTSPlayer } from "./expo-speech-player";
import { TrackPlayerCloudTTSPlayer } from "./track-player-cloud-tts-player";

const systemPreviewPlayer = new ExpoSpeechTTSPlayer();
const edgePreviewPlayer = new ExpoAVEdgeTTSPlayer();
const dashscopePreviewPlayer = new ExpoSpeechTTSPlayer();
const cloudPreviewPlayer = new TrackPlayerCloudTTSPlayer();

function stopPlayer(player: { stop: () => void }) {
  try {
    player.stop();
  } catch {}
}

export function stopTTSPreview() {
  stopPlayer(systemPreviewPlayer);
  stopPlayer(edgePreviewPlayer);
  stopPlayer(dashscopePreviewPlayer);
  stopPlayer(cloudPreviewPlayer);
}

export async function previewTTSConfig(text: string, config: TTSConfig) {
  stopTTSPreview();
  const player =
    config.engine === "edge"
      ? edgePreviewPlayer
      : config.engine === "dashscope"
        ? dashscopePreviewPlayer
        : config.engine === "xiaomi" || config.engine === "openai-compatible"
          ? cloudPreviewPlayer
          : systemPreviewPlayer;
  try {
    await Promise.resolve(player.speak(text, config));
  } catch (error) {
    console.error("[TTSPreview] Preview failed", error);
  }
}
