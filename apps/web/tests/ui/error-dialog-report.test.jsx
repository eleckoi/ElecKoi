// @vitest-environment jsdom
/**
 * 「运行错误」对话框里的报告入口（ADR 0042 决定 17）。
 *
 * 判据：出错的那一刻是用户最想报告的时候，所以错误对话框里要有入口；但**没有报告服务就不许
 * 渲染这个按钮**——点下去必然失败的按钮比少一个入口更糟（与 `CommunityDialog` 同一条规矩）。
 * 这里只断言外部可观察行为：按钮在不在、点了把手里的失败交给谁。
 */
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { AppToast } from "../../src/ui/ui/AppToast.jsx";
import { reportProblemNotes, useReportProblem } from "../../src/app/windows/shell/hooks/useReportProblem.js";
import { BugReportDialog } from "../../src/app/windows/shell/components/BugReportDialog.jsx";
import { ProductLocaleProvider } from "../../src/app/i18n/ProductLocaleContext.jsx";
import { officialLocale } from "../../../../tests/helpers/officialLocale.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());

const FAILURE = {
  code: "eleckoi/io/failed",
  details: { operation: "写入", path: "settings.json" },
  text: "保存失败：settings.json。",
};

const NOTICE = { id: 7, type: "error", message: FAILURE.text, failure: FAILURE };

let root;

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined;
  document.body.replaceChildren();
  delete window.dshDesktop;
  delete window.ElecKoiPlatform;
});

function ReportWindow() {
  const [notice, setNotice] = useState(NOTICE);
  const report = useReportProblem({ onDismissNotice: () => setNotice(null) });
  return <>
    <button onClick={() => report.openReport()}>community-report</button>
    <AppToast notice={notice} onDismiss={() => setNotice(null)} onReportProblem={report.available ? report.openReport : undefined} />
    <BugReportDialog {...report.dialogProps} />
  </>;
}

describe('window report flow', () => {
  it.each(['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt'])('replaces the error with a report and keeps editable notes in %s', async language => {
    const locale = officialLocale(language);
    const report = { schemaVersion: 1, generatedAt: '2026-11-07T00:00:00.000Z',
      environment: { appVersion: '0.2.19', platform: 'windows', arch: 'x64' }, session: { ended: true }, failures: [] };
    const preview = vi.fn(async request => ({ report: { ...report, ...(request.notes ? { notes: request.notes } : {}) }, delivery: { mailbox: '', repository: '' } }));
    const open = vi.fn(), send = vi.fn(), saveDraft = vi.fn();
    window.dshDesktop = { bugReport: { preview, open, send, saveDraft } };
    await mount(<ProductLocaleProvider locale={locale}><ReportWindow /></ProductLocaleProvider>);
    const t = locale.bind('eleckoi.ui');
    await act(async () => buttonByText(t('报告问题')).click());
    expect(document.querySelector('.app-error-dialog')).toBeNull();
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    const notes = document.querySelector('.bug-report-notes textarea');
    expect(notes.value).toBe(t('看到「运行错误」：{code}', { code: FAILURE.code }));
    expect(preview.mock.calls[0][0].notes).toBe(notes.value);
    expect(document.querySelector('.bug-report-preview').textContent).toContain(notes.value);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(notes, 'Synthetic edited notes');
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => locale.setLocale(language === 'zh' ? 'en' : 'zh'));
    expect(document.querySelector('.bug-report-notes textarea')).toBe(notes);
    expect(notes.value).toBe('Synthetic edited notes');
    expect(open).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    const close = document.querySelector('.bug-report-close');
    await act(async () => close.click());
    expect(document.querySelector('.bug-report-dialog')).toBeNull();
    expect(saveDraft).not.toHaveBeenCalled();
    await act(async () => buttonByText('community-report').click());
    expect(document.querySelector('.bug-report-notes textarea').value).toBe('');
    expect(preview.mock.lastCall[0].notes).toBeUndefined();
  });

  it('hides the report entry when this window has no platform report bridge', async () => {
    await mount(<ReportWindow />);
    expect(buttonByText('报告问题')).toBeUndefined();
    expect(document.querySelector('.app-error-dialog')).not.toBeNull();
    expect(document.querySelector('.bug-report-dialog')).toBeNull();
  });
});

function buttonByText(label) {
  return [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === label);
}

async function mount(element) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(element));
}

describe("错误对话框里的报告入口", () => {
  it("没给回调就不渲染「报告问题」：不给一个点下去必然失败的按钮", async () => {
    await mount(<AppToast notice={NOTICE} onDismiss={() => {}} />);

    expect(buttonByText("报告问题")).toBeUndefined();
    expect(buttonByText("复制错误")).toBeDefined();
    expect(buttonByText("关闭")).toBeDefined();
  });

  it("给了回调就渲染，点了把刚才那份失败交出去", async () => {
    const onReportProblem = vi.fn();
    await mount(<AppToast notice={NOTICE} onDismiss={() => {}} onReportProblem={onReportProblem} />);

    const entry = buttonByText("报告问题");
    expect(entry).toBeDefined();
    await act(async () => entry.click());

    // 传的是整份失败：窗口据此关掉错误、预填错误码、打开报告。
    expect(onReportProblem).toHaveBeenCalledWith(FAILURE);
  });

  it("普通提示不是错误对话框，也没有报告入口", async () => {
    const onReportProblem = vi.fn();
    await mount(<AppToast notice={{ id: 8, type: "info", message: "已保存" }} onReportProblem={onReportProblem} />);

    expect(document.querySelector(".app-toast")).not.toBeNull();
    expect(buttonByText("报告问题")).toBeUndefined();
    expect(onReportProblem).not.toHaveBeenCalled();
  });
});

describe("预填给维护者的那一行", () => {
  it("有码就写进去，没有码就空着（不写半句没有信息的话）", () => {
    expect(reportProblemNotes(FAILURE)).toBe("看到「运行错误」：eleckoi/io/failed");
    expect(reportProblemNotes({ text: "出错了" })).toBe("");
    expect(reportProblemNotes({ code: "   " })).toBe("");
    expect(reportProblemNotes(undefined)).toBe("");
  });
});
