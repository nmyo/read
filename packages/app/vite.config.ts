import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pdfjsDist = path.resolve(__dirname, "../../node_modules/pdfjs-dist");
const tauriStubs = path.resolve(__dirname, "./src/lib/tauri-stubs.ts");

// Redirect all Tauri imports to web stubs
const tauriAliases: Record<string, string> = {};
for (const pkg of [
  "@tauri-apps/api",
  "@tauri-apps/api/app",
  "@tauri-apps/api/core",
  "@tauri-apps/api/path",
  "@tauri-apps/api/window",
  "@tauri-apps/api/webview",
  "@tauri-apps/plugin-dialog",
  "@tauri-apps/plugin-fs",
  "@tauri-apps/plugin-http",
  "@tauri-apps/plugin-opener",
  "@tauri-apps/plugin-process",
  "@tauri-apps/plugin-sql",
  "@tauri-apps/plugin-updater",
  "@tauri-apps/plugin-websocket",
  "@tauri-apps/plugin-window-state",
]) {
  tauriAliases[pkg] = tauriStubs;
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "pdfjs-dist/build/pdf.worker.mjs": path.join(pdfjsDist, "build/pdf.worker.mjs"),
      "pdfjs-dist": pdfjsDist,
      "@pdfjs": path.resolve(__dirname, "../../foliate-js/vendor/pdfjs"),
      ...tauriAliases,
    },
    dedupe: ["i18next", "react-i18next", "react", "react-dom"],
  },
  optimizeDeps: {
    exclude: ["foliate-js/pdf.js"],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
}));
