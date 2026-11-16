import * as zod from 'zod';
// @vitest-environment jsdom
import React, { act } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as Cordis from '@deepseek-ai/cordis';
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
const primitives = new Proxy({}, { get: (_target, key) => ['Tooltip', 'HoverCardGroup'].includes(key) ? ({ children }) => children : () => null });
const dependencies = { zod, react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
  '@deepseek-ai/cordis': Cordis, '@deepseek-ai/dsh-client-ui-primitives': primitives,
  '@deepseek-ai/dsh-client-store': {}, '@deepseek-ai/dsh-client-ui-slots': {} };
let registration;
new Function('captureModule', client.replace('window.__ModuleLoader__.load(', 'captureModule(')
  .replace('return module.exports', `return { DraftEditorRuntime, InputBar, enter: cn$1, paragraph: He$2,
    registerPlainText: O$1, readText: () => nl().getTextContent() };`))(entry => { registration = entry; });
const { DraftEditorRuntime, InputBar, enter, paragraph, registerPlainText, readText } = registration.factory(name => {
  if (!(name in dependencies)) throw new Error(`Unexpected composer dependency: ${name}`);
  return dependencies[name];
});
const disposers = [];
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose(); vi.unstubAllGlobals(); });

async function composer(submitOnEnter, running = false, mobile = false) {
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
  const input = { draft: '第一行', attachmentIds: [], queue: [], phase: 'plain' };
  const keyboard = { editor, arbitrate: vi.fn(() => 'pass'), space: () => false, dismissPopup: vi.fn(),
    bindFilePicker: () => () => {}, submit: vi.fn(), steerQueue: vi.fn() };
  const hook = snapshot => select => select(snapshot);
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  disposers.push(async () => { await act(async () => root.unmount()); off(); editor.setRootElement(null); container.remove(); });
  const bar = <InputBar useSession={hook({ running, openState: 'open', pendingSubmissions: [] })} useInput={hook(input)}
    useNotices={hook(null)} useBusyEnter={hook('queue')} useStopShortcut={hook([])}
    useMenuLauncher={hook(null)} useFileUploads={hook({})} useLexicon={hook([])}
    useProjection={() => undefined} useAccess={() => true} inputActions={{}} keyboard={keyboard} t={key => key}
    registerFileIntake={() => () => {}}
    renderSlot={() => null} sessionId="synthetic-session" variant="composer" dockAccessory={[]}
    submitOnEnter={submitOnEnter} />;
  const selectOpening = vi.fn();
  await act(async () => root.render(mobile ? <MobileConversationPage>
    <MessageBubble message={{ id: 'opening', role: 'assistant', content: '合成开场一', canChangeOpening: true,
      selectedOpeningId: 'entry-a', openingOptions: [{ id: 'entry-a', content: '合成开场一' }, { id: 'entry-b', content: '合成开场二' }] }}
      onSelectOpening={selectOpening} />{bar}
  </MobileConversationPage> : bar));
  await act(async () => runtime.setDraft('第一行'));
  return { keyboard, container, editor, text: () => editor.getEditorState().read(readText) };
}

describe('Android composer Enter behavior', () => {
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
        expect(event.defaultPrevented).toBe(true);
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
