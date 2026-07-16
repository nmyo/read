import "./polyfills";
import { i18nReady } from "@readany/core/i18n";
import { initI18nLanguage } from "@readany/core/i18n";
/**
 * Entry point — mount React app + beforeunload protection
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { onLibraryChanged } from "@readany/core/events/library-events";
import { installFeedbackLogCapture, setFeedbackWorkerUrl } from "@readany/core/feedback";
import { setPlatformService } from "@readany/core/services";
import { TauriPlatformService } from "./lib/platform/tauri-platform-service";
import { WebPlatformService } from "./lib/platform/web-platform-service";
import { syncLegacyDesktopLibraryRootConfig } from "./lib/storage/desktop-library-root";
import { useLibraryStore } from "./stores/library-store";
import { flushAllWrites } from "./stores/persist";

installFeedbackLogCapture();

const FEEDBACK_WORKER_FALLBACK = "https://feedback.readany.top";
const feedbackWorkerUrl = import.meta.env.VITE_FEEDBACK_WORKER_URL?.trim() || FEEDBACK_WORKER_FALLBACK;
setFeedbackWorkerUrl(feedbackWorkerUrl);

// Detect environment: Tauri desktop or web browser
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

if (isTauri) {
  const tauriPlatform = new TauriPlatformService();
  tauriPlatform.initSync().catch(console.error);
  setPlatformService(tauriPlatform);
} else {
  console.log("[ReadAny] Running in web mode");
  setPlatformService(new WebPlatformService());
}

const desktopDataRootReady = isTauri ? syncLegacyDesktopLibraryRootConfig().catch(console.error) : Promise.resolve();

// Ensure i18n is fully initialized before rendering
i18nReady.then(() => {
  desktopDataRootReady.catch(console.error);

  // Restore saved theme from localStorage
  const savedTheme = localStorage.getItem("readany-theme");
  if (savedTheme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else if (savedTheme && ["light", "dark", "sepia"].includes(savedTheme)) {
    document.documentElement.setAttribute("data-theme", savedTheme);
  } else {
    // Default to sepia theme
    document.documentElement.setAttribute("data-theme", "sepia");
  }

  // Restore saved language from platform KV storage
  initI18nLanguage().catch(console.error);

  // Flush pending state writes before window closes
  window.addEventListener("beforeunload", () => {
    flushAllWrites();
  });

  // Initialize database and load books
  desktopDataRootReady.then(() => {
    useLibraryStore.getState().loadBooks();
  });

  // Refresh library store when books/tags change
  onLibraryChanged((deletedTags) => useLibraryStore.getState().loadBooks(deletedTags));

  // Fire-and-forget: preload foliate-js core modules so they're cached for later use
  import("foliate-js/view.js").catch(() => {});
  import("foliate-js/paginator.js").catch(() => {});

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
