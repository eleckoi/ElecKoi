// @vitest-environment jsdom
/**
 * 「运行错误」对话框里的报告入口（ADR 0042 决定 17）。
 *
 * 判据：出错的那一刻是用户最想报告的时候，所以错误对话框里要有入口；但**没有报告服务就不许
 * 渲染这个按钮**——点下去必然失败的按钮比少一个入口更糟（与 `CommunityDialog` 同一条规矩）。
 * 这里只断言外部可观察行为：按钮在不在、点了把手里的失败交给谁。
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppToast } from "../../src/ui/ui/AppToast.jsx";
import { reportProblemNotes } from "../../src/app/windows/shell/hooks/useReportProblem.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
