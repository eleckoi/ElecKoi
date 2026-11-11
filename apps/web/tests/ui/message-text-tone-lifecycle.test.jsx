// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as libraries from '@eleckoi/dsh-client-html-resources/browser-libraries';
import { MessageBubble } from '../helpers/officialMarkdown.jsx';
import { decorateRichDisplayReplacement } from '../../../../packages/shared/src/foundation/richMessage';

let root, container, registry;
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  registry = new Map();
  vi.stubGlobal('CSS', { ...window.CSS, highlights: registry });
  vi.stubGlobal('Highlight', class extends Set { constructor(...ranges) { super(ranges); } });
  const ready = { status: 'ready', error: '' };
  window.__ElecKoiHtmlResources = { assetsBaseUrl: '/eleckoi/html/', sdk: libraries,
    getSnapshot: () => ready, subscribe: () => () => {} };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount()); container.remove();
  expect(registry.has('eleckoi-roleplay-quote')).toBe(false);
  expect(registry.has('eleckoi-roleplay-underline')).toBe(false);
  delete window.__ElecKoiHtmlResources; vi.unstubAllGlobals();
});

it('keeps narrative quotes colored when a fenced HTML status document finishes loading', async () => {
  const content = '“合成对白”\n\n```html\n<!doctype html><html><body><section>合成状态</section></body></html>\n```';
  await act(() => root.render(<MessageBubble message={{ id: 'synthetic-fenced-message', role: 'assistant', content }} />));
  expect(texts('eleckoi-roleplay-quote')).toEqual(['“合成对白”']);
  const frame = container.querySelector('iframe');
  await signal(frame, 'eleckoi:frontend-ready');
  await signal(frame, 'eleckoi:rich-height', { height: 90 });
  expect(texts('eleckoi-roleplay-quote')).toEqual(['“合成对白”']);
});

it('preserves highlights in another message when one message replaces its text and unmounts', async () => {
  const first = { id: 'synthetic-first', role: 'assistant', content: '“合成甲”' };
  const second = { id: 'synthetic-second', role: 'assistant', content: '“合成乙”' };
  const render = message => act(() => root.render(<><MessageBubble key="first" message={first} />{message && <MessageBubble key="second" message={message} />}</>));
  await render(second);
  expect(texts('eleckoi-roleplay-quote')).toEqual(['“合成甲”', '“合成乙”']);
  const paragraph = container.querySelectorAll('.markdown-message p')[1];
  await act(() => { paragraph.textContent = '“合成新文字”'; });
  expect(texts('eleckoi-roleplay-quote')).toEqual(['“合成甲”', '“合成新文字”']);
  await render(null);
  expect(texts('eleckoi-roleplay-quote')).toEqual(['“合成甲”']);
});

it('reuses completed paragraph ranges while only the streaming tail changes and clears removed text', async () => {
  const render = content => act(() => root.render(<MessageBubble message={{ id: 'synthetic-stream', role: 'assistant', pending: true, content }} />));
  await render('“Synthetic history”\n\n“Tail');
  const previous = [...registry.get('eleckoi-roleplay-quote')][0];
  const createRange = vi.spyOn(document, 'createRange');
  await render('“Synthetic history”\n\n“Tail grows”');
  expect(texts('eleckoi-roleplay-quote')).toEqual(['“Synthetic history”', '“Tail grows”']);
  expect([...registry.get('eleckoi-roleplay-quote')][0]).toBe(previous);
  expect(createRange.mock.calls.length).toBeLessThanOrEqual(1);
  createRange.mockRestore();
  await render('“Replacement”');
  expect(texts('eleckoi-roleplay-quote')).toEqual(['“Replacement”']);
});

it('keeps existing underline ranges through tail growth and removes them when the markup is edited away', async () => {
  const render = content => act(() => root.render(<MessageBubble message={{ id: 'synthetic-underline-stream', role: 'assistant', pending: true, content }} />));
  await render('<u>Synthetic emphasis</u>\n\nTail');
  const previous = [...registry.get('eleckoi-roleplay-underline')][0];
  await render('<u>Synthetic emphasis</u>\n\nTail grows');
  expect(texts('eleckoi-roleplay-underline')).toEqual(['Synthetic emphasis']);
  expect([...registry.get('eleckoi-roleplay-underline')][0]).toBe(previous);
  await render('Synthetic emphasis\n\nTail grows');
  expect(registry.has('eleckoi-roleplay-underline')).toBe(false);
});
const texts = name => [...(registry.get(name) || [])].map(range => range.toString());
async function signal(frame, type, payload = {}) {
  const channel = JSON.parse(frame.srcdoc.match(/const channel=("[^"\n]+");/)[1]);
  await act(() => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { type, channel, ...payload } })));
}

it('keeps quote and underline colors attached to the visible narrative after a status panel settles', async () => {
  const content = '“合成对白” <u>合成强调</u>\n[STATUS]';
  const displayContent = '“合成对白” <u>合成强调</u>\n' + decorateRichDisplayReplacement('<section>合成状态面板</section>');
  await act(() => root.render(<MessageBubble message={{ id: 'synthetic-reply', conversationId: 'synthetic-chat', role: 'assistant', content, displayContent }} />));
  expect(texts('eleckoi-roleplay-quote')).toEqual(['“合成对白”']);
  expect(texts('eleckoi-roleplay-underline')).toEqual(['合成强调']);
  const frame = container.querySelector('iframe');
  await signal(frame, 'eleckoi:frontend-ready');
  await signal(frame, 'eleckoi:rich-height', { height: 80 });
  expect(container.querySelector('.rich-message-staging').style.visibility).not.toBe('hidden');
  expect(texts('eleckoi-roleplay-quote')).toEqual(['“合成对白”']);
  expect(texts('eleckoi-roleplay-underline')).toEqual(['合成强调']);
  for (const range of registry.get('eleckoi-roleplay-quote')) {
    expect(container.contains(range.startContainer)).toBe(true);
    expect(range.startContainer.parentElement.closest('[aria-hidden="true"]')).toBeNull();
  }
});
