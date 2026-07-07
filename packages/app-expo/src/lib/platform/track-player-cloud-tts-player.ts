import {
  fetchOpenAITTSAudio,
  fetchXiaomiTTSWav,
  splitIntoChunks,
  type ITTSPlayer,
  type TTSConfig,
} from "@readany/core/tts";
import { File, Paths } from "expo-file-system";
import { Image } from "react-native";
import TrackPlayer, { Event, State } from "react-native-track-player";

const CHUNK_MAX_CHARS = 500;
const MEDIA_ARTIST = "ReadAny";
const DEFAULT_ARTWORK = (() => {
  try {
    return Image.resolveAssetSource(require("../../../assets/icon.png"))?.uri || "";
  } catch {
    return "";
  }
})();

function extensionForConfig(config: TTSConfig): string {
  if (config.engine === "xiaomi") return "wav";
  if (config.openaiTtsEndpoint === "chat-completions") {
    return config.openaiTtsFormat === "pcm16" ? "wav" : config.openaiTtsFormat;
  }
  return config.openaiTtsFormat || "mp3";
}

export class TrackPlayerCloudTTSPlayer implements ITTSPlayer {
  onStateChange?: (state: "playing" | "paused" | "stopped") => void;
  onChunkChange?: (index: number, total: number) => void;
  onEnd?: () => void;

  private _stopped = true;
  private _paused = false;
  private _chunks: string[] = [];
  private _currentIndex = 0;
  private _config: TTSConfig | null = null;
  private _tempFiles: string[] = [];
  private _speakGen = 0;
  private _unsubscribers: (() => void)[] = [];
  private _getArtwork: (() => string | undefined) | null = null;
  private _getTitle: (() => string | undefined) | null = null;
  private _advancing = false;

  get paused(): boolean {
    return this._paused;
  }

  setArtworkGetter(getter: () => string | undefined): void {
    this._getArtwork = getter;
  }

  setTitleGetter(getter: () => string | undefined): void {
    this._getTitle = getter;
  }

  async speak(text: string | string[], config: TTSConfig): Promise<void> {
    const gen = ++this._speakGen;
    await this._cleanup();
    if (gen !== this._speakGen) return;

    this._stopped = false;
    this._paused = false;
    this._config = config;
    this._chunks = Array.isArray(text)
      ? text.map((chunk) => chunk.trim()).filter(Boolean)
      : splitIntoChunks(text, CHUNK_MAX_CHARS);
    this._currentIndex = 0;
    this._tempFiles = [];
    this._advancing = false;

    if (this._chunks.length === 0) {
      this._finishPlayback();
      return;
    }

    await TrackPlayer.reset();
    this._subscribeToEvents(gen);
    await this._playChunk(0, gen);
  }

  append(text: string | string[]): void {
    if (this._stopped) return;
    const chunks = Array.isArray(text)
      ? text.map((chunk) => chunk.trim()).filter(Boolean)
      : splitIntoChunks(text, CHUNK_MAX_CHARS);
    this._chunks.push(...chunks);
  }

  private _subscribeToEvents(gen: number): void {
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];

    const unsubState = TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
      if (gen !== this._speakGen || this._stopped) return;
      if (event.state === State.Playing) {
        this.onStateChange?.("playing");
      } else if (event.state === State.Paused) {
        this.onStateChange?.(this._paused ? "paused" : "playing");
      } else if (event.state === State.Ended || event.state === State.Stopped) {
        void this._playNext(gen);
      } else if (event.state === State.Error) {
        console.warn("[TrackPlayerCloudTTSPlayer] playback error");
        void this._playNext(gen);
      }
    });

    const unsubQueueEnded = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      if (gen !== this._speakGen || this._stopped) return;
      void this._playNext(gen);
    });

    this._unsubscribers.push(unsubState.remove, unsubQueueEnded.remove);
  }

  private async _playNext(gen: number): Promise<void> {
    if (gen !== this._speakGen || this._stopped) return;
    if (this._paused) return;
    if (this._advancing) return;
    this._advancing = true;
    const next = this._currentIndex + 1;
    try {
      if (next >= this._chunks.length) {
        this._finishPlayback();
        return;
      }
      await this._playChunk(next, gen);
    } finally {
      this._advancing = false;
    }
  }

  private async _playChunk(index: number, gen: number): Promise<void> {
    if (gen !== this._speakGen || this._stopped || !this._config) return;
    this._currentIndex = index;
    this.onChunkChange?.(index, this._chunks.length);

    try {
      const uri = await this._fetchChunkFile(index, gen);
      if (gen !== this._speakGen || this._stopped) return;
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: `cloud-tts-${index}`,
        url: uri,
        title: this._getTitle?.() || "ReadAny",
        artist: MEDIA_ARTIST,
        artwork: this._getArtwork?.() || DEFAULT_ARTWORK,
      });
      if (!this._paused) {
        await TrackPlayer.play();
      }
    } catch (error) {
      if ((error as Error)?.message === "aborted") return;
      console.warn("[TrackPlayerCloudTTSPlayer] chunk error:", error);
      await this._playNext(gen);
    }
  }

  private async _fetchChunkFile(index: number, gen: number): Promise<string> {
    if (this._stopped || gen !== this._speakGen || !this._config) throw new Error("aborted");
    const config = this._config;
    const bytes =
      config.engine === "xiaomi"
        ? await fetchXiaomiTTSWav(this._chunks[index], config)
        : await fetchOpenAITTSAudio(this._chunks[index], config);
    if (this._stopped || gen !== this._speakGen) throw new Error("aborted");

    const ext = extensionForConfig(config);
    const tmpFile = new File(Paths.cache, `tts_${config.engine}_${index}_${Date.now()}.${ext}`);
    const audioUri = tmpFile.uri;
    this._tempFiles.push(audioUri);
    tmpFile.write(bytes);
    return audioUri;
  }

  pause(): void {
    if (this._stopped || this._paused) return;
    this._paused = true;
    TrackPlayer.pause();
    this.onStateChange?.("paused");
  }

  resume(): void {
    if (this._stopped || !this._paused) return;
    this._paused = false;
    TrackPlayer.play();
    this.onStateChange?.("playing");
  }

  stop(): void {
    this._stopped = true;
    this._paused = false;
    this._advancing = false;
    this._speakGen += 1;
    TrackPlayer.stop();
    TrackPlayer.reset();
    this._cleanupEvents();
    this._cleanupTempFiles();
    this.onStateChange?.("stopped");
  }

  private _finishPlayback(): void {
    if (this._stopped) return;
    this._stopped = true;
    this._paused = false;
    this._cleanupEvents();
    this.onStateChange?.("stopped");
    this.onEnd?.();
  }

  private async _cleanup(): Promise<void> {
    this._stopped = true;
    this._paused = false;
    await TrackPlayer.stop().catch(() => {});
    await TrackPlayer.reset().catch(() => {});
    this._cleanupEvents();
    this._cleanupTempFiles();
  }

  private _cleanupEvents(): void {
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
  }

  private _cleanupTempFiles(): void {
    for (const uri of this._tempFiles) {
      try {
        new File(uri).delete();
      } catch {}
    }
    this._tempFiles = [];
  }
}
