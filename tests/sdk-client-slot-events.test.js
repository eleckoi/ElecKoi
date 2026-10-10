// @vitest-environment jsdom
import * as React from 'react';
import * as ReactDom from 'react-dom';
import * as ReactDomClient from 'react-dom/client';
import * as Jsx from 'react/jsx-runtime';
import * as Cordis from '@deepseek-ai/cordis';
import * as Slots from '@deepseek-ai/dsh-client-ui-slots';
import * as Store from '@deepseek-ai/dsh-client-store';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const dependencies = {
  react: React, 'react-dom': ReactDom, 'react-dom/client': ReactDomClient,
  'react/jsx-runtime': Jsx, '@deepseek-ai/cordis': Cordis,
  '@deepseek-ai/dsh-client-ui-slots': Slots, '@deepseek-ai/dsh-client-store': Store,
  '@deepseek-ai/dsh-client-ui-primitives': {},
};

function load(file, react = React) {
  let registration;
  runInNewContext(readFileSync(file, 'utf8'), {
    window: { __ModuleLoader__: { load: value => { registration = value; } } },
    AbortController, document, getComputedStyle,
  });
  return registration.factory(name => {
    if (name === 'react') return react;
    if (!(name in dependencies)) throw new Error(`Unknown test dependency ${name}`);
    return dependencies[name];
  });
}

it('passes the public SlotRegistry event subscription to the SDK application controller', async () => {
  const renderer = load(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'));
  const ProductApp = () => null;
  let stateIndex = 0;
  const shell = load(resolve('packages/dsh-client-shell/src/client.js'), {
    ...React,
    useState: () => [stateIndex++ === 0 ? ProductApp : '', () => {}],
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useMemo: calculate => calculate(),
    useEffect: () => {},
    createElement: (component, props, ...children) => ({ component, props, children }),
  });
  const ctx = new Cordis.Context();
  try {
    await ctx.plugin({ name: 'synthetic-sdk-client-root', apply(owner) {
      new renderer.SlotRegistry(owner);
      owner.reflect.provide('locale', {
        subscribe: () => () => {}, getSnapshot: () => ({ revision: 0 }),
      });
      owner.reflect.provide('theme', {
        getTheme: () => ({ active: { colorScheme: 'light', tokens: {} }, fontSize: 15 }),
      });
      for (const name of shell.inject.filter(name => !['slots', 'locale', 'theme'].includes(name))) {
        owner.reflect.provide(name, {});
      }
    } });
    await ctx.plugin(shell);
    expect(ctx.slots.onMutate).toBeUndefined();
    const root = ctx.slots.entriesOfSlot('root')[0];
    const injected = root.inject();
    expect(root.inject().subscribeSlots).toBe(injected.subscribeSlots);
    const rendered = root.component({ ...injected, renderSlot: () => null });
    const app = rendered.children[0].children[0];
    expect(app.component).toBe(ProductApp);
    expect(app.props.subscribeSlots).toBe(injected.subscribeSlots);
    const listener = vi.fn();
    const stop = app.props.subscribeSlots(listener);
    const extension = await ctx.plugin({ name: 'synthetic-sdk-extension', inject: ['slots'], apply(owner) {
      owner.slots.register({ name: 'main', key: 'synthetic-sdk-page' }, () => null);
    } });
    expect(listener).toHaveBeenCalledWith('main');
    listener.mockClear();
    await extension.dispose();
    expect(listener).toHaveBeenCalledWith('main');
    stop();
    listener.mockClear();
    ctx.emit('slots/changed', 'main');
    expect(listener).not.toHaveBeenCalled();
  } finally { await ctx.fiber.dispose(); }
});
