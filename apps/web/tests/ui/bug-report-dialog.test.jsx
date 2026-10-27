/**
 * Bug 报告入口与对话框（ADR 0041）。
 *
 * 判据：「用户看得见入口、看得见自己将发出什么」。这里只断言不依赖主进程的部分——
 * 社区弹窗有没有「报告问题」、对话框关闭时是否什么都不渲染、拿不到预览时说的是什么。
 * 真正的收集与投递在主进程，由 `apps/desktop/tests/bug-report-collection.test.ts` 守着。
 */
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { CommunityDialog } from "../../src/app/windows/shell/components/CommunityDialog.jsx";
import { BugReportDialog } from "../../src/app/windows/shell/components/BugReportDialog.jsx";
import { isBugReportAvailable } from "../../src/app/windows/shell/components/bugReportBridge.js";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

describe("bug report entry", () => {
  it("社区弹窗只在提供回调时出现「报告问题」", () => {
    const withEntry = renderToStaticMarkup(
      <CommunityDialog open onClose={() => {}} onNotify={() => {}} onReportProblem={() => {}} />,
    );
    expect(withEntry).toContain("报告问题");
    expect(withEntry).toContain("复制群号");

    const withoutEntry = renderToStaticMarkup(<CommunityDialog open onClose={() => {}} onNotify={() => {}} />);
    expect(withoutEntry).not.toContain("报告问题");
    expect(withoutEntry).toContain("复制群号");
  });

  it("对话框能渲染；还没拿到预览时说明正在收集", () => {
    const html = renderToStaticMarkup(<BugReportDialog open onClose={() => {}} onNotify={() => {}} />);
    expect(html).toContain("报告问题");
    expect(html).toContain("正在收集…");
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="关闭报告"');
  });

  it("关闭时什么都不渲染", () => {
    expect(renderToStaticMarkup(<BugReportDialog open={false} onClose={() => {}} />)).toBe("");
  });

  it("没有桌面桥时不认为报告功能可用", () => {
    expect(isBugReportAvailable()).toBe(false);
  });

  it("发送前能展开看全文（代发没有邮件客户端可看，预览就是唯一的「看见」）", () => {
    const source = readFileSync(
      new URL("../../src/app/windows/shell/components/BugReportDialog.jsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("查看将要发送的全文");
    expect(source).toContain("formatBugReportBody(report, letterOf(delivery))");
  });
});
