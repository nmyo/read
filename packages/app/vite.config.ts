import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pdfjsDist = path.resolve(__dirname, "../../node_modules/pdfjs-dist");
const tauriStubs = path.resolve(__dirname, "./src/lib/tauri-stubs.ts");

// Use array format with exact matching to avoid prefix conflicts
const tauriAliases = [
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
].map((find) => ({ find, replacement: tauriStubs }));

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover', '@radix-ui/react-select', '@radix-ui/react-slider', '@radix-ui/react-tabs', '@radix-ui/react-tooltip'],
                  }
      }
    },
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: "pdfjs-dist/build/pdf.worker.mjs", replacement: path.join(pdfjsDist, "build/pdf.worker.mjs") },
      { find: "pdfjs-dist", replacement: pdfjsDist },
      { find: "@pdfjs", replacement: path.resolve(__dirname, "../../foliate-js/vendor/pdfjs") },
      ...tauriAliases,
    ],
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
