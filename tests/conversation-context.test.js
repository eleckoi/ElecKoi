import { describe, expect, it } from "vitest";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { projectRequest } from "../resources/dsh/conversation-context.mjs";

describe("DSH conversation context projection", () => {
  it("keeps the latest user input between the before/after insertion anchors", () => {
    const latestInput = createUserMessage({
      content: [{ type: "text", text: "最新用户输入" }],
      source: { kind: "user" },
    });
    const result = projectRequest({
      provider: "eleckoi-upstream",
      model: "deepseek-chat",
      system: "base",
      messages: [latestInput],
    }, {
      currentUserInput: "最新用户输入",
      characterName: "测试角色",
      persona: { assistant_name: "测试角色", description: "角色说明" },
      history: [{ role: "assistant", speakerName: "测试角色", content: "上一条回复" }],
      settingLibrary: {
        promptPositions: [
          { id: "before-latest", anchor: "before_latest_user_input" },
          { id: "after-latest", anchor: "after_latest_user_input" },
        ],
        entries: [
          setting({ id: "before", title: "输入前", promptPositionId: "before-latest", content: "必须在最新输入前" }),
          setting({ id: "after", title: "输入后", promptPositionId: "after-latest", content: "必须在最新输入后" }),
        ],
      },
    });

    expect(result.messages.map(textOf)).toEqual([
      "上一条回复",
      "必须在最新输入前",
      "最新用户输入",
      "必须在最新输入后",
    ]);
    expect(result.system).toBe("base");
  });
});

function setting(overrides) {
  return {
    kind: "normal",
    enabled: true,
    triggerMode: "always",
    content: "",
    promptPositionId: "",
    ...overrides,
  };
}

function textOf(message) {
  return message.content.map((part) => part.type === "text" ? part.text : "").join("");
}
