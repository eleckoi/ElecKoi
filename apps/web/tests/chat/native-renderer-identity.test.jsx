// @vitest-environment jsdom
import React, { act, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { expect, it, vi } from 'vitest';
import { dshClientRequire } from '../../../../tests/helpers/dshClientPlugin.js';

it.each(['creator-studio', 'roleplay'])('preserves native memoization and current child routing in the %s projection', async feature => {
  let registration;
  runInNewContext(readFileSync(`packages/client/features/dsh-client-${feature}/src/client.js`, 'utf8'), {
    window: { __ModuleLoader__: { load: value => { registration = value; } } },
  });
  const slots = new SlotCore(), cleanups = [];
  slots.inject = (name, install) => {
    let dispose;
    const sync = () => { dispose?.(); dispose = slots.spec(name) ? install() : undefined; };
    const stop = slots.subscribeDeclaration(name, sync); sync();
    cleanups.push(() => { stop(); dispose?.(); });
  };
  const studio = feature === 'creator-studio';
  const source = studio ? 'conversation.input.model' : 'conversation.view';
  const target = studio ? 'eleckoi.creator-studio.input.model' : 'eleckoi.roleplay.session.view';
  const rootRelease = slots.register({ name: 'root', children: {
    'eleckoi.creator-studio.conversation': { kind: 'single', scope: 'root' },
    'eleckoi.roleplay': { kind: 'chain', scope: 'root' },
    'conversation.session': { kind: 'single', scope: 'session' },
    'conversation.session.header': { kind: 'single', scope: 'session' },
    'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
  } }, () => null);
  registration.factory(name => name === 'react' ? React : dshClientRequire(name)).apply({
    slots, remote: {}, sessions: {}, get() {}, provide() {}, effect() {},
    eleckoiConversations: {},
  });
  const keep = options => { const dispose = slots.register(options, () => null); cleanups.push(dispose); };
  keep({ name: 'conversation.session', children: { 'conversation.view': { kind: 'list', scope: 'session' } } });
  keep({ name: 'conversation.composer.bar', children: { 'conversation.input.model': { kind: 'single', scope: 'session' } } });
  const renders = vi.fn(), childOwner = { toolName: 'synthetic-unrelated-tool', value: 'original' };
  let nativeProps;
  const Native = memo(props => { renders(); nativeProps = props; return <span>native contribution</span>; });
  const releaseNative = slots.register({ name: source, ...(studio ? {} : { id: 'synthetic-view' }),
    children: { 'synthetic-child': { kind: 'single', scope: 'session' } } }, Native);
  await Promise.resolve();
  const Bridge = slots.entriesOfSlot(target)[0].component;
  const renderSlot = vi.fn(() => 'first'), renderSlotChain = vi.fn(() => 'chain'), useProjection = () => undefined;
  const stable = { renderSlot, renderSlotChain, useProjection, sessionId: 'synthetic' };
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  try {
    for (let i = 0; i < 8; i++) await act(() => root.render(<Bridge {...stable} />));
    expect(renders).toHaveBeenCalledTimes(1);
    nativeProps.renderSlot('synthetic-child', childOwner, { only: 'extension' });
    expect(renderSlot).toHaveBeenCalledWith(studio ? 'eleckoi.creator-studio.synthetic-child' : 'eleckoi.roleplay.view.synthetic-child', childOwner, { only: 'extension' });
    const replacement = vi.fn(() => 'replacement');
    await act(() => root.render(<Bridge {...stable} renderSlot={replacement} />));
    expect(renders).toHaveBeenCalledTimes(2);
    expect(nativeProps.renderSlot('synthetic-child', childOwner)).toBe('replacement');
    expect(replacement).toHaveBeenCalledOnce();
  } finally {
    await act(() => root.unmount()); node.remove(); vi.unstubAllGlobals();
    releaseNative(); for (const dispose of cleanups.reverse()) dispose(); rootRelease();
  }
});
