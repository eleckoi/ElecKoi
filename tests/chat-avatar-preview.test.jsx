import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "../src/renderer/src/ui/messages/MessageBubble.jsx";

globalThis.React = React;

const message = { id: "reply-1", role: "assistant", content: "测试回复" };

describe("chat avatar preview trigger", () => {
  it("makes roleplay and agent avatars clickable without changing messages without images", () => {
    const roleplay = renderToStaticMarkup(React.createElement(MessageBubble, {
      message, avatar: "data:image/png;base64,AAAA", name: "角色甲", layoutMode: "roleplay",
    }));
    expect(roleplay).toContain('class="avatar avatar-preview-trigger"');
    expect(roleplay).toContain('aria-label="放大角色甲的头像"');
    expect(roleplay).toContain('type="button"');

    const agent = renderToStaticMarkup(React.createElement(MessageBubble, {
      message, avatar: "data:image/png;base64,AAAA", name: "角色甲", layoutMode: "agent",
    }));
    expect(agent).toContain('class="avatar avatar-preview-trigger"');
    expect(agent).toContain('aria-label="放大角色甲的头像"');

    const withoutImage = renderToStaticMarkup(React.createElement(MessageBubble, {
      message, name: "角色甲", layoutMode: "roleplay",
    }));
    expect(withoutImage).not.toContain("avatar-preview-trigger");
  });
});
