// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileConversationPage } from '../../src/mobile/MobileConversationPage.jsx';
import { MessageBubble } from '../helpers/officialMarkdown.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
const message = { id: 'synthetic-message', role: 'assistant', content: 'Synthetic original text' };
beforeEach(() => {
  document.documentElement.dataset.eleckoiMobile = 'true';
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  delete document.documentElement.dataset.eleckoiMobile; vi.unstubAllGlobals();
});
async function openEditor(onEdit) {
  await act(async () => root.render(<MobileConversationPage>
    <MessageBubble message={message} onEdit={onEdit} />
  </MobileConversationPage>));
  await act(async () => container.querySelector('[aria-label="编辑"]').click());
  const input = container.querySelector('.message-inline-editor textarea');
  await act(async () => {
    input.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Synthetic changed text');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}

describe('mobile message edit actions', () => {
  it.each(['取消', '保存'])('leaves pointer defaults available and commits only when %s is clicked', async label => {
    const onEdit = vi.fn(async () => true), input = await openEditor(onEdit);
    const button = [...container.querySelectorAll('.message-inline-editor button')].find(node => node.textContent === label);
    for (const type of ['pointerdown', 'mousedown']) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
      await act(async () => button.dispatchEvent(event));
      expect(input.getAttribute('inputmode')).toBeNull();
      expect(event.defaultPrevented).toBe(false);
      expect(input.value).toBe('Synthetic changed text');
      expect(onEdit).not.toHaveBeenCalled();
    }
    await act(async () => button.click());
    expect(container.querySelector('.message-inline-editor')).toBeNull();
    if (label === '保存') expect(onEdit).toHaveBeenCalledExactlyOnceWith(message, 'Synthetic changed text');
    else expect(onEdit).not.toHaveBeenCalled();
  });

  it('does not save on a cancelled touch and preserves the draft after a rejected save', async () => {
    const onEdit = vi.fn(async () => false), input = await openEditor(onEdit);
    const save = container.querySelector('.message-inline-editor button:last-child');
    await act(async () => {
      save.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      save.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    });
    expect(onEdit).not.toHaveBeenCalled();
    expect(input.value).toBe('Synthetic changed text');
    await act(async () => save.click());
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.message-inline-editor textarea')).toBe(input);
    expect(input.value).toBe('Synthetic changed text');
    expect(input.getAttribute('inputmode')).toBeNull();
  });

  it('keeps ordinary keyboard focus and activation available on the action buttons', async () => {
    const onEdit = vi.fn(async () => true), input = await openEditor(onEdit);
    const save = container.querySelector('.message-inline-editor button:last-child');
    await act(async () => save.focus());
    expect(document.activeElement).toBe(save);
    await act(async () => save.click());
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(message, 'Synthetic changed text');
    expect(container.querySelector('.message-inline-editor')).toBeNull();
  });
});
