// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { OfficialConversationWidthControls, installOfficialDraftWheel, officialComposerSeat } from '../../../../tests/helpers/officialTrajectory.js';
import { DisplayPreferencesProvider } from '../../src/modules/settings/index.js';
import { useConversationWidthPreference } from '../../src/modules/chat/hooks/useConversationWidthPreference.js';

it('keeps native draft wheel and text-selection association with the shared floating seat', () => {
  document.body.innerHTML = '<div data-conversation-frame><div data-conversation-scroll><span id="message">text</span></div><div data-composer-seat><div id="draft"></div></div></div>';
  const scroller = document.querySelector('[data-conversation-scroll]'), draft = document.querySelector('#draft');
  Object.defineProperties(draft, { clientHeight: { value: 100 }, scrollHeight: { value: 300 } });
  const stop = installOfficialDraftWheel({ current: draft });
  try {
    draft.scrollTop = 200;
    const edge = new WheelEvent('wheel', { deltaY: 40, cancelable: true }); draft.dispatchEvent(edge);
    expect(edge.defaultPrevented).toBe(true); expect(scroller.scrollTop).toBe(40);
    draft.scrollTop = 100;
    const inside = new WheelEvent('wheel', { deltaY: 40, cancelable: true }); draft.dispatchEvent(inside);
    expect(inside.defaultPrevented).toBe(false); expect(scroller.scrollTop).toBe(40);
    expect(officialComposerSeat(document.querySelector('#message'))).toBe(document.querySelector('[data-composer-seat]'));
    stop(); draft.scrollTop = 200; draft.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, cancelable: true }));
    expect(scroller.scrollTop).toBe(40);
  } finally { stop(); document.body.innerHTML = ''; }
});

it('uses native width geometry and gestures while preserving the existing saved product preference', async () => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  let snapshot = { ui: { conversation_content_width: 900 } };
  const listeners = new Set(), updateUi = vi.fn(async () => {});
  const preferences = { subscribe: f => { listeners.add(f); return () => listeners.delete(f); }, getSnapshot: () => snapshot, updateUi };
  const node = document.createElement('div'), container = document.createElement('div');
  node.append(container); document.body.append(node); Object.defineProperty(container, 'offsetWidth', { value: 1400 });
  const root = createRoot(container);
  localStorage.setItem('dsh.conversation.contentWidth', '700');
  function Controls() { const widthPreference = useConversationWidthPreference(); return <OfficialConversationWidthControls container={container} phase="active" widthPreference={widthPreference} />; }
  const emit = (element, type, x) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 }); element.dispatchEvent(event);
  };
  try {
    await act(() => root.render(<DisplayPreferencesProvider model={preferences}><Controls /></DisplayPreferencesProvider>));
    expect(node.style.getPropertyValue('--dsh-chat-user-width')).toBe('900px');
    const handle = container.querySelector('[data-width-handle=right]');
    handle.setPointerCapture = () => {}; handle.releasePointerCapture = () => {}; handle.hasPointerCapture = () => true;
    await act(() => { emit(handle, 'pointerdown', 100); emit(handle, 'pointerup', 140); });
    expect(updateUi).toHaveBeenCalledWith({ conversation_content_width: 980 });
    expect(localStorage.getItem('dsh.conversation.contentWidth')).toBe('700');
    snapshot = { ui: { conversation_content_width: 1100 } };
    await act(() => listeners.forEach(f => f()));
    expect(node.style.getPropertyValue('--dsh-chat-user-width')).toBe('1100px');
    await act(() => { emit(handle, 'pointerdown', 100); emit(handle, 'pointercancel', 160); });
    expect(updateUi).toHaveBeenCalledTimes(1);
    expect(node.style.getPropertyValue('--dsh-chat-user-width')).toBe('1100px');
  } finally { await act(() => root.unmount()); node.remove(); localStorage.clear(); vi.unstubAllGlobals(); }
});
