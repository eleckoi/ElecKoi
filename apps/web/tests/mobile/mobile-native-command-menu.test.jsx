// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MenuView } from '@deepseek-ai/dsh-client-ui-input-trigger/src/client/MenuView.tsx';
import { MobileConversationPage } from '../../src/mobile/MobileConversationPage.jsx';

let root, host;
const commands = ['file', 'feedback', 'compact', 'permission', 'model', 'export'];
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const store = value => ({ subscribe: () => () => {}, getSnapshot: () => value });

it.each(commands)('lets a touch produce the official %s menu mousedown without moving the editor', async command => {
  const pick = vi.fn(), crumb = vi.fn();
  const menu = store({ open: true, highlight: null, groups: [{ source: 'command', status: 'ready',
    items: commands.map(name => ({ name, label: `合成 ${name}` })) }] });
  const headers = store(new Map([['command', [{ value: 'root', label: '合成返回' }]]]));
  await act(() => root.render(<MobileConversationPage><div data-composer-card>
    <div data-input-scroll><div data-composer-input contentEditable suppressContentEditableWarning>合成草稿</div></div>
    <div data-composer-overlay><MenuView menu={menu} headers={headers} onPick={pick} onCrumb={crumb}
      onHover={()=>{}} onDismiss={()=>{}} t={key=>key} /></div>
  </div></MobileConversationPage>));
  const input = host.querySelector('[data-composer-input]');
  await act(() => { input.dispatchEvent(new MouseEvent('pointerdown', {bubbles:true})); input.focus(); });
  expect(input.getAttribute('inputmode')).toBeNull();
  const option = [...host.querySelectorAll('[role="option"]')].find(row => row.textContent.includes(`合成 ${command}`));
  const down = new MouseEvent('pointerdown', {bubbles:true,cancelable:true,button:0});
  await act(() => option.querySelector('span').dispatchEvent(down));
  // Cancelling touch pointerdown suppresses the mouse compatibility event that DSH owns.
  expect(down.defaultPrevented).toBe(false);
  expect(pick).not.toHaveBeenCalled();
  await act(() => option.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true,button:0})));
  expect(pick).toHaveBeenCalledExactlyOnceWith('command', commands.indexOf(command));
  expect(document.activeElement).toBe(input);
  expect(input.getAttribute('inputmode')).toBeNull();
  expect(input.textContent).toBe('合成草稿');
  const back = [...host.querySelectorAll('nav button')][0];
  const backDown = new MouseEvent('pointerdown', {bubbles:true,cancelable:true,button:0});
  await act(() => back.dispatchEvent(backDown));
  expect(backDown.defaultPrevented).toBe(false);
  await act(() => back.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true,button:0})));
  expect(crumb).toHaveBeenCalledExactlyOnceWith('command', 0);
});
