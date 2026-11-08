// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBubble } from "../helpers/officialMarkdown.jsx";
import { ProductLocaleProvider } from '../../src/app/i18n/ProductLocaleContext.jsx';
import { officialLocale } from '../../../../tests/helpers/officialLocale.js';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, host;
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 10));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function mount(props = {}, locale) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<ProductLocaleProvider locale={locale}><MessageBubble message={message}
    avatar="data:image/png;base64,AAAA" name="合成角色" {...props} /></ProductLocaleProvider>));
  return host.querySelector('.avatar-preview-trigger');
}
async function click(node) { await act(async () => node.click()); }
const menuItems = () => [...document.querySelectorAll('.avatar-actions-menu [role=menuitem]')];

const message = { id: "reply-1", role: "assistant", content: "测试回复" };

describe("chat avatar preview trigger", () => {
  it('opens shortcuts before the existing full avatar preview and pin action', async () => {
    const pin = vi.fn(), edit = vi.fn();
    const avatar = await mount({ onEditCharacter: edit, onPinAvatar: pin });
    await click(avatar);
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(menuItems().map(node => node.textContent)).toEqual(['查看头像', '角色卡编辑']);
    expect(host.querySelector('[role=menu]')).toBeNull();
    expect(document.querySelector('[role=separator]')).toBeNull();
    await click(menuItems()[0]);
    expect(menuItems()).toHaveLength(0);
    expect(document.querySelector('[role=dialog]')).not.toBeNull();
    await click(document.querySelector('.avatar-preview-pin'));
    expect(pin).toHaveBeenCalledWith({ src: 'data:image/png;base64,AAAA', name: '合成角色' });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(avatar);
    expect(edit).not.toHaveBeenCalled();
  });
  it('returns focus on Escape and uses arrow keys to reach the character editor', async () => {
    const edit = vi.fn();
    const avatar = await mount({ onEditCharacter: edit });
    await click(avatar);
    expect(document.activeElement).toBe(menuItems()[0]);
    await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menuItems()).toHaveLength(0); expect(document.activeElement).toBe(avatar);
    await click(avatar);
    await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement).toBe(menuItems()[1]);
    await click(document.activeElement);
    expect(edit).toHaveBeenCalledOnce(); expect(menuItems()).toHaveLength(0);
    expect(document.activeElement).toBe(avatar);
  });
  it('dismisses outside and removes a previous conversation menu on navigation', async () => {
    const props = { onEditCharacter: vi.fn() };
    const avatar = await mount(props);
    await click(avatar);
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(menuItems()).toHaveLength(0);
    await click(avatar);
    await act(async () => root.render(<MessageBubble message={{ ...message, conversationId: 'other-chat' }}
      avatar="data:image/png;base64,AAAA" name="另一个合成角色" {...props} />));
    expect(menuItems()).toHaveLength(0);
    expect(document.querySelector('[data-menu-backing]')).toBeNull();
  });
  it('allows editing a character without an avatar while keeping image-only actions unavailable', async () => {
    const edit = vi.fn();
    const avatar = await mount({ avatar: '', onEditCharacter: edit });
    await click(avatar);
    expect(menuItems()[0].disabled).toBe(true);
    expect(document.activeElement).toBe(menuItems()[1]);
    await click(menuItems()[1]); expect(edit).toHaveBeenCalledOnce();
  });
  it.each(['user', 'agent'])('keeps the direct avatar preview for %s', async mode => {
    const avatar = await mount({ message: { ...message, role: mode === 'user' ? 'user' : 'assistant' },
      layoutMode: mode === 'agent' ? 'agent' : 'roleplay', onEditCharacter: vi.fn() });
    await click(avatar); expect(menuItems()).toHaveLength(0);
    expect(document.querySelector('.avatar-preview-dialog')).not.toBeNull();
  });
  it('updates all eight interface languages without replacing the open avatar menu', async () => {
    const locale = officialLocale();
    const avatar = await mount({ onEditCharacter: vi.fn() }, locale);
    await click(avatar); const menu = document.querySelector('.avatar-actions-menu');
    for (const language of ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']) {
      await act(async () => locale.setLocale(language));
      const t = locale.bind('eleckoi.ui');
      expect(menuItems().map(node => node.textContent)).toEqual([t('查看头像'), t('角色卡编辑')]);
      expect(document.querySelector('.avatar-actions-menu')).toBe(menu);
      expect(document.activeElement).toBe(menuItems()[0]);
    }
  });
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
