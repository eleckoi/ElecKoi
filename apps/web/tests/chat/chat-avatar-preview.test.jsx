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
  it.each(['roleplay', 'agent'])('opens %s shortcuts before the existing full avatar preview and pin action', async layoutMode => {
    const pin = vi.fn(), edit = vi.fn();
    const avatar = await mount({ layoutMode, onEditCharacter: edit, onPinAvatar: pin });
    await click(avatar);
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(menuItems().map(node => node.textContent)).toEqual(['查看头像', '角色卡编辑']);
    expect(host.querySelector('[role=menu]')).toBeNull();
    expect(document.querySelector('[role=separator]')).toBeNull();
    await click(menuItems()[0]);
    expect(menuItems()).toHaveLength(0);
    expect(document.querySelector('[role=dialog]')).not.toBeNull();
    await click([...document.querySelectorAll('.avatar-preview-modal button')].find(button => button.textContent === '固定在聊天中'));
    expect(pin).toHaveBeenCalledWith({ src: 'data:image/png;base64,AAAA', name: '合成角色' });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(avatar);
    expect(edit).not.toHaveBeenCalled();
  });
  it.each(['roleplay', 'agent'])('returns %s avatar focus on Escape and uses arrow keys to reach the character editor', async layoutMode => {
    const edit = vi.fn();
    const avatar = await mount({ layoutMode, onEditCharacter: edit });
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
  it.each(['roleplay', 'agent'])('keeps the direct user avatar preview in %s', async layoutMode => {
    const avatar = await mount({ message: { ...message, role: 'user' }, layoutMode, onEditCharacter: vi.fn() });
    await click(avatar); expect(menuItems()).toHaveLength(0);
    expect(document.querySelector('.avatar-preview-modal')).not.toBeNull();
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

  it("renders the speakers in a generated reply using the current layout's avatar shape", () => {
    const openingCharacter = { id: 'card', cast: [
      { id: 'speaker-a', name: '合成角色甲新名字', portraitAssetId: 'speaker-a-portrait', circleAssetId: 'speaker-a-circle' },
      { id: 'speaker-b', name: '合成角色乙', portraitAssetId: 'speaker-b-portrait', circleAssetId: 'speaker-b-circle' }
    ] };
    const reply = { ...message, roleplayReply: true, pending: true, created_at: '2026-11-25T17:20:00+08:00', roleplayBlocks: [
      { id: 'b:1', kind: 'speech', speakerId: 'speaker-a', speakerName: '合成角色甲', text: '录音机开始转动。\n\n我按回放。\n\n你听。' },
      { id: 'c:0', kind: 'speech', speakerName: '合成角色甲', text: '这里有个声音。' },
      { id: 'c:1', kind: 'speech', speakerName: '合成角色乙', text: '等一下。' }
    ] };
    const render = (layoutMode, avatarShape) => renderToStaticMarkup(React.createElement(MessageBubble,
      { message: reply, openingCharacter, layoutMode, avatarShape, floorNumber: 6 }));
    const roleplay = render('roleplay', 'portrait');
    expect(roleplay.match(/data-roleplay-block="[^"]+"/g)).toEqual([
      'data-roleplay-block="speech"', 'data-roleplay-block="speech"'
    ]);
    expect([...roleplay.matchAll(/class="message-floor"[^>]*>(#\d+)/g)].map(match => match[1])).toEqual(['#6', '#7']);
    expect(roleplay.match(/class="message-timestamp"/g)).toHaveLength(2);
    expect(roleplay).toContain('speaker-a-portrait');
    expect(roleplay).toContain('speaker-b-portrait');
    expect(roleplay).toContain('放大合成角色甲的头像');
    expect(roleplay).toContain('放大合成角色乙的头像');
    expect(roleplay.match(/<article\b/g)).toHaveLength(1);
    expect(roleplay.match(/aria-label="放大合成角色甲的头像"/g)).toHaveLength(1);
    expect(roleplay.indexOf('录音机开始转动。')).toBeLessThan(roleplay.indexOf('我按回放。'));
    expect(roleplay.indexOf('我按回放。')).toBeLessThan(roleplay.indexOf('你听。'));
    expect(roleplay.indexOf('你听。')).toBeLessThan(roleplay.indexOf('这里有个声音。'));
    const agent = render('agent', 'circle');
    expect(agent).toContain('speaker-a-circle');
    expect(agent).toContain('speaker-b-circle');
  });

  it('uses the named card cover for consecutive streamed blocks when there is no cast', () => {
    const reply = { ...message, pending: true, roleplayBlocks: [
      { id: 'a:0', kind: 'speech', speakerName: '合成卡片', text: '第一段。' },
      { id: 'b:0', kind: 'speech', speakerName: '合成卡片', text: '' },
    ] };
    const markup = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: reply, avatar: 'data:image/png;base64,AAAA', name: '合成卡片', floorNumber: 6,
    }));
    expect(markup.match(/data-roleplay-block="speech"/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="放大合成卡片的头像"');
    expect(markup).toContain('>#6</span>');
    expect(markup).toContain('第一段。');
  });

  it.each([false, true])(
    'shows waiting dots until text arrives or the reply stops (after another speaker: %s)', async hasPrevious => {
      const previous = hasPrevious ? [{ id: 'first:0', kind: 'speech', speakerName: '合成发言甲', text: '第一段。' }] : [];
      const speaker = { id: 'next:0', kind: 'speech', speakerName: '合成发言乙', text: '' };
      const reply = { ...message, pending: true, roleplayBlocks: [...previous, speaker] };
      await mount({ message: reply });
      const waiting = () => host.querySelector('.roleplay-reply-waiting');
      expect(waiting().getAttribute('aria-label')).toBe('正在回复...');
      expect(waiting().children).toHaveLength(3);
      expect(waiting().closest('[data-roleplay-block]').textContent).toContain('合成发言乙');
      expect(host.querySelectorAll('.roleplay-reply-waiting')).toHaveLength(1);

      const render = next => act(async () => root.render(<ProductLocaleProvider><MessageBubble message={next} /></ProductLocaleProvider>));
      await render({ ...reply, roleplayBlocks: [...previous, { ...speaker, text: '开始回复。' }] });
      expect(waiting()).toBeNull();
      expect(host.textContent).toContain('开始回复。');
      await render({ ...reply, pending: false, status: 'cancelled' });
      expect(waiting()).toBeNull();
    },
  );

  it('edits a multipart reply through one button and saves the attached speaker text with the whole reply', async () => {
    const reply = { ...message, roleplayBlocks: [
      { id: 'b:0', kind: 'speech', speakerName: '合成角色甲', text: '先等等。' },
      { id: 'b:1', kind: 'speech', speakerName: '合成角色乙', text: '好。' },
    ] };
    const edit = vi.fn().mockResolvedValue(true);
    await mount({ message: reply, onEdit: edit });
    expect(host.querySelectorAll('button[aria-label="编辑"]')).toHaveLength(1);
    expect(host.querySelector('.roleplay-reply-turn > .roleplay-reply-part > .message-tools')).not.toBeNull();
    await click(host.querySelector('button[aria-label="编辑"]'));
    const fields = [...host.querySelectorAll('.message-inline-editor textarea')];
    expect(fields.map(field => field.value)).toEqual(['先等等。', '好。']);
    expect(fields[1].closest('[data-roleplay-block]').textContent).toContain('合成角色乙');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(fields[1], '我在听。');
      fields[1].dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = host.querySelectorAll('.message-inline-editor button.primary');
    expect(save).toHaveLength(1);
    await click(save[0]);
    expect(edit).toHaveBeenCalledExactlyOnceWith(reply, [{ id: 'b:0', text: '先等等。' }, { id: 'b:1', text: '我在听。' }]);
    expect(host.querySelector('.message-inline-editor')).toBeNull();
  });

  it('renders one merged regex result per speaker and ignores a projection for stale text', () => {
    const reply = { ...message, roleplayReply: true, roleplayBlocks: [
      { id: 'a:0', kind: 'speech', speakerName: '合成发言甲', text: '原文前半。' },
      { id: 'b:0', kind: 'speech', speakerName: '合成发言甲', text: '原文后半。' },
      { id: 'c:0', kind: 'speech', speakerName: '合成发言乙', text: '新正文。' },
    ], roleplayGroups: [
      { id: 'a:0', sourceText: '原文前半。\n\n原文后半。', displayText: '合并后替换。' },
      { id: 'c:0', sourceText: '旧正文。', displayText: '已过期的替换。' },
    ] };
    const markup = renderToStaticMarkup(React.createElement(MessageBubble, { message: reply }));
    expect(markup.match(/合并后替换。/g)).toHaveLength(1);
    expect(markup).not.toContain('原文前半。');
    expect(markup).toContain('新正文。');
    expect(markup).not.toContain('已过期的替换。');
  });
});
