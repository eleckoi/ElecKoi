// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UserMessageNodeView } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/MessageItem.tsx';
import { CreatorStudioUserMessageEditAction } from '../../src/modules/creatorStudio/components/CreatorStudioUserMessageEditAction.jsx';

globalThis.React = React; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, model, state, listeners, renderState, original;
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  state = { active: { sessionId: 'studio-a' }, editingSessionId: '' }; listeners = new Set();
  model = { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => state, editUserMessage: vi.fn(async () => {}) };
  original = { kind: 'user', key: 'user-7', anchorSeq: 7, data: { kind: 'user', seq: 7, time: 0, source: { kind: 'user' }, content: [{ type: 'text', text: '第一段' }, { type: 'image', attachment: { id: 'image-a' } }, { type: 'text', text: '最后一段' }] } };
});
afterEach(async () => { if (root) await act(() => root.unmount()); root = null; document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount({ running = false, node = original } = {}) {
  function Harness() {
    const [snapshot, setSnapshot] = useState({ running, node }); renderState = setSnapshot;
    return <UserMessageNodeView node={snapshot.node} loadImage={vi.fn()} t={key => ({ copy: '复制', copied: '已复制' }[key] || key)} renderSlotChain={() => null}
      renderFactorySlot={(_name, owner) => <div data-native-user-content>{owner.content.text}</div>}
      renderSlot={(name, owner) => name === 'conversation.chat.user-actions' ? <CreatorStudioUserMessageEditAction {...owner} sessionId="studio-a" model={model} useSession={select => select({ running: snapshot.running })} /> : null} />;
  }
  const nodeRoot = document.createElement('main'); document.body.append(nodeRoot); root = createRoot(nodeRoot); await act(() => root.render(<Harness />));
}
const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent.trim() === label);
async function click(label) { const target = button(label); expect(target, label).toBeTruthy(); await act(async () => target.click()); }
async function input(text) { const node = document.querySelector('textarea'); await act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, text); node.dispatchEvent(new Event('input', { bubbles: true })); }); }

it('places Modify immediately after the native Copy control and saves the exact original user sequence and full text', async () => {
  await mount();
  const copy = button('复制'), edit = button('修改用户输入');
  expect(copy.parentElement).toBe(edit.parentElement);
  expect(copy.nextElementSibling).toBe(edit);
  await click('修改用户输入');
  expect(document.querySelector('textarea').value).toBe('第一段\n最后一段');
  const text = `  修改内容\n${'长正文'.repeat(1000)}\n末尾  `;
  await input(text); await click('保存');
  expect(model.editUserMessage).toHaveBeenCalledExactlyOnceWith(7, text);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[data-native-user-content]')).toBeTruthy();
});
it('keeps the editor text on failure, retries only that input and cancels without saving', async () => {
  await mount(); await click('修改用户输入'); await input('取消这次修改'); await click('取消');
  expect(model.editUserMessage).not.toHaveBeenCalled();
  await click('修改用户输入'); await input('保留失败内容');
  model.editUserMessage.mockRejectedValueOnce(new Error('Synthetic write failure'));
  await click('保存');
  expect(document.querySelector('textarea').value).toBe('保留失败内容');
  expect(document.querySelector('[role="alert"]').textContent).toContain('Synthetic write failure');
  await click('保存'); expect(model.editUserMessage.mock.calls).toEqual([[7, '保留失败内容'], [7, '保留失败内容']]);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('prevents empty or unchanged saves, blocks duplicate writes and disables editing during generation', async () => {
  await mount(); await click('修改用户输入'); expect(button('保存').disabled).toBe(true);
  await input('  '); expect(button('保存').disabled).toBe(true);
  await input('等待保存'); let finish;
  model.editUserMessage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click('保存'); expect(button('处理中…').disabled).toBe(true);
  await click('处理中…'); expect(model.editUserMessage).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  await act(() => renderState({ node: original, running: true }));
  expect(button('修改用户输入').disabled).toBe(true);
});
it('has no modification action on steering or machine input and hides an open editor after switching Sessions', async () => {
  await mount({ node: { ...original, kind: 'steering' } }); expect(button('修改用户输入')).toBeUndefined();
  await act(() => renderState({ node: { ...original, data: { ...original.data, source: { kind: 'tool' } } }, running: false }));
  expect(button('修改用户输入')).toBeUndefined();
  await act(() => renderState({ node: original, running: false })); await click('修改用户输入'); await input('尚未保存');
  await act(() => { state = { active: { sessionId: 'studio-b' }, editingSessionId: '' }; listeners.forEach(fn => fn()); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(model.editUserMessage).not.toHaveBeenCalled();
});
