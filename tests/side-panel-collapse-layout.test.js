import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  new URL("../src/renderer/src/app/windows/shell/hooks/useSidePanelLayout.js", import.meta.url),
  "utf8",
);
const shellStyles = readFileSync(
  new URL("../src/renderer/src/app/windows/shell/styles/client-shell.css", import.meta.url),
  "utf8",
);

describe("side panel collapse layout", () => {
  it("animates the outer column without squeezing the panel content", () => {
    expect(layoutSource).toContain('"--side-panel-width": sidePanelCollapsed ? "0px"');
    expect(layoutSource).toContain('"--side-panel-content-width": `${effectiveSidePanelWidth}px`');
    expect(shellStyles).toMatch(
      /\.side-panel-header\s*\{[^}]*width:\s*var\(--side-panel-content-width\);[^}]*min-width:\s*var\(--side-panel-content-width\);/,
    );
    expect(shellStyles).toMatch(
      /\.side-panel-content\s*\{[^}]*width:\s*var\(--side-panel-content-width\);[^}]*min-width:\s*var\(--side-panel-content-width\);/,
    );
  });
});
