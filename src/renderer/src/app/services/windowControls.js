import { desktopClient } from "../../bridge/desktopClient.ts";

let resizeModeInstalled = false;

export function installResizePerformanceMode() {
  if (resizeModeInstalled || typeof window === "undefined") {
    return;
  }

  resizeModeInstalled = true;
  let resizeTimer = 0;

  function markResizing() {
    document.documentElement.classList.add("is-window-resizing");
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      document.documentElement.classList.remove("is-window-resizing");
    }, 140);
  }

  window.addEventListener("resize", markResizing, { passive: true });
}

export async function ensureInitialWindowSizeOnce() {
  return false;
}

export async function showCurrentWindow() {
  return undefined;
}

export const appWindow = {
  async minimize() {
    await desktopClient.request("command.window.control", { action: "minimize" });
  },

  async maximizeToggle() {
    await desktopClient.request("command.window.control", { action: "maximize" });
  },

  async close() {
    await desktopClient.request("command.window.control", { action: "close" });
  },
};
