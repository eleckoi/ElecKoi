// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { UserProfileSettings } from '../../src/modules/settings/components/SettingsPanel.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.useRealTimers();
  document.body.innerHTML = '';
});
function mount(save) {
  let owner;
  function Harness() {
    const [persona, setPersona] = useState({ user_name: '初始名字' });
    return <UserProfileSettings autoSave persona={persona} onUpdateUserProfile={async candidate => {
      const result = await save(candidate);
      setPersona(result);
      return result;
    }} renderUserProfileEditor={(next, view) => { owner = next; return view; }} />;
  }
  const element = document.createElement('div'); document.body.append(element);
  const root = createRoot(element); roots.push(root);
  act(() => root.render(<Harness />));
  return { owner: () => owner, root, element };
}
const result = ({ name, avatars }) => ({ user_name: name, user_avatar: avatars.circle,
  user_square: avatars.square, user_portrait: avatars.portrait });
const advance = async time => act(async () => { await vi.advanceTimersByTimeAsync(time); });

it('debounces edits and flushes a pending name when leaving the page', async () => {
  vi.useFakeTimers();
  const save = vi.fn(async draft => result(draft)), page = mount(save);
  act(() => page.owner().onChange({ name: '名字甲' }));
  await advance(250);
  act(() => page.owner().onChange({ name: '名字乙' }));
  await advance(399); expect(save).not.toHaveBeenCalled();
  await advance(1); expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].name).toBe('名字乙');
  act(() => page.owner().onChange({ name: '离开前的新名字' }));
  await act(async () => page.root.unmount()); roots.pop();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0].name).toBe('离开前的新名字');
});

it('serializes overlapping edits and never replaces the latest draft with an older response', async () => {
  vi.useFakeTimers();
  const pending = [], save = vi.fn(candidate => new Promise(resolve => pending.push(() => resolve(result(candidate)))));
  const page = mount(save);
  act(() => page.owner().onChange({ name: '正在写入的名字' })); await advance(400);
  act(() => page.owner().onChange({ name: '最新名字' })); await advance(400);
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => pending.shift()());
  expect(page.element.querySelector('input').value).toBe('最新名字');
  expect(save).toHaveBeenCalledTimes(2);
  await act(async () => pending.shift()());
  expect(page.element.querySelector('input').value).toBe('最新名字');
  expect(page.owner().dirty).toBe(false);
});

it('keeps failed edits and retries without an automatic retry loop', async () => {
  vi.useFakeTimers();
  const save = vi.fn().mockRejectedValueOnce(new Error('保存暂时失败')).mockImplementation(async draft => result(draft));
  const page = mount(save);
  act(() => page.owner().onChange({ name: '保留的名字' })); await advance(400);
  expect(page.element.querySelector('[role=alert]').textContent).toContain('保存暂时失败');
  await advance(10000); expect(save).toHaveBeenCalledTimes(1);
  await act(async () => page.element.querySelector('.sd-error button').click());
  expect(save).toHaveBeenCalledTimes(2);
  expect(page.element.querySelector('[role=alert]')).toBeNull();
  expect(page.owner().profile.name).toBe('保留的名字');
});

it('saves final composed text rather than intermediate input', async () => {
  vi.useFakeTimers();
  const save = vi.fn(async draft => result(draft)), page = mount(save);
  const input = page.element.querySelector('input');
  const change = (value, composing) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: composing }));
  });
  change('shu', true); await advance(700); expect(save).not.toHaveBeenCalled();
  change('输入完成', false); await advance(400);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].name).toBe('输入完成');
});

it('retains a newer avatar draft while a previous name is saving', async () => {
  vi.useFakeTimers();
  const pending = [], save = vi.fn(candidate => new Promise(resolve => pending.push(() => resolve(result(candidate)))));
  const page = mount(save);
  act(() => page.owner().onChange({ name: '新名字' })); await advance(400);
  act(() => page.owner().onChange({ avatars: { circle: 'new-circle.png', square: 'new-square.png', portrait: 'new-portrait.png' } }));
  await advance(400); await act(async () => pending.shift()());
  expect(page.owner().profile.avatars.circle).toBe('new-circle.png');
  expect(save.mock.calls[1][0]).toMatchObject({ name: '新名字', avatars: { portrait: 'new-portrait.png' } });
  await act(async () => pending.shift()());
  expect(page.owner().dirty).toBe(false);
});
