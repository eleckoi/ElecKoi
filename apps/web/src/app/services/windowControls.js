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
    await window.dshDesktop?.windowControls?.minimize();
  },

  async maximizeToggle() {
    await window.dshDesktop?.windowControls?.maximizeToggle();
  },

  async close() {
    await window.dshDesktop?.windowControls?.close();
  },
};
