import { officialLocale } from '../../../../tests/helpers/officialLocale.js';
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
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
let officialSidebar;
// 边界⑥ 的信封拆解（与 tests/helpers/dshClientPlugin.ts 同一份实现）。
import { failureOrInvalidResponse, unwrapOrFail } from '../../../../packages/host/product-api/src/client/unwrapFailure.ts';
import { internalFailure, INTERNAL_FAILURE_CODE, invalidResponseFailure } from '../../../../packages/host/product-api/src/client/invalidResponse.ts';
function load(file, platform = 'android') {
  let registration;
  runInNewContext(readFileSync(file, 'utf8'), {
    window: { __ModuleLoader__: { load: value => { registration = value; } }, addEventListener() {}, removeEventListener() {} },
    __ELECKOI_DSH_SIDEBAR_READY__: true,
    __ELECKOI_CLIENT_PLATFORM__: { kind: platform }, AbortController, document, getComputedStyle,
  });
  const dependencies = { react: React, 'react-dom': ReactDom, 'react-dom/client': ReactDomClient,
    'react/jsx-runtime': Jsx, '@deepseek-ai/cordis': Cordis, '@deepseek-ai/dsh-client-ui-slots': Slots,
    '@deepseek-ai/dsh-client-store': Store, '@deepseek-ai/dsh-client-ui-primitives': {},
    '@deepseek-ai/dsh-client-ui-sidebar': officialSidebar,
    '@eleckoi/dsh-product-api': { unwrapOrFail, failureOrInvalidResponse, invalidResponseFailure, internalFailure, INTERNAL_FAILURE_CODE } };
  return registration.factory(name => {
    if (!(name in dependencies)) throw new Error(`Unknown test dependency ${name}`);
    return dependencies[name];
  });
}
const renderer = load(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'));
officialSidebar = load(require.resolve('@deepseek-ai/dsh-client-ui-sidebar/client'));
const shell = load(resolve('packages/client/features/dsh-client-shell/src/client.js'));
const mobilePath = resolve('packages/client/mobile/dsh-client-mobile/src/client.js');

describe('Android composition with the shared PC sidebar and locked DSH slots', () => {
  it('mounts Studio and the official Conversation factory without claiming the same child slot', async () => {
    const ctx = new Cordis.Context();
    const studio = load(resolve('packages/client/features/dsh-client-creator-studio/src/client.js'));
    try {
      await ctx.plugin({ name: 'synthetic-studio-root', apply(owner) {
        new renderer.SlotRegistry(owner);
        owner.reflect.provide('sessions', {});
        owner.reflect.provide('workspaces', {});
        owner.reflect.provide('uiSession', {});
        owner.reflect.provide('locale', officialLocale());
        owner.reflect.provide('remote', { eleckoiCreatorStudio: {
          list: async () => ({ ok: true, value: { items: [] } }),
          changes: async function* () {},
        } });
        owner.slots.register({ name: 'root', children: {
          'eleckoi.creator-studio.conversation': { kind: 'single', scope: 'root' },
        } }, () => null);
      } });
      await ctx.plugin({ name: 'synthetic-studio-client', inject: ['slots', 'remote', 'sessions', 'workspaces'], apply: studio.apply });
      await ctx.plugin({ name: 'synthetic-official-conversation', inject: ['slots'], apply(owner) {
        owner.slots.registerFactory({ name: 'conversation.content', scope: 'session-maybe', children: {
          'conversation.session': { kind: 'single', scope: 'session' },
        } }, () => null);
        owner.slots.register({ name: 'conversation.session', children: {
          'conversation.view': { kind: 'list', scope: 'session' },
        } }, () => null);
        owner.slots.register({ name: 'conversation.view', id: 'chat', children: {
          'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        } }, () => null);
        owner.slots.register({ name: 'conversation.view', id: 'trajectory' }, () => null);
        owner.slots.register({ name: 'conversation.chat.node', key: 'synthetic-node', children: {
          'tool.call.toolview': { kind: 'single', scope: 'session' },
        } }, () => null);
      } });
      expect(ctx.slots.spec('conversation.session').scope).toBe('session');
      expect(ctx.slots.spec('eleckoi.creator-studio.session').scope).toBe('session');
      expect(ctx.slots.entriesOfSlot('eleckoi.creator-studio.session')).toHaveLength(1);
      expect(ctx.slots.entriesOfSlot('eleckoi.creator-studio.conversation')).toHaveLength(1);
      expect(ctx.slots.spec('eleckoi.creator-studio.tool.call.toolview').scope).toBe('session');
      expect(ctx.slots.spec('eleckoi.creator-studio.composer.bar').scope).toBe('session-maybe');
      expect(ctx.slots.entriesOfSlot('eleckoi.creator-studio.view').map(entry => entry.options.id)).toEqual(['chat', 'trajectory']);
    } finally { await ctx.fiber.dispose(); }
  });
  it('keeps real sidebar contributions and removes them when their Cordis fiber unloads', async () => {
    const ctx = new Cordis.Context();
    try {
      await ctx.plugin({ name: 'synthetic-root', apply(owner) {
        new renderer.SlotRegistry(owner);
        owner.reflect.provide('locale', officialLocale());
        owner.reflect.provide('theme', { getTheme: () => ({ active: { colorScheme: 'light', tokens: {} }, fontSizes: { text: 15, code: 14, terminal: 13 }, fontFamilies: { text: '', code: '', terminal: '' } }) });
        owner.reflect.provide('uiWorkspace', {});
        owner.reflect.provide('shortcuts', {});
        for (const name of shell.inject.filter(name => !['slots', 'locale', 'theme'].includes(name))) owner.reflect.provide(name, {});
      } });
      await ctx.plugin(shell);
      const original = await ctx.plugin({ name: 'synthetic-page', inject: ['slots'], apply(owner) {
        owner.slots.register({ name: 'main', key: 'messages' }, () => null);
      } });
      const mobile = await ctx.plugin(load(mobilePath));
      const sidebarEntry = ctx.slots.entriesOfSlot('sidebar')[0];
      expect(ctx.slots.entriesOfSlot('sidebar')).toHaveLength(1);
      expect(sidebarEntry.inject().hooks.eleckoiWorkspaceSessions.getSnapshot).toBeTypeOf('function');
      expect(ctx.slots.spec('sidebar.workspaces')).toMatchObject({ kind: 'single', scope: 'root' });
      expect(ctx.slots.entriesOfSlot('main').find(entry => entry.options.key === 'messages').registrant).toBe('@eleckoi/dsh-client-mobile');
      expect(ctx.slots.entriesOfSlot('main').find(entry => entry.options.key === 'settings').registrant).toBe('@eleckoi/dsh-client-mobile');
      const extension = await ctx.plugin({ name: 'synthetic-extension', inject: ['slots'], apply(owner) {
        owner.slots.inject('settings.section', () => owner.slots.register({ name: 'settings.section', id: 'synthetic-settings', order: 30, label: '合成扩展设置' }, () => null));
        owner.slots.inject('sidebar.panellist', () => owner.slots.register({ name: 'sidebar.panellist', id: 'synthetic-extension', label: '合成扩展' }, () => null));
        owner.slots.inject('sidebar.footer.action', () => owner.slots.register({ name: 'sidebar.footer.action', id: 'synthetic-footer' }, () => null));
        owner.slots.register({ name: 'main', key: 'synthetic-extension' }, () => null);
      } });
      expect(ctx.slots.entriesOfSlot('sidebar.panellist').some(entry => entry.options.id === 'synthetic-extension')).toBe(true);
      expect(ctx.slots.entriesOfSlot('settings.section').some(entry => entry.options.id === 'synthetic-settings')).toBe(true);
      ctx.layout.selectPanel('synthetic-extension');
      expect(ctx.layout.panelInfo.getSnapshot().windowPanelId).toBe('synthetic-extension');
      expect(ctx.slots.entriesOfSlot('sidebar.footer.action')).toHaveLength(1);
      await extension.dispose();
      expect(ctx.slots.entriesOfSlot('sidebar.panellist').some(entry => entry.options.id === 'synthetic-extension')).toBe(false);
      expect(ctx.slots.entriesOfSlot('sidebar.footer.action')).toEqual([]);
      expect(ctx.slots.entriesOfSlot('settings.section').some(entry => entry.options.id === 'synthetic-settings')).toBe(false);
      expect(ctx.slots.entriesOfSlot('main').some(entry => entry.options.key === 'synthetic-extension')).toBe(false);
      await mobile.dispose();
      expect(ctx.slots.entriesOfSlot('eleckoi.shell.window')).toEqual([]);
      expect(ctx.slots.entriesOfSlot('main').find(entry => entry.options.key === 'messages').registrant).toBe('synthetic-page');
      await original.dispose();
    } finally { await ctx.fiber.dispose(); }
  });
  it('declines the Android window on the desktop platform', () => {
    const contributions = [];
    load(mobilePath, 'desktop').apply({ slots: {
      inject: (_name, effect) => effect(),
      register: (options, component) => { contributions.push({ options, component }); return () => {}; },
    } });
    const windowEntry = contributions.find(entry => entry.options.name === 'eleckoi.shell.window');
    expect(windowEntry.options.select({ fallback: 'desktop' })).toBeNull();
    expect(contributions.find(entry => entry.options.name === 'conversation.header.leading').options.select({})).toBeNull();
  });
  it('registers and releases Android navigation in the public native Conversation header', async () => {
    const ctx = new Cordis.Context();
    try {
      await ctx.plugin({ name: 'synthetic-native-header', apply(owner) {
        new renderer.SlotRegistry(owner);
        owner.slots.register({ name: 'root', children: {
          'conversation.header.leading': { kind: 'single', scope: 'root' },
          'eleckoi.shell.window': { kind: 'chain', scope: 'root' },
          main: { kind: 'keyed', scope: 'root' },
        } }, () => null);
      } });
      const mobile = await ctx.plugin(load(mobilePath));
      const entry = ctx.slots.entriesOfSlot('conversation.header.leading')[0];
      expect(entry.registrant).toBe('@eleckoi/dsh-client-mobile');
      expect(entry.select({})).toEqual({});
      await mobile.dispose();
      expect(ctx.slots.entriesOfSlot('conversation.header.leading')).toEqual([]);
    } finally { await ctx.fiber.dispose(); }
  });
});
