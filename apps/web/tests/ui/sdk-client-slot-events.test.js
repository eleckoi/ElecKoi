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
  '@deepseek-ai/dsh-client-ui-primitives': {}, '@eleckoi/dsh-product-api': {},
};

function load(file, react = React) {
  let registration;
  runInNewContext(readFileSync(file, 'utf8'), {
    window: { __ModuleLoader__: { load: value => { registration = value; } },
      addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window) },
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
  const shell = load(resolve('packages/client/features/dsh-client-shell/src/client.js'), {
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
        getTheme: () => ({ active: { colorScheme: 'light', tokens: {} }, fontSizes: { text: 15, code: 14, terminal: 13 }, fontFamilies: { text: '', code: '', terminal: '' } }),
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

it('applies and releases all official theme font roles through startup and live settings changes', async () => {
  const renderer = load(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'));
  const shell = load(resolve('packages/client/features/dsh-client-shell/src/client.js'));
  let snapshot = {
    preference: 'light', active: { colorScheme: 'light', tokens: {} },
    fontSizes: { text: 15, code: 14, terminal: 13 },
    fontFamilies: { text: '', code: '', terminal: '' },
  };
  const ctx = new Cordis.Context();
  try {
    await ctx.plugin({ name: 'synthetic-theme-root', apply(owner) {
      new renderer.SlotRegistry(owner);
      owner.reflect.provide('locale', { register: () => () => {}, bind: () => key => key });
      owner.reflect.provide('theme', { getTheme: () => snapshot });
      for (const name of shell.inject.filter(name => !['slots', 'locale', 'theme'].includes(name))) owner.reflect.provide(name, {});
    } });
    const product = await ctx.plugin(shell);
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('15px');
    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    snapshot = { preference: 'dark', active: { colorScheme: 'dark', tokens: { '--synthetic-theme-token': '#123456' } },
      fontSizes: { text: 21, code: 18, terminal: 17 },
      fontFamilies: { text: '"Synthetic Text", sans-serif', code: '"Synthetic Code", monospace', terminal: 'monospace' } };
    ctx.emit('theme/change', snapshot);
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('21px');
    expect(document.body.style.getPropertyValue('--dsh-code-font-size')).toBe('18px');
    expect(document.body.style.getPropertyValue('--dsh-terminal-font-size')).toBe('17px');
    expect(document.body.style.getPropertyValue('--dsh-font-family-text')).toBe(snapshot.fontFamilies.text);
    expect(document.body.style.getPropertyValue('--dsh-font-family-code')).toBe(snapshot.fontFamilies.code);
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true);
    await product.dispose();
    for (const name of ['--dsh-content-font-size', '--dsh-code-font-size', '--dsh-terminal-font-size', '--dsh-font-family-text', '--dsh-font-family-code', '--dsh-font-family-terminal', '--synthetic-theme-token']) {
      expect(document.body.style.getPropertyValue(name), name).toBe('');
    }
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false);
    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(0);
  } finally { await ctx.fiber.dispose(); }
});
