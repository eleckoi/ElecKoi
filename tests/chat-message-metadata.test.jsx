import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "../src/renderer/src/ui/messages/MessageBubble.jsx";

globalThis.React = React;

const message = {
  id: "message-1",
  role: "assistant",
  content: "回复正文",
  created_at: "2026-08-01T05:05:00+08:00",
};

describe("roleplay message metadata", () => {
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
