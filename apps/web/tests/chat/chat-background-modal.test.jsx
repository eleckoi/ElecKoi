// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatBackgroundModal } from '../../src/modules/chat/components/ChatBackgroundModal.jsx';
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from '@shared/contracts/settings/schemas';
import { APP_DEFAULT_CHAT_BACKGROUND, GLOBAL_CHAT_BACKGROUND } from '@shared/contracts/characters/chatBackground';

const crop = vi.hoisted(() => vi.fn(() => null));
vi.mock('../../src/ui/ui/AvatarCropModal.jsx', () => ({ AvatarCropModal: crop }));
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, saved, onSave;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.replaceChildren(); crop.mockClear(); });
async function mount() {
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  onSave = vi.fn();
  function Harness() {
    const [character, update] = useState({ id: 'synthetic-background', chatBackground: APP_DEFAULT_CHAT_BACKGROUND });
    const [open, toggle] = useState(true); saved = character;
    return <><button onClick={() => toggle(true)}>重新打开背景</button><ChatBackgroundModal open={open} character={character}
      chatDisplay={DEFAULT_CHAT_DISPLAY_PREFERENCES} onClose={() => toggle(false)}
      onSaveCharacter={async patch => { onSave(patch); update(current => ({ ...current, ...patch })); }} /></>;
  }
  await act(async () => root.render(<Harness />));
}
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const click = async text => act(async () => button(text).click());
async function input(label, value) {
  await act(async () => {
    const node = document.querySelector(`[aria-label="${label}"]`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function upload(content) {
  const file = new File([content], 'synthetic.png', { type: 'image/png' });
  const picker = document.querySelector('input[type=file]');
  Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
  await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })));
  await act(async () => crop.mock.calls.at(-1)[0].onSave(file));
}

it('keeps the uploaded custom image and tuning after saving plain, artwork, and shared modes', async () => {
  await mount(); await click('自定义图片'); await upload('first');
  await input('背景透明度数值', '87'); await input('背景模糊数值', '7'); await input('阅读遮罩数值', '23');
  await click('保存');
  const custom = saved.chatBackgroundCustom;
  expect(custom).toEqual({ image: `data:image/png;base64,${btoa('first')}`, opacity: .87, blur: 7, scrim: .23 });
  for (const [label, mode] of [['纯色背景', APP_DEFAULT_CHAT_BACKGROUND], ['角色立绘', ''], ['共享背景', GLOBAL_CHAT_BACKGROUND]]) {
    await click('重新打开背景'); await act(async () => document.querySelector('.chat-background-modes').querySelectorAll('button')[["纯色背景","角色立绘","自定义图片","共享背景"].indexOf(label)].click());
    await click('保存'); expect(saved.chatBackground).toBe(mode); expect(saved.chatBackgroundCustom).toEqual(custom);
    await click('重新打开背景'); await click('自定义图片');
    expect(document.querySelector('.chat-background-preview-image').getAttribute('src')).toBe(custom.image);
    expect(document.querySelector('[aria-label="背景透明度数值"]').value).toBe('87');
    expect(document.querySelector('[aria-label="背景模糊数值"]').value).toBe('7');
    expect(document.querySelector('[aria-label="阅读遮罩数值"]').value).toBe('23');
    await click('保存');
  }
});

it('discards an unsaved replacement when cancelled and does not call persistence', async () => {
  await mount(); await click('自定义图片'); await upload('saved'); await click('保存');
  const previous = saved.chatBackgroundCustom; onSave.mockClear();
  await click('重新打开背景'); await upload('cancelled'); await click('取消');
  expect(onSave).not.toHaveBeenCalled();
  await click('重新打开背景');
  expect(document.querySelector('.chat-background-preview-image').getAttribute('src')).toBe(previous.image);
});
