import * as zod from 'zod';
// @vitest-environment jsdom
import React, { act } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as Cordis from '@deepseek-ai/cordis';
import { focusWithoutRing } from '@deepseek-ai/dsh-client-ui-primitives';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileConversationPage } from '../../src/mobile/MobileConversationPage.jsx';
import { MessageBubble } from '../helpers/officialMarkdown.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
const client = readFileSync(resolve('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'), 'utf8');
// Expose the installed editor and composer inside the existing browser module factory.
if (client.split('return module.exports').length !== 2) throw new Error('Locked conversation module factory changed');
let nativeMobile = false;
const Children = ({ children }) => children;
const Empty = () => null;
const primitives = new Proxy({ focusWithoutRing, isMobileDevice: () => nativeMobile, Tooltip: Children, HoverCardGroup: Children }, {
  get: (target, key) => target[key] ?? Empty,
});
const dependencies = { zod, react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
  '@deepseek-ai/cordis': Cordis, '@deepseek-ai/dsh-client-ui-primitives': primitives,
  '@deepseek-ai/dsh-client-store': {}, '@deepseek-ai/dsh-client-ui-slots': {} };
let registration;
new Function('captureModule', client.replace('window.__ModuleLoader__.load(', 'captureModule(')
  .replace('return module.exports', `return { DraftEditorRuntime, InputBar, enter: cn$1, paragraph: He$2,
    registerPlainText: O$1, readRoot: nl, readText: () => nl().getTextContent(), readSelection: () => Kr() };`))(entry => { registration = entry; });
const { DraftEditorRuntime, InputBar, enter, paragraph, registerPlainText, readRoot, readText, readSelection } = registration.factory(name => {
  if (!(name in dependencies)) throw new Error(`Unexpected composer dependency: ${name}`);
  return dependencies[name];
});
const disposers = [];
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); nativeMobile = false; vi.unstubAllGlobals(); });

async function composer(submitOnEnter, running = false, mobile = false, beforeMount) {
  nativeMobile = mobile;
  if (mobile) {
    document.documentElement.dataset.eleckoiMobile = 'true';
    disposers.push(() => { delete document.documentElement.dataset.eleckoiMobile; });
  }
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(document, 'fonts', { configurable: true, value: Object.assign(new EventTarget(), { ready: Promise.resolve() }) });
  disposers.push(() => { delete document.fonts; });
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [];
  disposers.push(() => { delete Range.prototype.getBoundingClientRect; delete Range.prototype.getClientRects; });
  const runtime = new DraftEditorRuntime({ resolveLexicon: () => undefined });
  const editor = runtime.editor;
  const off = registerPlainText(editor);
  beforeMount?.(runtime);
  const initialDraft = beforeMount ? '' : '第一行';
  const input = { draft: initialDraft, attachmentIds: [], queue: [], phase: 'plain' };
  const keyboard = { editor, arbitrate: vi.fn(() => 'pass'), space: () => false, dismissPopup: vi.fn(),
    bindFilePicker: () => () => {}, submit: vi.fn(), steerQueue: vi.fn(), caretSpan: () => ({start: 0, end: 0}) };
  const toggleCommandMenu = vi.fn();
  const hook = snapshot => select => select(snapshot);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  disposers.push(async () => { await act(async () => root.unmount()); off(); editor.setRootElement(null); container.remove(); });
  let sessionId = 'synthetic-session';
  const bar = () => <InputBar useSession={hook({ running, openState: 'open', pendingSubmissions: [] })} useInput={hook(input)}
    useNotices={hook(null)} useBusyEnter={hook('queue')} useStopShortcut={hook([])}
    useMenuLauncher={hook(null)} useFileUploads={hook({})} useLexicon={hook([])}
    useProjection={() => undefined} useAccess={() => true} inputActions={{}} keyboard={keyboard} t={key => key}
    registerFileIntake={() => () => {}}
    renderSlot={() => null} sessionId={sessionId} variant="composer" dockAccessory={[]}
    submitOnEnter={submitOnEnter} toggleCommandMenu={toggleCommandMenu} />;
  const selectOpening = vi.fn();
  const render = () => root.render(mobile ? <MobileConversationPage>
    <MessageBubble message={{ id: 'opening', role: 'assistant', content: '合成开场一', canChangeOpening: true,
      selectedOpeningId: 'entry-a', openingOptions: [{ id: 'entry-a', content: '合成开场一' }, { id: 'entry-b', content: '合成开场二' }] }}
      onSelectOpening={selectOpening} />{bar()}
  </MobileConversationPage> : bar());
  await act(async () => render());
  await act(async () => runtime.setDraft(initialDraft));
  return { keyboard, container, editor, toggleCommandMenu, text: () => editor.getEditorState().read(readText),
    async remount() { await act(async () => root.render(null)); await act(async () => render()); },
    async update(next) {
      if ('sessionId' in next) sessionId = next.sessionId;
      if ('phase' in next) input.phase = next.phase;
      if ('draft' in next) input.draft = next.draft;
      await act(async () => { render(); });
      if ('draft' in next) await act(async () => runtime.setDraft(next.draft));
    },
  };
}

describe('Android composer Enter behavior', () => {
  it.each([true, false])('mounts an empty selected editor without losing the input, mobile=%s', async mobile => {
    const selectionWrites = vi.spyOn(window.getSelection(), 'setBaseAndExtent');
    try {
      const { container, editor, remount, update, text, keyboard } = await composer(false, false, mobile, runtime => {
        runtime.editor.update(() => readRoot().selectEnd(), { discrete: true });
        const state = runtime.editor.getEditorState();
        expect(state.read(readSelection)).not.toBeNull();
        expect(state.clone(null).isEmpty()).toBe(true);
      });
      expect(container.querySelector('[data-composer-input]')).not.toBeNull();
      await remount();
      const input = container.querySelector('[data-composer-input]');
      expect(input).not.toBeNull();
      expect(text()).toBe('');
      expect(editor.getRootElement()).toBe(input);
      if (mobile) {
        expect(selectionWrites).not.toHaveBeenCalled();
        expect(document.activeElement).not.toBe(input);
      }
      await update({ draft: '合成输入' });
      expect(text()).toBe('合成输入');
      await act(async () => container.querySelector('[data-composer-card] button[aria-busy]').click());
      expect(keyboard.submit).toHaveBeenCalledExactlyOnceWith('queue', 'click');
    } finally { selectionWrites.mockRestore(); }
  });
  it.each([true, false])('restores a retained caret on remount without mobile DOM selection writes, mobile=%s', async mobile => {
    const { container, editor, remount, text, keyboard } = await composer(false, false, mobile);
    await act(async () => container.querySelector('[data-composer-input]').focus());
    const previous = editor.getEditorState().read(readSelection);
    expect(previous).not.toBeNull();
    const selectionWrites = vi.spyOn(window.getSelection(), 'setBaseAndExtent');
    try {
      await remount();
      const input = container.querySelector('[data-composer-input]');
      if (mobile) {
        expect(selectionWrites).not.toHaveBeenCalled();
        expect(document.activeElement).not.toBe(input);
      } else {
        expect(selectionWrites).toHaveBeenCalled();
        expect(document.activeElement).toBe(input);
      }
      if (mobile) expect(editor.getEditorState().read(readSelection).is(previous)).toBe(true);
      expect(text()).toBe('第一行');
      await act(async () => input.focus());
      expect(document.activeElement).toBe(input);
      await act(async () => container.querySelector('[data-composer-card] button[aria-busy]').click());
      expect(keyboard.submit).toHaveBeenCalledExactlyOnceWith('queue', 'click');
    } finally { selectionWrites.mockRestore(); }
  });
  it.each([true, false])('opens the command menu with native pointer events and mobile=%s focus behavior', async mobile => {
    const { container, toggleCommandMenu } = await composer(false, false, mobile);
    const input = container.querySelector('[data-composer-input]');
    const add = container.querySelector('button[aria-label="input.commands"]');
    await act(async () => input.blur());
    const focus = vi.spyOn(input, 'focus');
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      const event = new MouseEvent(type, {bubbles:true,cancelable:true,button:0});
      await act(async () => add.dispatchEvent(event));
      if (type === 'pointerdown') expect(event.defaultPrevented).toBe(false);
    }
    expect(toggleCommandMenu).toHaveBeenCalledExactlyOnceWith({start:0,end:0});
    if (mobile) { expect(focus).not.toHaveBeenCalled(); expect(document.activeElement).not.toBe(input); }
    else { expect(focus).toHaveBeenCalled(); expect(document.activeElement).toBe(input); }
    focus.mockClear();
    await act(async () => input.focus());
    focus.mockClear();
    await act(async () => {
      add.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true,button:0}));
      add.click();
    });
    expect(document.activeElement).toBe(input);
    if (mobile) expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });
  it('keeps the focused native composer stable through a send tap beside an opening pager', async () => {
    const { keyboard, container, text } = await composer(false, false, true);
    const input = container.querySelector('[data-composer-input]');
    const send = container.querySelector('[data-composer-card] button[aria-busy]');
    expect(send).not.toBeNull();
    await act(async () => {
      input.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      input.focus();
    });
    const mode = input.getAttribute('inputmode');
    expect(mode).not.toBe('none');
    // Android reacts to inputmode changes before the compatibility mouse/click sequence.
    const changes = [];
    const modes = new MutationObserver(records => changes.push(...records));
    modes.observe(input, { attributes: true, attributeFilter: ['inputmode'] });
    try {
      for (const type of ['pointerdown', 'mousedown']) {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
        await act(async () => send.querySelector('svg').dispatchEvent(event));
        expect(input.getAttribute('inputmode')).toBe(mode);
        expect(document.activeElement).toBe(input);
        expect(event.defaultPrevented).toBe(type === 'mousedown');
        expect(keyboard.submit).not.toHaveBeenCalled();
      }
      await act(async () => send.click());
      expect(input.getAttribute('inputmode')).toBe(mode);
      expect([...changes, ...modes.takeRecords()]).toEqual([]);
      expect(keyboard.submit).toHaveBeenCalledExactlyOnceWith('queue', 'click');
      expect(text()).toBe('第一行');
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await act(async () => container.querySelector('.opening-pager-index').click());
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    } finally { modes.disconnect(); }
  });
  it.each([true, false])('keeps official session and busy-phase focus with mobile=%s', async mobile => {
    const { container, update, text } = await composer(false, false, mobile);
    const input = container.querySelector('[data-composer-input]');
    const card = container.querySelector('[data-composer-card]');
    expect(document.activeElement).toBe(mobile ? document.body : input);
    input.blur();
    await update({ sessionId: 'synthetic-session-b' });
    expect(document.activeElement).toBe(mobile ? document.body : input);
    input.blur();
    await update({ phase: 'sending' });
    await update({ phase: 'plain' });
    expect(document.activeElement).toBe(mobile ? card : input);
    expect(input.getAttribute('inputmode')).not.toBe('none');
    expect(text()).toBe('第一行');
  });
  it('does not steal mobile focus during draft restoration or foreground events', async () => {
    const { container, update, text } = await composer(false, false, true);
    const input = container.querySelector('[data-composer-input]');
    const control = container.querySelector('.opening-pager-index');
    await update({ draft: '' });
    await act(async () => control.focus());
    await update({ draft: '合成恢复草稿' });
    expect(document.activeElement).toBe(control);
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(document.activeElement).toBe(control);
    expect(input.getAttribute('inputmode')).not.toBe('none');
    expect(text()).toBe('合成恢复草稿');
    await update({ phase: 'sending' });
    await update({ phase: 'plain' });
    expect(document.activeElement).toBe(control);
  });
  it.each([{}, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, null])('inserts a newline without sending for Enter %j', async modifiers => {
    const { editor, keyboard, text, container } = await composer(false);
    const event = modifiers === null ? null : new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, ...modifiers });
    await act(async () => editor.dispatchCommand(enter, event));
    expect(text()).toBe('第一行\n');
    expect(keyboard.submit).not.toHaveBeenCalled();
    expect(container.querySelector('[data-composer-input]').getAttribute('enterkeyhint')).toBe('enter');
  });
  it('keeps Android IME paragraph input and Enter during a reply as line breaks, then sends on click', async () => {
    const { editor, keyboard, text, container } = await composer(false, true);
    await act(async () => editor.dispatchCommand(paragraph));
    await act(async () => editor.dispatchCommand(enter, new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })));
    expect(text()).toBe('第一行\n\n');
    expect(keyboard.submit).not.toHaveBeenCalled();
    await act(async () => container.querySelector('[aria-label="input.send.queue"]').click());
    expect(keyboard.submit).toHaveBeenCalledWith('queue', 'click');
  });
  it('leaves Chinese composition confirmation to the IME', async () => {
    const { editor, keyboard, text } = await composer(false);
    const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true });
    await act(async () => editor.dispatchCommand(enter, event));
    expect(text()).toBe('第一行');
    expect(event.defaultPrevented).toBe(false);
    expect(keyboard.submit).not.toHaveBeenCalled();
  });
  it('preserves desktop Enter submission and Shift+Enter line breaks', async () => {
    const { editor, keyboard, text, container } = await composer(undefined);
    await act(async () => editor.dispatchCommand(enter, new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })));
    expect(keyboard.submit).toHaveBeenCalledWith('queue', 'enter');
    expect(text()).toBe('第一行');
    await act(async () => editor.dispatchCommand(enter, new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true })));
    expect(text()).toBe('第一行\n');
    expect(container.querySelector('[data-composer-input]').hasAttribute('enterkeyhint')).toBe(false);
  });
});
