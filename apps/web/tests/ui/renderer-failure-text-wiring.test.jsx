// @vitest-environment jsdom
/**
 * 接线用例：渲染层显示失败时**必须**走 `resolveFailure` 的 `text`，不能直接把捕获值的
 * 开发者诊断（`.message`）当用户文案。
 *
 * 判据来源：ADR 0040 决定 4/8——用户可见文案只有一个解析点（`utils/failureText.js`）。
 * 这条用例守的是"解析点真的被调用"：给一条带码 + `details.what` 的失败，
 * 界面必须显示按码拼出来的句子（`找不到角色卡。`），而不是 `message`。
 *
 * 用一个已改过的真实路径（消息文件卡片打开失败 → `role="alert"`）接线，
 * 而不是只断言解析函数本身（那由 `failure-text.test.js` 覆盖）。
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { ChatFileCards } from "../../src/modules/chat/components/ChatFileCards.jsx";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, container;

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null; container = null;
  document.body.replaceChildren();
});

async function mountCards(onOpen) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ChatFileCards
    files={[{ id: "file-1", name: "角色卡.json", bytes: 128 }]}
    onOpen={onOpen} />));
}

function alertText() {
  return container.querySelector('[role="alert"]')?.textContent ?? "";
}

describe("界面显示失败时走按码文案", () => {
  it("带码失败使用按码摘要，并单独保留原始诊断", async () => {
    const failure = new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, "开发者诊断：找不到 x", { what: "角色卡" });
    await mountCards(() => Promise.reject(failure));

    await act(async () => container.querySelector("button.chat-file-card").click());

    // 按码摘要与完整原始诊断分别显示，诊断不能替代摘要，也不能在接线中丢失。
    expect(container.querySelector(".failure-alert-text")?.textContent).toBe("找不到角色卡。");
    expect(container.querySelector(".failure-alert-code")?.textContent).toBe(ELECKOI_FAILURE_CODES.lookupNotFound);
    expect(container.querySelector(".failure-alert-diagnostic")?.textContent).toBe(failure.message);
  });

  it("认不出的失败才回落到这次操作的兜底文案", async () => {
    await mountCards(() => Promise.reject(new Error("open failed")));

    await act(async () => container.querySelector("button.chat-file-card").click());

    // 裸 Error 没有码语义：它的 message 是唯一能让用户知道发生了什么的东西。
    // 同样只断包含：FailureAlert 会把折叠后的兜底码也显示出来。
    expect(alertText()).toContain("open failed");
  });
});
