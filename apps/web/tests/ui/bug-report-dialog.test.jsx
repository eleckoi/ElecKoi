// @vitest-environment jsdom
/**
 * Bug 报告入口与对话框（ADR 0042 决定 11 / 13 / 14 / 15）。
 *
 * 判据：「用户看得见入口、看得见自己将发出什么、每次投递都先把全文留在手里」。这里只断言
 * 外部可观察行为——按钮文案与顺序、平台桥的调用顺序与参数、界面上出现的句子；收集与脱敏仍由
 * `apps/desktop/tests/bug-report-collection.test.ts` 守着。
 *
 * 两条评审修复在这里被钉住：剪贴板成功才说「已复制」（决定 13），打开表单页不等于提交
 * （决定 14）——草稿只由用户点「丢弃」时才删。
 */
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildBugReportFormUrl } from "@shared/contracts/bugReport/form";
import { formatBugReportBody } from "@shared/contracts/bugReport/mailto";
import { DesktopError } from "@shared/foundation/DesktopError";
import { CommunityDialog } from "../../src/app/windows/shell/components/CommunityDialog.jsx";
import {
  BugReportDialog,
  resetSessionChannelFailuresForTests,
} from "../../src/app/windows/shell/components/BugReportDialog.jsx";
import { bugReportBridge, isBugReportAvailable } from "../../src/app/windows/shell/components/bugReportBridge.js";

vi.stubGlobal("React", React);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterAll(() => vi.unstubAllGlobals());

/** 一份形状合法的报告；正常结束（异常结束由需要它的用例显式覆盖）。 */
function buildReport({ ended = true, logTail, notes, failures } = {}) {
  const report = {
    schemaVersion: 1,
    generatedAt: "2026-10-29T08:00:00.000Z",
    environment: {
      appVersion: "0.2.13",
      platform: "windows",
      arch: "x64",
      osVersion: "Windows 11",
      runtime: "Electron 33.0.0",
    },
    session: { startedAt: "2026-10-29T07:00:00.000Z", ended },
    failures: [
      { code: "eleckoi/io/failed", message: "读取失败：settings.json", details: { operation: "读取" } },
    ],
  };
  if (failures !== undefined) report.failures = failures;
  if (logTail !== undefined) report.logTail = logTail;
  if (notes !== undefined) report.notes = notes;
  return report;
}

/** 01 号票的表单配置形状（题目名是发布契约，用例照抄一份）。 */
const FORM = {
  shareUrl: "https://example.feishu.cn/share/base/form/shrcSyntheticForm",
  fields: { body: "report_body", meta: "report_meta", code: "report_code", file: "report_file" },
};

/** 默认投递配置：表单 + 邮件（没有代发，和默认发布配置一致）。 */
const DELIVERY = { mailbox: "reports@example.com", repository: "", form: FORM };

function openFailure(what, message = "打开外部程序失败：ENOENT") {
  return new DesktopError("eleckoi/shell/open-failed", message, { what });
}

function draftOf(key, savedAt = "2026-10-29T08:00:00.000Z", report = buildReport()) {
  return { key, savedAt, report };
}

/**
 * 桌面桥的桩：剪贴板与 open 的调用记在同一条时间线上，用例据此断言顺序。
 * 草稿列表与丢弃是**有状态**的：主进程删掉一份之后，下一次 `drafts()` 就该少一条。
 */
function installBridge({ report = buildReport(), delivery = DELIVERY, drafts = [], openImpl, persistDrafts = false } = {}) {
  const order = [];
  const draftList = [...drafts];
  const writeText = vi.fn(async () => {
    order.push("clipboard:writeText");
  });
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const bugReport = {
    preview: vi.fn(async () => ({ report, delivery })),
    export: vi.fn(async () => ({ saved: true, path: "eleckoi-report.json" })),
    // `openImpl` 让用例决定打开成功还是失败；"open" 先记上，失败也要能看出只调了一次。
    open: vi.fn(async (target) => {
      order.push("open");
      if (openImpl) await openImpl(target);
    }),
    send: vi.fn(async () => ({ sent: true })),
    saveDraft: vi.fn(async () => {
      // `persistDrafts` 让桩像主进程那样真的把草稿留在列表里（新到旧），用来测「打开后保留草稿」。
      const draft = draftOf(`draft-synthetic-${draftList.length + 1}`);
      if (persistDrafts) draftList.unshift(draft);
      return { key: draft.key, savedAt: draft.savedAt };
    }),
    drafts: vi.fn(async () => ({ drafts: [...draftList] })),
    discardDraft: vi.fn(async (key) => {
      const index = draftList.findIndex((draft) => draft.key === key);
      if (index >= 0) draftList.splice(index, 1);
    }),
  };
  window.dshDesktop = { bugReport };
  return { bugReport, order, writeText };
}

let root;
let container;

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  document.body.replaceChildren();
  delete window.dshDesktop;
  delete window.ElecKoiPlatform;
  delete navigator.clipboard;
  // 会话内降级表是模块级状态（窗口重载才复位）；用例之间复位，免得相互污染。
  resetSessionChannelFailuresForTests();
  vi.restoreAllMocks();
});

/** 重新渲染（`open` 由用例给），用于「关掉再打开」。 */
async function renderDialog(open) {
  await act(async () => {
    root.render(<BugReportDialog open={open} onClose={() => {}} onNotify={() => {}} />);
  });
}

/** 挂载对话框并等首批预览落定。 */
async function mountDialog() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await renderDialog(true);
  await act(async () => {});
}

function buttonByText(label) {
  return [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === label);
}

function actionLabels() {
  return [...document.querySelectorAll(".bug-report-actions button")].map((button) => button.textContent.trim());
}

function noticeText() {
  return document.querySelector(".bug-report-notice")?.textContent ?? "";
}

function bodyText() {
  return document.body.textContent;
}

/**
 * SSR 分支的渲染：组件只在 `document` 不存在时把对话框内联输出。这个文件跑在 jsdom 下，
 * 所以渲染期间把 `document` 藏起来，恢复后其余用例照样有 DOM 用。
 */
function renderOnServer(element) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { value: undefined, configurable: true, writable: true });
  try {
    return renderToStaticMarkup(element);
  } finally {
    if (saved) Object.defineProperty(globalThis, "document", saved);
    else delete globalThis.document;
  }
}

describe("bug report entry", () => {
  it("社区弹窗只在提供回调时出现「报告问题」", () => {
    const withEntry = renderOnServer(
      <CommunityDialog open onClose={() => {}} onNotify={() => {}} onReportProblem={() => {}} />,
    );
    expect(withEntry).toContain("报告问题");
    expect(withEntry).toContain("复制群号");

    const withoutEntry = renderOnServer(<CommunityDialog open onClose={() => {}} onNotify={() => {}} />);
    expect(withoutEntry).not.toContain("报告问题");
    expect(withoutEntry).toContain("复制群号");
  });

  it("对话框能渲染；还没拿到预览时说明正在收集", () => {
    const html = renderOnServer(<BugReportDialog open onClose={() => {}} onNotify={() => {}} />);
    expect(html).toContain("报告问题");
    expect(html).toContain("正在收集…");
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="关闭报告"');
  });

  it("关闭时什么都不渲染", () => {
    expect(renderOnServer(<BugReportDialog open={false} onClose={() => {}} />)).toBe("");
  });

  it("没有桌面桥时不认为报告功能可用", () => {
    expect(isBugReportAvailable()).toBe(false);
  });

  it("发送前能展开看全文（代发没有邮件客户端可看，预览就是唯一的「看见」）", () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../src/app/windows/shell/components/BugReportDialog.jsx"),
      "utf8",
    );
    expect(source).toContain("查看将要发送的全文");
    expect(source).toContain("formatBugReportBody(report, letterOf(delivery))");
  });
});

describe("通道顺序与可见性", () => {
  it("投递通道排在复制/导出之前：飞书表单 → 邮件 → 复制 → 导出", async () => {
    installBridge();
    await mountDialog();
    expect(actionLabels()).toEqual(["提交到飞书", "用邮件发送", "复制报告", "导出文件", "关闭"]);
    expect(buttonByText("提交到飞书").className).toContain("is-primary");
  });

  it("配了代发也不抢主位：表单是主按钮，代发排在邮件之后（决定 11）", async () => {
    installBridge({
      delivery: {
        ...DELIVERY,
        relay: { provider: "eleckoi-relay", endpoint: "https://relay.example.com/report", accessKey: "" },
      },
    });
    await mountDialog();
    expect(actionLabels()).toEqual([
      "提交到飞书",
      "用邮件发送",
      "直接发送",
      "复制报告",
      "导出文件",
      "关闭",
    ]);
    expect(buttonByText("提交到飞书").className).toContain("is-primary");
    expect(actionLabels().indexOf("直接发送")).toBeGreaterThan(actionLabels().indexOf("用邮件发送"));
  });

  it("没配表单与邮箱时不渲染会失败的按钮，并说清端点没配", async () => {
    installBridge({ delivery: { mailbox: "", repository: "" } });
    await mountDialog();
    expect(buttonByText("提交到飞书")).toBeUndefined();
    expect(buttonByText("用邮件发送")).toBeUndefined();
    expect(buttonByText("复制报告")).toBeDefined();
    expect(bodyText()).toContain("还没配置收件端点。先把报告复制或导出，再自己发给作者。");
  });

  it("界面上没有「在 GitHub 提交」", async () => {
    installBridge();
    await mountDialog();
    expect(bodyText()).not.toContain("在 GitHub 提交");
  });
});

describe("投递动作：先复制，再打开", () => {
  it("提交到飞书时先写剪贴板再打开，链接里带着完整正文", async () => {
    const report = buildReport();
    const { bugReport, order } = installBridge({ report });
    await mountDialog();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });

    expect(order).toEqual(["clipboard:writeText", "open"]);
    const target = bugReport.open.mock.calls[0][0];
    expect(target.kind).toBe("form");
    const url = new URL(target.url);
    expect(url.searchParams.get(`prefill_${FORM.fields.body}`)).toBe(formatBugReportBody(report));
  });

  it("剪贴板成功、打开失败：原因与「全文已复制」同时出现，且不自动改开别的通道", async () => {
    const { bugReport } = installBridge({
      openImpl: async () => {
        throw openFailure("form");
      },
    });
    await mountDialog();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });

    expect(bugReport.open).toHaveBeenCalledTimes(1);
    expect(bodyText()).toContain("没能打开浏览器");
    expect(bodyText()).toContain("全文已复制");
    expect(bodyText()).toContain("可以点「复制报告」，把全文粘到任意地方发给作者");
  });

  it("剪贴板失败、打开也失败：不宣称已复制，直说复制也没成功", async () => {
    const { writeText } = installBridge({
      openImpl: async () => {
        throw openFailure("form");
      },
    });
    writeText.mockRejectedValueOnce(new Error("剪贴板被系统占用"));
    await mountDialog();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });

    expect(bodyText()).not.toContain("全文已复制");
    expect(bodyText()).not.toContain("全文已在剪贴板");
    expect(noticeText()).toContain("复制也没成功");
    expect(noticeText()).toContain("复制报告");
  });

  it("剪贴板写不进去时仍然打开表单", async () => {
    const { bugReport, writeText } = installBridge();
    writeText.mockRejectedValueOnce(new Error("剪贴板被系统占用"));
    await mountDialog();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });

    expect(bugReport.open).toHaveBeenCalledTimes(1);
    expect(bugReport.open.mock.calls[0][0]).toMatchObject({ kind: "form" });
  });

  it("打开成功不等于提交成功：留成草稿，等用户确认后自己丢弃（决定 14）", async () => {
    const { bugReport } = installBridge({ persistDrafts: true });
    await mountDialog();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });

    expect(bugReport.saveDraft).toHaveBeenCalledTimes(1);
    expect(noticeText()).toContain("已留成草稿");
    expect(bodyText()).toContain("这份报告还留在草稿里");
    expect(bodyText()).toContain("确认提交后点「丢弃」");
  });

  it("「直接发送」失败也进会话内降级，不再占着主位（决定 11）", async () => {
    const delivery = {
      ...DELIVERY,
      relay: { provider: "eleckoi-relay", endpoint: "https://relay.example/report", accessKey: "" },
    };
    const { bugReport } = installBridge({ delivery });
    bugReport.send.mockRejectedValueOnce(
      new DesktopError("eleckoi/net/operation-failed", "报告代发服务不可达", {
        operation: "request",
        what: "报告代发服务",
      }),
    );
    await mountDialog();

    expect(actionLabels()[0]).toBe("提交到飞书");
    await act(async () => {
      buttonByText("直接发送").click();
    });

    expect(actionLabels().indexOf("直接发送")).toBeGreaterThan(actionLabels().indexOf("导出文件"));
    expect(buttonByText("直接发送").className).not.toContain("is-primary");
  });

  it("降级后重试成功，通道回到主位", async () => {
    let attempts = 0;
    installBridge({
      openImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw openFailure("form");
      },
    });
    await mountDialog();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });
    expect(actionLabels().indexOf("提交到飞书")).toBeGreaterThan(actionLabels().indexOf("导出文件"));
    expect(buttonByText("提交到飞书").className).not.toContain("is-primary");

    await act(async () => {
      buttonByText("提交到飞书").click();
    });
    expect(actionLabels()).toEqual(["提交到飞书", "用邮件发送", "复制报告", "导出文件", "关闭"]);
    expect(buttonByText("提交到飞书").className).toContain("is-primary");
  });
});

describe("会话内降级跨「关掉再打开」", () => {
  it("降级后关掉再打开，该通道仍在降级位（不是主按钮）", async () => {
    installBridge({
      openImpl: async () => {
        throw openFailure("form");
      },
    });
    await mountDialog();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });
    expect(actionLabels().indexOf("提交到飞书")).toBeGreaterThan(actionLabels().indexOf("复制报告"));
    expect(buttonByText("提交到飞书").className).not.toContain("is-primary");

    await renderDialog(false);
    await renderDialog(true);
    await act(async () => {});
    await act(async () => {});

    expect(buttonByText("提交到飞书")).toBeDefined();
    expect(actionLabels().indexOf("提交到飞书")).toBeGreaterThan(actionLabels().indexOf("复制报告"));
    expect(buttonByText("提交到飞书").className).not.toContain("is-primary");
    expect(bodyText()).toContain("飞书表单：没能打开浏览器");
  });
});

describe("崩溃证据默认带上", () => {
  it("上次异常结束：默认勾上日志尾并写明是默认带的", async () => {
    const { bugReport } = installBridge({ report: buildReport({ ended: false }) });
    await mountDialog();

    const checkbox = document.querySelector(".bug-report-toggle input");
    expect(checkbox.checked).toBe(true);
    expect(bugReport.preview.mock.calls.some(([request]) => request.includeLogTail === true)).toBe(true);
    expect(bodyText()).toContain("异常结束");
    expect(bodyText()).toContain("已默认带上日志尾");
  });
});

describe("草稿：失败不丢，也不偷偷重发", () => {
  it("有草稿时按份数给出「重新送出」与「丢弃」，丢弃后块消失", async () => {
    const draft = draftOf("draft-20261029T0800");
    const { bugReport } = installBridge({ drafts: [draft] });
    await mountDialog();

    expect(bodyText()).toContain("上次有 1 份没送出去的报告");
    expect(buttonByText("重新送出")).toBeDefined();

    await act(async () => {
      buttonByText("丢弃").click();
    });

    expect(bugReport.discardDraft).toHaveBeenCalledWith("draft-20261029T0800");
    expect(buttonByText("丢弃")).toBeUndefined();
  });

  it("2 份草稿按份数说话；丢弃最新一份后块按剩余份数更新", async () => {
    const newer = draftOf("draft-newer", "2026-10-29T09:00:00.000Z");
    const older = draftOf("draft-older", "2026-10-29T08:00:00.000Z");
    const { bugReport } = installBridge({ drafts: [newer, older] });
    await mountDialog();

    expect(bodyText()).toContain("上次有 2 份没送出去的报告");

    await act(async () => {
      buttonByText("丢弃").click();
    });

    expect(bugReport.discardDraft).toHaveBeenCalledWith("draft-newer");
    expect(bodyText()).toContain("上次有 1 份没送出去的报告");
    expect(bugReport.drafts).toHaveBeenCalledTimes(2);
  });

  it("「重新送出」打开成功后不删草稿：等用户确认提交后再点「丢弃」", async () => {
    const draft = draftOf("draft-20261029T0800");
    const { bugReport } = installBridge({ drafts: [draft] });
    await mountDialog();

    await act(async () => {
      buttonByText("重新送出").click();
    });

    expect(bugReport.open).toHaveBeenCalledTimes(1);
    expect(bugReport.open.mock.calls[0][0]).toMatchObject({ kind: "form" });
    expect(bugReport.discardDraft).not.toHaveBeenCalled();
    expect(bodyText()).toContain("确认提交后再点「丢弃」");
  });

  it("投递失败时把报告存成草稿，并在错误里说清可以重发", async () => {
    const { bugReport } = installBridge({
      openImpl: async () => {
        throw openFailure("form");
      },
    });
    await mountDialog();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });

    expect(bugReport.saveDraft).toHaveBeenCalledTimes(1);
    expect(bugReport.saveDraft.mock.calls[0][0]).toEqual({ includeLogTail: false });
    expect(bodyText()).toContain("报告已保存草稿，下次启动可以重发。");
  });

  it("投递进行中被关掉也存一份草稿；只是打开又关掉不存", async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { bugReport } = installBridge({
      openImpl: async () => { await gate; },
    });
    await mountDialog();

    await act(async () => {
      buttonByText("关闭").click();
    });
    expect(bugReport.saveDraft).not.toHaveBeenCalled();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });
    await act(async () => {
      buttonByText("关闭").click();
    });
    expect(bugReport.saveDraft).toHaveBeenCalledTimes(1);

    release();
    await act(async () => {});
  });
});

describe("表单预填的降级原因（契约给枚举，句子在渲染层）", () => {
  /** 200 行日志：全文超预算，截到最近 40 行才装得下。 */
  const LONG_LOG = Array.from(
    { length: 200 },
    (_, index) => `2026-10-29 08:00:00.000 INFO 第 ${index} 行 ${"x".repeat(280)}`,
  ).join("\n");

  const REASON_CASES = [
    {
      reason: "log-tail-truncated",
      sentence: "日志尾已截断到最近 40 行以适应表单链接长度。",
      report: buildReport({ logTail: LONG_LOG }),
    },
    {
      reason: "summarized",
      sentence: "报告较长，这次只带摘要；全文已复制到剪贴板。",
      report: buildReport({ notes: "x".repeat(40000) }),
    },
    {
      reason: "hard-truncated",
      sentence: "摘要仍超出表单链接预算，正文已截断。",
      report: buildReport({
        failures: [{ code: `eleckoi/io/failed-${"y".repeat(40000)}`, message: "读取失败" }],
      }),
    },
  ];

  it.each(REASON_CASES)("$reason 渲染成对应的中文句子", async ({ reason, sentence, report }) => {
    expect(buildBugReportFormUrl(report, FORM)?.reasons).toContain(reason);

    installBridge({ report });
    await mountDialog();

    await act(async () => {
      buttonByText("提交到飞书").click();
    });

    expect(bodyText()).toContain(sentence);
  });
});

describe("Android 桥的草稿降级", () => {
  it("没有草稿持久化也不报错：列空、存不下就不回执", async () => {
    window.ElecKoiPlatform = { bugReport: { facts: async () => ({ available: false }) } };
    const bridge = bugReportBridge();
    await expect(bridge.drafts()).resolves.toEqual({ drafts: [] });
    await expect(bridge.saveDraft({ includeLogTail: true })).resolves.toBeUndefined();
    await expect(bridge.discardDraft("draft-synthetic")).resolves.toBeUndefined();
  });
});
