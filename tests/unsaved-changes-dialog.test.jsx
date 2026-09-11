import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { UnsavedChangesDialog } from "../src/renderer/src/ui/ui/UnsavedChangesDialog.jsx";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

describe("shared unsaved changes dialog", () => {
  it("uses the preset save, discard, cancel action order", () => {
    const html = renderToStaticMarkup(
      <UnsavedChangesDialog
        open
        title="保存修改？"
        description="离开前是否保存当前模型配置的修改？"
        onCancel={() => {}}
        onDiscard={() => {}}
        onSave={() => {}}
      />,
    );

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("保存修改？");
    expect(html).toContain("离开前是否保存当前模型配置的修改？");
    expect(html.indexOf(">保存<")).toBeLessThan(html.indexOf(">不保存<"));
    expect(html.indexOf(">不保存<")).toBeLessThan(html.indexOf(">取消<"));
  });

  it("keeps the dialog mounted and disables every choice while saving", () => {
    const html = renderToStaticMarkup(
      <UnsavedChangesDialog
        open
        title="保存修改？"
        description="离开前是否保存修改？"
        saving
        onCancel={() => {}}
        onDiscard={() => {}}
        onSave={() => {}}
      />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(">保存中<");
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});
