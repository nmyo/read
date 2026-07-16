/**
 * WebPlatformService — IPlatformService for web browser + backend API.
 *
 * Replaces TauriPlatformService for the web deployment.
 * Database operations go through /api endpoints.
 * Files are stored on the server (rclone OneDrive mount).
 */

import type {
  FetchOptions,
  FilePickerOptions,
  IDatabase,
  IPlatformService,
  IWebSocket,
  WebSocketOptions,
} from "@readany/core/services";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// --- WebDatabase: proxies SQL to backend ---
function createWebDatabase(): IDatabase {
  return {
    async execute(sql: string, params?: unknown[]): Promise<void> {
      await fetch(`${API_BASE}/db/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, params: params ?? [] }),
      });
    },
    async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const res = await fetch(`${API_BASE}/db/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, params: params ?? [] }),
      });
      return res.json();
    },
    async close(): Promise<void> {
      // no-op for web
    },
  };
}

export class WebPlatformService implements IPlatformService {
  readonly platformType = "web" as const;
  readonly isMobile = false;
  readonly isDesktop = false;

  // ---- File system (server-backed) ----

  async readFile(path: string): Promise<Uint8Array> {
    const res = await fetch(`${API_BASE}/files/read?path=${encodeURIComponent(path)}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const blob = new Blob([data]);
    const form = new FormData();
    form.append("path", path);
    form.append("file", blob);
    await fetch(`${API_BASE}/files/write`, { method: "POST", body: form });
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.writeFile(path, new TextEncoder().encode(content));
  }

  async readTextFile(path: string): Promise<string> {
    const buf = await this.readFile(path);
    return new TextDecoder().decode(buf);
  }

  async mkdir(_path: string): Promise<void> {
    // Server handles directory creation
  }

  async exists(path: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/files/exists?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    return data.exists;
  }

  async deleteFile(path: string): Promise<void> {
    await fetch(`${API_BASE}/files/delete?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  }

  async getAppDataDir(): Promise<string> {
    return "/data";
  }

  async getDataDir(): Promise<string> {
    return "/storage";
  }

  async joinPath(...parts: string[]): Promise<string> {
    return parts.join("/").replace(/\/+/g, "/");
  }

  convertFileSrc(path: string): string {
    return `${API_BASE}/files/raw?path=${encodeURIComponent(path)}`;
  }

  // ---- File picker (browser) ----

  async pickFile(options?: FilePickerOptions): Promise<string | string[] | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      if (options?.multiple) input.multiple = true;
      if (options?.filters?.length) {
        const exts = options.filters.flatMap((f) => f.extensions.map((e) => `.${e}`));
        input.accept = exts.join(",");
      }
      input.onchange = () => {
        const files = Array.from(input.files || []);
        if (files.length === 0) return resolve(null);
        // Upload files and return paths
        const uploads = files.map(async (file) => {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch(`${API_BASE}/files/upload`, { method: "POST", body: form });
          const data = await res.json();
          return data.path;
        });
        Promise.all(uploads).then((paths) => {
          resolve(options?.multiple ? paths : paths[0]);
        });
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  // ---- Database ----

  async loadDatabase(_path: string): Promise<IDatabase> {
    return createWebDatabase();
  }

  // ---- Network ----

  async fetch(url: string, options?: FetchOptions): Promise<Response> {
    return window.fetch(url, options);
  }

  async createWebSocket(url: string, _options?: WebSocketOptions): Promise<IWebSocket> {
    const ws = new WebSocket(url);
    const handlers = { message: [] as Function[], close: [] as Function[], error: [] as Function[] };

    ws.onmessage = (e) => handlers.message.forEach((h) => h(e.data));
    ws.onclose = () => handlers.close.forEach((h) => h());
    ws.onerror = (e) => handlers.error.forEach((h) => h(e));

    return {
      send: (data) => ws.send(data),
      close: () => ws.close(),
      onMessage: (h) => handlers.message.push(h),
      onClose: (h) => handlers.close.push(h),
      onError: (h) => handlers.error.push(h),
    };
  }

  // ---- App info ----

  async getAppVersion(): Promise<string> {
    return "1.3.5-web";
  }

  // ---- KV Storage (localStorage) ----

  async kvGetItem(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async kvSetItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async kvRemoveItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async kvGetAllKeys(): Promise<string[]> {
    return Object.keys(localStorage);
  }

  // ---- Clipboard ----

  async copyToClipboard(content: string): Promise<void> {
    await navigator.clipboard.writeText(content);
  }

  // ---- File sharing / download ----

  async shareOrDownloadFile(content: string, filename: string, mimeType: string): Promise<string | null> {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return filename;
  }
}
