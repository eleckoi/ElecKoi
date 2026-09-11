import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AboutSettings, updateStatusMessage } from "../src/renderer/src/modules/settings/components/AboutSettings.jsx";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

describe("about settings", () => {
  it("keeps the current version and manual update action visible", () => {
    const html = renderToStaticMarkup(
      <AboutSettings
        updates={{
          status: { phase: "idle", currentVersion: "0.1.0", message: "当前已是最新版本。" },
          error: "",
          check: vi.fn(),
        }}
      />,
    );

    expect(html).toContain("关于 ElecKoi");
    expect(html).toContain("当前版本 v0.1.0");
    expect(html).toContain("检查更新");
    expect(html).toContain("当前已是最新版本。");
  });

  it("shows checking and available states without inventing another update source", () => {
    expect(updateStatusMessage({ phase: "available", availableVersion: "0.2.0" })).toBe("发现新版本 v0.2.0");
    const settingsSource = readFileSync(new URL("../src/renderer/src/modules/settings/components/SettingsPanel.jsx", import.meta.url), "utf8");
    const mainWindowSource = readFileSync(new URL("../src/renderer/src/app/windows/MainWindow.jsx", import.meta.url), "utf8");
    expect(settingsSource).toContain('{ id: "about", label: "关于 ElecKoi", icon: Info }');
    expect(mainWindowSource).toContain("const appUpdates = useAppUpdates();");
    expect(mainWindowSource).toContain("<AppUpdateController updates={appUpdates} />");
  });
});
