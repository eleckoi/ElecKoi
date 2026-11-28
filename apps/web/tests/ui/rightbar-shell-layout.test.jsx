import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitleBar } from "../../src/app/windows/shell/components/TitleBar.jsx";

globalThis.React = React;

const mainWindowSource = readFileSync(
  new URL("../../src/app/windows/MainWindow.jsx", import.meta.url),
  "utf8",
);
const frameSource = readFileSync(
  new URL("../../../../node_modules/@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.tsx", import.meta.url),
  "utf8",
);
const titlebarStyles = readFileSync(
  new URL("../../src/app/windows/shell/styles/titlebar.css", import.meta.url),
  "utf8",
);
const shellStyles = readFileSync(
  new URL("../../src/app/windows/shell/styles/client-shell.css", import.meta.url),
  "utf8",
);
const nativeFrameStyles = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.module.css', 'utf8');
const chatStyles = readFileSync(
  new URL("../../src/modules/chat/styles/chat-panel.css", import.meta.url),
  "utf8",
);
const mainWindowPluginSource = readFileSync(
  new URL("../../../desktop/src/main/platform/electron/mainWindowPlugin.ts", import.meta.url),
  "utf8",
);
const preloadSource = readFileSync(
  new URL("../../../desktop/src/preload/preload.ts", import.meta.url),
  "utf8",
);
const desktopShellSource = readFileSync(
  new URL("../../../../packages/shared/src/contracts/desktopShell.ts", import.meta.url),
  "utf8",
);

describe("right sidebar shell layout", () => {
  beforeEach(() => vi.stubGlobal('window', { dshDesktop: { windowControls: {} } }));
  afterEach(() => vi.unstubAllGlobals());

  it('omits native controls when rendered without a desktop bridge', () => {
    vi.stubGlobal('window', undefined);
    expect(renderToStaticMarkup(<TitleBar splitSurface />)).not.toContain('window-controls');
  });

  it("keeps the window controls outside the shrinking main-panel titlebar", () => {
    const embedded = renderToStaticMarkup(<TitleBar splitSurface />);
    const detached = renderToStaticMarkup(<TitleBar splitSurface showWindowControls={false} />);

    expect(embedded).toContain('title="最小化"');
    expect(detached).not.toContain('title="最小化"');
    expect(readFileSync('apps/web/src/app/windows/shell/components/OfficialFramePage.jsx', 'utf8')).toMatch(/<TitleBar[\s\S]*?showWindowControls=\{false\}/);
    expect(mainWindowSource).toContain('className="main-window-controls"');
    expect(mainWindowSource).toMatch(/className="main-window-controls"[\s\S]*?<WindowControls \/>/);
    expect(titlebarStyles).toMatch(
      /\.main-window-controls\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*right:\s*0;/,
    );
  });

  it("adapts only the projected trigger appearance to the ElecKoi header", () => {
    expect(chatStyles).toMatch(
      /\.chat-header-actions\s+\[data-sidebar-right-expand\]\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;[^}]*color:\s*var\(--chat-header-fg\);/,
    );
    expect(chatStyles).toMatch(
      /\.chat-header-actions\s+\[data-sidebar-right-expand\]\s+svg\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;/,
    );
  });

  it("places the sidebar toggle before its menus on the collapsed caption", () => {
    const options = { splitSurface: true, desktopMenu: true, sidePanelCollapsed: true, onToggleSidePanel: () => {} };
    const product = renderToStaticMarkup(<TitleBar {...options} />);
    expect(product.indexOf('aria-label="展开侧边栏"')).toBeLessThan(product.indexOf('data-desktop-menu-seat'));
  });

  it("uses the collapsed left-sidebar width immediately on narrow windows", () => {
    expect(frameSource).toContain('const narrow = layoutInfo.sidebarDrawer || viewport < SIDEBAR_AUTO_COLLAPSE');
    expect(frameSource).toContain('const sidebarCollapsed = narrow ? !layoutInfo.narrowExpanded');
  });

  it("places the official right-sidebar surface above the custom main column", () => {
    const mainPanel = shellStyles.match(/\.main-panel-shell\s*\{([^}]*)\}/)?.[1] ?? "";
    const rightbarColumn = [...nativeFrameStyles.matchAll(/\.rightbarCol\s*\{([^}]*)\}/g)].map(match => match[1]).find(rule => rule.includes('position:')) ?? '';

    expect(mainPanel).not.toContain("z-index");
    expect(rightbarColumn).toContain("position: relative");
    expect(rightbarColumn).toContain("overflow: visible");
    expect(shellStyles).not.toContain('.dsh-rightbar-column');
  });

  it("keeps the official frame caption drag region", () => {
    expect(nativeFrameStyles).toMatch(/\.frame::before\s*\{[^}]*-webkit-app-region:\s*drag;/);
  });

  it("provides the official desktop browser bridge instead of an iframe-only fallback", () => {
    expect(desktopShellSource).toContain("browserAcquire: 'dsh-desktop:browser-acquire'");
    expect(desktopShellSource).toContain("browserRelease: 'dsh-desktop:browser-release'");
    expect(preloadSource).toContain("function createDesktopBrowserBridge()");
    expect(preloadSource).toContain("browser: createDesktopBrowserBridge()");
    expect(mainWindowPluginSource).toContain("webviewTag: !child");
    // WP19 起主进程统一走 handleDesktopIpcCall 注册（把 handler 的抛出折成线上失败对象），
    // 通道仍在 mainWindowPlugin 里注册；这里断言注册形状的凭据随之更新，行为断言不变。
    expect(mainWindowPluginSource).toContain("handleDesktopIpcCall(DESKTOP_SHELL_IPC.browserAcquire");
    expect(mainWindowPluginSource).toContain("handleDesktopIpcCall(DESKTOP_SHELL_IPC.browserRelease");
  });
});
