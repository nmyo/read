/**
 * Ruby Dictionary Service — handles downloading and managing ruby dictionaries.
 *
 * Dictionaries are stored in {appData}/dicts/{lang}/ and loaded on demand.
 * Uses the same pattern as vector model downloads.
 */

import { useRubyStore } from "@readany/core/stores/ruby-store";
import { loadPinyinDict, PINYIN_DICT_URL, PINYIN_DICT_FILENAME } from "./pinyin-processor";

/**
 * Get the dictionary directory path for a language.
 */
async function getDictDir(lang: "zh" | "ja"): Promise<string> {
  const { getPlatformService } = await import("@readany/core/services");
  const platform = getPlatformService();
  const appData = await platform.getAppDataDir();
  return `${appData}/dicts/${lang}`;
}

/**
 * Download the Chinese pinyin dictionary.
 */
export async function downloadChineseDict(): Promise<void> {
  const store = useRubyStore.getState();
  store.setDictState("zh", { status: "downloading", progress: 0, error: undefined });

  try {
    const { mkdir, writeFile, exists } = await import("@tauri-apps/plugin-fs");
    const dictDir = await getDictDir("zh");

    // Create directory if needed
    if (!(await exists(dictDir))) {
      await mkdir(dictDir, { recursive: true });
    }

    const dictPath = `${dictDir}/${PINYIN_DICT_FILENAME}`;

    // Download with progress
    const response = await fetch(PINYIN_DICT_URL);
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0) {
        store.setDictState("zh", { progress: Math.round((received / contentLength) * 100) });
      }
    }

    // Combine chunks and write to file
    const fullData = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      fullData.set(chunk, offset);
      offset += chunk.length;
    }

    await writeFile(dictPath, fullData);

    // Verify by loading
    await loadPinyinDict(dictPath);

    store.setDictState("zh", { status: "ready", progress: 100, error: undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.setDictState("zh", { status: "error", error: message, progress: 0 });
    throw err;
  }
}

/**
 * Delete the Chinese dictionary files.
 */
export async function deleteChineseDict(): Promise<void> {
  try {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const dictDir = await getDictDir("zh");
    if (await exists(dictDir)) {
      await remove(dictDir, { recursive: true });
    }
  } catch {
    // Ignore deletion errors
  }
  useRubyStore.getState().setDictState("zh", { status: "idle", progress: 0, error: undefined });
}

/**
 * Try to load an already-downloaded dictionary on app startup.
 * Returns true if dictionary was found and loaded.
 */
export async function tryLoadExistingDict(lang: "zh" | "ja"): Promise<boolean> {
  if (lang === "zh") {
    try {
      const { exists } = await import("@tauri-apps/plugin-fs");
      const dictDir = await getDictDir("zh");
      const dictPath = `${dictDir}/${PINYIN_DICT_FILENAME}`;
      if (await exists(dictPath)) {
        await loadPinyinDict(dictPath);
        useRubyStore.getState().setDictState("zh", { status: "ready", progress: 100 });
        return true;
      }
    } catch {
      // Dict not available
    }
    return false;
  }

  // TODO: Japanese dict loading
  return false;
}

/**
 * Download Japanese kuromoji dictionary.
 * TODO: Implement when adding Japanese support.
 */
export async function downloadJapaneseDict(): Promise<void> {
  throw new Error("Japanese dictionary not yet supported");
}

/**
 * Delete Japanese dictionary.
 */
export async function deleteJapaneseDict(): Promise<void> {
  try {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    const dictDir = await getDictDir("ja");
    if (await exists(dictDir)) {
      await remove(dictDir, { recursive: true });
    }
  } catch {
    // Ignore
  }
  useRubyStore.getState().setDictState("ja", { status: "idle", progress: 0, error: undefined });
}
