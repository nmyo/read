/**
 * Stub module for @tauri-apps/* packages in web mode.
 * All exports are no-ops or return sensible defaults.
 */

// @tauri-apps/api/app
export function getVersion() { return Promise.resolve("web"); }
export function getName() { return Promise.resolve("ReadAny"); }

// @tauri-apps/api/core (invoke)
export function invoke<T = unknown>(_cmd: string, _args?: Record<string, unknown>): Promise<T> {
  return Promise.reject(new Error("Tauri invoke not available in web mode"));
}
export function convertFileSrc(path: string) { return path; }

// @tauri-apps/api/path
export function join(...parts: string[]) { return Promise.resolve(parts.join("/").replace(/\/+/g, "/")); }
export function tempDir() { return Promise.resolve("/tmp"); }
export function appDataDir() { return Promise.resolve("/data"); }

// @tauri-apps/api/window
export function getCurrentWindow() {
  return {
    isMaximized: () => Promise.resolve(false),
    isMinimized: () => Promise.resolve(false),
    isFullscreen: () => Promise.resolve(false),
    minimize: () => Promise.resolve(),
    maximize: () => Promise.resolve(),
    unmaximize: () => Promise.resolve(),
    toggleMaximize: () => Promise.resolve(),
    close: () => Promise.resolve(),
    startDragging: () => Promise.resolve(),
    onCloseRequested: (cb: () => void) => { cb(); },
    listen: () => Promise.resolve(() => {}),
  };
}

// @tauri-apps/api/webview
export function getCurrentWebview() {
  return {
    listen: () => Promise.resolve(() => {}),
  };
}

// @tauri-apps/plugin-dialog
export function open(_options?: unknown) { return Promise.resolve(null); }
export function save(_options?: unknown) { return Promise.resolve(null); }
export function message(_msg: string, _opts?: unknown) { return Promise.resolve(); }
export function ask(_msg: string, _opts?: unknown) { return Promise.resolve(false); }

// @tauri-apps/plugin-fs
export function readFile(_path: string) { return Promise.reject(new Error("Not available in web mode")); }
export function writeFile(_path: string, _data: unknown) { return Promise.reject(new Error("Not available in web mode")); }
export function writeTextFile(_path: string, _content: string) { return Promise.reject(new Error("Not available in web mode")); }
export function readTextFile(_path: string) { return Promise.reject(new Error("Not available in web mode")); }
export function mkdir(_path: string, _opts?: unknown) { return Promise.resolve(); }
export function exists(_path: string) { return Promise.resolve(false); }
export function remove(_path: string) { return Promise.resolve(); }

// @tauri-apps/plugin-process
export function relaunch() { return Promise.resolve(); }
export function exit(_code?: number) { return Promise.resolve(); }

// @tauri-apps/plugin-sql
const dbStub = {
  execute: () => Promise.reject(new Error("Not available in web mode")),
  select: () => Promise.reject(new Error("Not available in web mode")),
  close: () => Promise.resolve(),
};
const Database = { load: () => Promise.resolve(dbStub) };
export default Database;

// @tauri-apps/plugin-updater
export function check() { return Promise.resolve(null); }

// @tauri-apps/plugin-http
export function fetch() { return Promise.reject(new Error("Use native fetch in web mode")); }

// @tauri-apps/plugin-websocket
export class WebSocketPlugin {
  static connect() { return Promise.reject(new Error("Use native WebSocket in web mode")); }
}

// @tauri-apps/plugin-window-state
export enum StateFlags { ALL = 0 }
export function saveWindowState(_flags?: StateFlags) { return Promise.resolve(); }
export function restoreStateCurrent(_flags?: StateFlags) { return Promise.resolve(); }
