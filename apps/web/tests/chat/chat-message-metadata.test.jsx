// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "../helpers/officialMarkdown.jsx";

globalThis.React = React;

const message = {
  id: "message-1",
  role: "assistant",
  content: "回复正文",
  created_at: "2026-08-01T05:05:00+08:00",
};

describe("roleplay message metadata", () => {
  it("places completed turn usage before edit in the agent toolbar", () => {
    const response = { ...message, turnUsage: { uncachedInputTokens: 100, outputTokens: 20, totalTokens: 170 } };
    const html = renderToStaticMarkup(React.createElement(MessageBubble, { message: response, layoutMode: "agent" }));
    expect(html).toContain('aria-label="用量 170 tok"');
    expect(html.indexOf('aria-label="用量 170 tok"')).toBeLessThan(html.indexOf('aria-label="编辑"'));
    const user = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: { ...response, role: "user" }, layoutMode: "agent",
    }));
    expect(user).not.toContain('aria-label="用量 170 tok"');
  });

  it("shows timestamp beside the name and floor below the avatar only in roleplay", () => {
    const roleplay = renderToStaticMarkup(React.createElement(MessageBubble, {
      message, name: "角色甲", layoutMode: "roleplay", floorNumber: 4,
    }));
    expect(roleplay).toContain('class="message-author-line"');
    expect(roleplay).toContain('class="message-timestamp"');
    expect(roleplay).toContain('class="message-floor"');
    expect(roleplay).toContain("#4");
    expect(roleplay).toContain('dateTime="2026-08-01T05:05:00+08:00"');

    const agent = renderToStaticMarkup(React.createElement(MessageBubble, {
      message, name: "角色甲", layoutMode: "agent", floorNumber: 4,
    }));
    expect(agent).not.toContain('class="message-timestamp"');
    expect(agent).not.toContain('class="message-floor"');
  });

  it("respects both switches and ignores invalid timestamps", () => {
    const hidden = renderToStaticMarkup(React.createElement(MessageBubble, {
      message, floorNumber: 4, showRoleplayTimestamp: false, showRoleplayFloor: false,
    }));
    expect(hidden).not.toContain('class="message-timestamp"');
    expect(hidden).not.toContain('class="message-floor"');

    const invalid = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: { ...message, created_at: "invalid" }, floorNumber: 4,
    }));
    expect(invalid).not.toContain('class="message-timestamp"');
    expect(invalid).toContain('class="message-floor"');
  });
});
