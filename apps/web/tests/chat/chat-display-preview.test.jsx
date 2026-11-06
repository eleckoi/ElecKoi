// @vitest-environment jsdom
import React, { act, useState } from "react";
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
  it('places the provided locale control inside chat display without adding a language navigation page', () => {
    let changeLocale;
    function Harness() {
      const [page, setPage] = useState('chat');
      const [language, setLanguage] = useState('中文');
      changeLocale = () => setLanguage('日本語');
      return <WithOfficialMarkdown><SettingsPanel activePage={page} onPageChange={setPage}
        chatDisplay={DEFAULT_CHAT_DISPLAY_PREFERENCES} onChatDisplayChange={() => {}}
        settingsSections={[{ id: 'plugins', label: '内置插件' }]}
        renderLanguageSettings={() => <button aria-haspopup="menu" onClick={changeLocale}>{language}</button>}
        renderSettingsSection={() => <p>插件设置</p>}
        renderLayout={({ sidePanel, mainPanel }) => <>{sidePanel}{mainPanel}</>} /></WithOfficialMarkdown>;
    }
    renderToMarkup(<Harness />);
    const section = document.querySelector('.chat-display-settings-page [aria-label="界面语言"]');
    const group = section.closest('[data-group="language"]');
    expect(group?.querySelector('summary svg[aria-hidden="true"]')).toBeTruthy();
    expect([...document.querySelectorAll('.ec-settings-list [data-group]')].at(-1)).toBe(group);
    expect(group.closest('.ec-group-material')).toBeTruthy();
    expect(group.open).toBe(false);
    act(() => group.querySelector('summary').click());
    expect(group.open).toBe(true);
    act(() => section.querySelector('button').click());
    expect(section.textContent).toBe('日本語');
    const labels = [...document.querySelectorAll('[aria-label="设置分类"] button')].map(node => node.textContent);
    expect(labels).toEqual(['用户资料', '主题风格', '聊天显示', '关于 ElecKoi', '内置插件']);
    act(() => [...document.querySelectorAll('[aria-label="设置分类"] button')].find(node => node.textContent === '内置插件').click());
    expect(document.querySelector('.app-settings-content').textContent).toBe('插件设置');
    expect(document.querySelector('[aria-label="界面语言"]')).toBeNull();
  });

  it('updates the formal layout style, preview, individual resets, and layout isolation', () => {
    let preferences;
    function Harness() {
      const [value, update] = useState(structuredClone(DEFAULT_CHAT_DISPLAY_PREFERENCES));
      preferences = value;
      return <WithOfficialMarkdown><SettingsPanel activePage="chat" chatDisplay={value} onChatDisplayChange={update}
        renderLayout={({ mainPanel }) => mainPanel} /></WithOfficialMarkdown>;
    }
    renderToMarkup(<Harness />);
    const input = (label, value) => act(() => {
      const node = document.querySelector(`[aria-label="${label}"]`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const click = label => act(() => document.querySelector(`[aria-label="${label}"]`).click());
    expect(document.querySelector('[data-group="layout-style"]')).toBeTruthy();
    expect([...document.querySelectorAll('.ec-settings-list [data-group]')].at(-1).dataset.group).toBe('layout-style');
    expect(document.querySelector('[aria-label="对话底板"]').checked).toBe(false);
    expect(document.querySelector('[aria-label="消息气泡"]').checked).toBe(false);
    click('对话底板');
    click('消息气泡');
    input('用户气泡色调', '#987654');
    input('底板模糊程度滑杆', '31');
    expect(preferences.roleplay_style).toMatchObject({ bubbles_enabled: true, user_bubble_tint: '#987654', assistant_bubble_tint: null, backdrop_blur: 31 });
    expect(document.querySelector('.chat-display-preview').style.getPropertyValue('--rp-user-tint')).toBe('#987654');
    click('对话底板'); click('对话底板');
    expect(preferences.roleplay_style.backdrop_blur).toBe(31);
    click('恢复用户气泡色调默认值');
    expect(preferences.roleplay_style.user_bubble_tint).toBeNull();
    act(() => document.querySelectorAll('.ec-layout-choice')[1].click());
    expect(document.querySelector('[data-group="layout-style"]')).toBeNull();
    expect(document.querySelector('.chat-display-preview').hasAttribute('data-roleplay-backdrop')).toBe(false);
    expect(document.querySelector('.chat-display-preview').style.getPropertyValue('--rp-backdrop-blur')).toBe('');
    act(() => document.querySelectorAll('.ec-layout-choice')[0].click());
    expect(document.querySelector('.chat-display-preview').hasAttribute('data-roleplay-bubbles')).toBe(true);
    expect(preferences.roleplay_style.backdrop_blur).toBe(31);
  });
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
    expect(behavior.textContent).toContain('生成统计');
    expect(behavior.textContent).not.toMatch(/思维链|适当收起|全量展开/);
    expect(behavior.querySelector('select')).toBeNull();
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
