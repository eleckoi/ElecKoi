import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { CommunityDialog } from "../src/renderer/src/app/windows/shell/components/CommunityDialog.jsx";
import { SidebarRail } from "../src/renderer/src/app/windows/shell/components/SidebarRail.jsx";
import { ELECKOI_QQ_GROUP_NUMBER } from "../src/shared/foundation/community";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

describe("community navigation", () => {
  it("places the community entry immediately above model settings", () => {
    const html = renderToStaticMarkup(
      <SidebarRail
        activeSection="messages"
        onSectionChange={() => {}}
        onOpenCommunity={() => {}}
        onOpenProfile={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    expect(html.indexOf('aria-label="社区"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="社区"')).toBeLessThan(html.indexOf('aria-label="模型配置"'));
  });

  it("shows the current ElecKoi QQ group with a copy action only", () => {
    const html = renderToStaticMarkup(
      <CommunityDialog open onClose={() => {}} onNotify={() => {}} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain(ELECKOI_QQ_GROUP_NUMBER);
    expect(html).toContain("复制群号");
    expect(html).not.toContain("加入QQ群");
  });
});
