// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsPanel } from "../../src/modules/settings/components/SettingsPanel.jsx";
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from "../../../../packages/shared/src/contracts/settings/schemas.ts";
import { WithOfficialMarkdown } from "../helpers/officialMarkdown.jsx";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const roots = [];
function renderToMarkup(element) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => root.render(element));
  return container.innerHTML;
}
afterEach(() => {
  for (const { root, container } of roots.splice(0)) { act(() => root.unmount()); container.remove(); }
});

describe("chat display preview", () => {
  it("shows the same rich message count and bounds as mobile only when limits are enabled", () => {
    const render = enabled => renderToMarkup(React.createElement(WithOfficialMarkdown, null,
      React.createElement(SettingsPanel, { activePage: "chat", chatDisplay: { ...DEFAULT_CHAT_DISPLAY_PREFERENCES,
        rich_message_limit_enabled: enabled, rich_message_floor_limit: 7 }, onChatDisplayChange: () => {},
        renderLayout: ({ mainPanel }) => mainPanel })));
    expect(render(false)).toContain('限制富消息运行楼层');
    expect(render(false)).not.toContain('自动运行楼层数数值');
    const html = render(true);
    expect(html).toContain('aria-label="自动运行楼层数数值"');
    expect(document.querySelector('[aria-label="自动运行楼层数数值"]').min).toBe('1');
    expect(html).not.toMatch(/aria-label="自动运行楼层数数值"[^>]* max=/);
  });
  it("uses the active persona without a fixed conversation title", () => {
    const html = renderToMarkup(React.createElement(WithOfficialMarkdown, null,
      React.createElement(SettingsPanel, {
        activePage: "chat",
        persona: { user_name: "访客乙", assistant_name: "角色甲" },
        chatDisplay: { ...DEFAULT_CHAT_DISPLAY_PREFERENCES, layout: "agent" },
        onChatDisplayChange: () => {},
        renderLayout: ({ mainPanel }) => mainPanel,
      }),
    ));

    expect(html).toContain("访客乙");
    expect(html).toContain("角色甲");
    expect(html).not.toContain("chat-display-preview-bar");
  });

  it("keeps message information in the behavior group and leaves parameter groups independently expandable", () => {
    renderToMarkup(<WithOfficialMarkdown><SettingsPanel activePage="chat" chatDisplay={DEFAULT_CHAT_DISPLAY_PREFERENCES}
      onChatDisplayChange={() => {}} renderLayout={({ mainPanel }) => mainPanel} /></WithOfficialMarkdown>);
    const behavior = document.querySelector('[data-group="behavior"]');
    expect(behavior.textContent).toContain('聊天时间戳');
    expect(behavior.textContent).toContain('显示消息楼层');
    expect(document.querySelector('[data-group="avatar"]').textContent).not.toContain('聊天时间戳');
    const groups = [...document.querySelectorAll('.ec-group')];
    expect(groups.filter(group => group.open).map(group => group.dataset.group)).toEqual([]);
    document.querySelector('[data-group="avatar"]').open = true;
    document.querySelector('[data-group="typography"]').open = true;
    document.querySelector('[data-group="spacing"]').open = true;
    expect(groups.filter(group => group.open).map(group => group.dataset.group)).toEqual(['avatar', 'typography', 'spacing']);
  });
});
