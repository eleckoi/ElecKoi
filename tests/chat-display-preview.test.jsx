import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsPanel } from "../src/renderer/src/modules/settings/components/SettingsPanel.jsx";
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from "../src/shared/contracts/settings/schemas.ts";

globalThis.React = React;

describe("chat display preview", () => {
  it("uses the active persona without a fixed conversation title", () => {
    const html = renderToStaticMarkup(React.createElement(SettingsPanel, {
      activePage: "chat",
      persona: { user_name: "访客乙", assistant_name: "角色甲" },
      chatDisplay: { ...DEFAULT_CHAT_DISPLAY_PREFERENCES, layout: "agent" },
      onChatDisplayChange: () => {},
      renderLayout: ({ mainPanel }) => mainPanel,
    }));

    expect(html).toContain("访客乙");
    expect(html).toContain("角色甲");
    expect(html).not.toContain("chat-display-preview-bar");
  });

  it("places roleplay message switches in their own settings section", () => {
    const html = renderToStaticMarkup(React.createElement(SettingsPanel, {
      activePage: "chat",
      chatDisplay: DEFAULT_CHAT_DISPLAY_PREFERENCES,
      onChatDisplayChange: () => {},
      renderLayout: ({ mainPanel }) => mainPanel,
    }));
    const sectionContaining = (label) => {
      const heading = html.indexOf(`<strong>${label}</strong>`);
      return html.slice(html.lastIndexOf("<section", heading), html.indexOf("</section>", heading));
    };

    expect(sectionContaining("消息信息")).toContain("聊天时间戳");
    expect(sectionContaining("消息信息")).toContain("显示消息楼层");
    expect(sectionContaining("头像与名字")).not.toContain("聊天时间戳");
    expect(sectionContaining("头像与名字")).not.toContain("显示消息楼层");
  });
});
