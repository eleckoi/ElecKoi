// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as libraries from '@eleckoi/dsh-client-html-resources/browser-libraries';
import { MessageBubble } from '../helpers/officialMarkdown.jsx';
import { decorateRichDisplayReplacement } from '../../../../packages/shared/src/foundation/richMessage';

let root, container;
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const ready = { status: 'ready', error: '' };
  window.__ElecKoiHtmlResources = { assetsBaseUrl: '/eleckoi/html/', sdk: libraries,
    getSnapshot: () => ready, subscribe: () => () => {} };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount()); container.remove();
  delete window.__ElecKoiHtmlResources; vi.unstubAllGlobals();
});

const message = { id: 'synthetic-reply', conversationId: 'synthetic-chat', role: 'assistant',
  content: '<FINAL>Narrative</FINAL>\n[PANEL-A]\n[PANEL-B]', status: 'complete', pending: false };
const displayContent = 'Narrative\n' + decorateRichDisplayReplacement('<section>First panel</section>')
  + decorateRichDisplayReplacement('<section>Second panel</section>');
const render = value => act(() => root.render(<MessageBubble message={value} />));
async function signal(frame, type, payload = {}) {
  const channel = JSON.parse(frame.srcdoc.match(/const channel=("[^"\n]+");/)[1]);
  await act(() => window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow, data: { type, channel, ...payload },
  })));
}

describe('settled rich message presentation', () => {
  it('retains the committed document during a configuration replacement, then swaps without returning to raw text', async () => {
    await render({ ...message, displayContent });
    const previous = [...container.querySelectorAll('iframe')];
    for (const frame of previous) { await signal(frame, 'eleckoi:frontend-ready'); await signal(frame, 'eleckoi:rich-height', { height: 80 }); }
    const visible = container.querySelector('.rich-message-staging');
    const nextContent = 'Narrative\n' + decorateRichDisplayReplacement('<section>Changed panel</section>');
    await render({ ...message, displayContent: nextContent });
    expect(visible.isConnected).toBe(true);
    expect(visible.style.visibility).not.toBe('hidden');
    expect(previous.every(frame => frame.isConnected)).toBe(true);
    expect(container.textContent).not.toContain('[PANEL-A]');
    const next = [...container.querySelectorAll('iframe')].find(frame => !previous.includes(frame));
    expect(next.closest('.rich-message-staging').style.visibility).toBe('hidden');
    await signal(next, 'eleckoi:frontend-ready');
    expect(visible.isConnected).toBe(true);
    await signal(next, 'eleckoi:rich-height', { height: 120 });
    expect(visible.isConnected).toBe(false);
    expect([...container.querySelectorAll('iframe')]).toEqual([next]);
    expect(next.closest('.rich-message-staging').style.visibility).not.toBe('hidden');
  });
  it('shows a frontend failure instead of waiting forever behind the previous text', async () => {
    await render({ ...message, displayContent });
    const frames = [...container.querySelectorAll('iframe')];
    await signal(frames[0], 'eleckoi:frontend-error', { message: 'Synthetic load failure' });
    await signal(frames[1], 'eleckoi:frontend-ready');
    await signal(frames[1], 'eleckoi:rich-height', { height: 90 });
    expect(container.querySelector('.rich-message-staging').style.visibility).not.toBe('hidden');
    expect(container.querySelector('[role="alert"]').textContent).toContain('Synthetic load failure');
    expect(container.textContent).not.toContain('[PANEL-A]');
  });

  it('keeps the final text visible until every frontend has loaded and measured, then switches once', async () => {
    await render({ ...message, pending: true, status: 'streaming', displayContent: 'Narrative\n[PANEL-A]\n[PANEL-B]' });
    expect(container.querySelector('iframe')).toBeNull();
    await render({ ...message, displayContent });
    expect(container.textContent).toContain('[PANEL-A]');
    const frames = [...container.querySelectorAll('iframe')];
    expect(frames).toHaveLength(2);
    expect(container.querySelector('.rich-message-staging').style.visibility).toBe('hidden');
    await signal(frames[0], 'eleckoi:frontend-ready');
    await signal(frames[0], 'eleckoi:rich-height', { height: 80 });
    expect(container.textContent).toContain('[PANEL-A]');
    await signal(frames[1], 'eleckoi:rich-height', { height: 90 });
    expect(container.textContent).toContain('[PANEL-A]');
    await signal(frames[1], 'eleckoi:frontend-ready');
    expect(container.textContent).not.toContain('[PANEL-A]');
    expect(container.querySelector('.rich-message-staging').style.visibility).not.toBe('hidden');
    await render({ ...message, displayContent, createdAt: '2026-10-10T00:01:00.000Z' });
    expect([...container.querySelectorAll('iframe')]).toEqual(frames);
    expect(frames.map(frame => frame.style.height)).toEqual(['80px', '90px']);
  });

  it.each(['roleplay', 'agent'])('shows a settled speaker’s storyboard image in the %s layout', async layoutMode => {
    const text = '[分镜:开错路]';
    const assetId = '00000000-0000-4000-8000-000000000001';
    const characterId = 'synthetic-character';
    const segment = { id: 'roleplay-tool-call:0', speakerName: '合成发言甲', kind: 'speech', text };
    const result = decorateRichDisplayReplacement(`<figure style="margin:8px 0 10px"><img src="asset://${assetId}" alt="合成分镜"></figure>`);
    const reply = { ...message, characterId, content: '合成发言甲：' + text, roleplayReply: true, roleplayBlocks: [segment] };
    const draw = value => act(() => root.render(<MessageBubble message={value} layoutMode={layoutMode} />));
    await draw({ ...reply, pending: true, status: 'streaming' });
    expect(container.textContent).toContain(text);
    expect(container.querySelector('iframe')).toBeNull();
    await draw({ ...reply, roleplayGroups: [{ id: segment.id, sourceText: text, displayText: result }] });
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    const frameDocument = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    expect(frameDocument.querySelector('figure img')?.getAttribute('src')).toContain(`/eleckoi/character-assets/${characterId}/${assetId}`);
    await signal(frame, 'eleckoi:frontend-ready');
    await signal(frame, 'eleckoi:rich-height', { height: 80 });
    expect(container.textContent).not.toContain(text);
    expect(frame.closest('.rich-message-staging').style.visibility).not.toBe('hidden');
  });
});
