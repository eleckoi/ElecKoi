import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as Cordis from '@deepseek-ai/cordis';
import TypertRegistry from '@deepseek-ai/dsh-typert-registry';
import { TYPERT_REMOTE } from '@eleckoi/dsh-product-api/remote';
import { CompatibilityCatalogOperations } from '../packages/dsh-product-api/lib/types/compatibility-catalog.js';
import { createApplicationApi } from '../packages/dsh-client-tavern-shared/src/application-api.js';
import { dshClientPlugin } from './helpers/dshClientPlugin';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const empty = () => ({ active_character_id: '', groups: [], items: [] });

async function client(call) {
  const ctx = new Cordis.Context();
  try {
    await ctx.plugin(TypertRegistry);
    ctx.provide('connection', { rpc: { call, open: vi.fn(async function* () {}) }, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }) });
    let gateway;
    runInNewContext(readFileSync(require.resolve('@deepseek-ai/dsh-api-gateway/client'), 'utf8'), {
      window: { __ModuleLoader__: { load: value => { gateway = value; } } },
      crypto: globalThis.crypto, AbortController, AbortSignal, Error, setTimeout, clearTimeout,
    });
    await ctx.plugin(gateway.factory(name => {
      if (name === '@deepseek-ai/cordis') return Cordis;
      throw new Error(`Unexpected Client dependency: ${name}`);
    }));
    await ctx.remote.$mount(TYPERT_REMOTE);
    let characters;
    runInNewContext(readFileSync(new URL('../packages/dsh-client-characters/src/client.js', import.meta.url), 'utf8'), {
      window: { __ModuleLoader__: { load: value => { characters = value; } } }, AbortController,
    });
    let catalog;
    await ctx.plugin({ inject: ['remote', 'remote.eleckoiCharacters'], apply(owner) {
      dshClientPlugin(characters).apply({ remote: owner.remote, effect: () => {}, provide: (_name, value) => { catalog = value; } });
    } });
    return { ctx, catalog };
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}

function compatibility() {
  const native = { id: 'synthetic-card', name: 'Synthetic Character', persona: {} };
  const documents = new Map([['character-cards', { name: native.name }]]);
  const store = { get: (scope) => documents.get(scope) ?? null, delete: vi.fn(scope => documents.delete(scope)) };
  const remove = vi.fn(async () => empty());
  const publish = vi.fn();
  const catalog = new CompatibilityCatalogOperations({ compatibilityStore: () => store, readSettingLibrary: () => ({ entries: [] }) }, {
    characters: { list: () => ({ active_character_id: native.id, groups: [], items: [native] }), delete: remove },
  }, publish);
  return { catalog, remove, store, publish, documents };
}

describe('character deletion uses one native rule through Client Remote and SDK', () => {
  it('allows the existing one-argument Client call through the actual generated Gateway', async () => {
    const call = vi.fn(async () => ({ ok: true, value: empty() }));
    const { ctx, catalog } = await client(call);
    try {
      await expect(catalog.delete(['synthetic-card', 'synthetic-card-2'])).resolves.toEqual(empty());
      expect(call).toHaveBeenCalledExactlyOnceWith('/api', 'eleckoiCharacters/delete', {
        args: { characterIds: ['synthetic-card', 'synthetic-card-2'] },
      }, expect.any(AbortSignal));
      expect(catalog.getSnapshot()).toEqual({ status: 'ready', collection: empty(), error: '' });
    } finally { await ctx.fiber.dispose(); }
  });

  it('retains the current character collection when Host deletion fails', async () => {
    const saved = { active_character_id: 'synthetic-card', groups: [], items: [{ id: 'synthetic-card' }] };
    const call = vi.fn().mockResolvedValueOnce({ ok: true, value: saved })
      .mockResolvedValueOnce({ ok: false, error: { code: 'gateway/internal', message: 'Synthetic deletion failed', details: {} } });
    const { ctx, catalog } = await client(call);
    try {
      await catalog.refresh();
      const before = catalog.getSnapshot();
      await expect(catalog.delete(['synthetic-card'])).rejects.toThrow('Synthetic deletion failed');
      expect(catalog.getSnapshot()).toBe(before);
      expect(call).toHaveBeenCalledTimes(2);
    } finally { await ctx.fiber.dispose(); }
  });

  it('routes SDK deletion to the same single-argument native method', async () => {
    const f = compatibility();
    await expect(f.catalog.invoke({ method: 'characters.delete', params: {
      id: 'synthetic-card',
    } })).resolves.toBe(true);
    expect(f.remove).toHaveBeenCalledExactlyOnceWith(['synthetic-card']);
    expect(f.store.delete).toHaveBeenCalledWith('character-cards', 'synthetic-card');
    expect(f.publish).toHaveBeenCalledOnce();
  });

  it('does not clear compatibility data when the native deletion fails', async () => {
    const f = compatibility();
    f.remove.mockRejectedValueOnce(new Error('Synthetic native deletion failed'));
    await expect(f.catalog.invoke({ method: 'characters.delete', params: { id: 'synthetic-card' } })).rejects.toThrow('Synthetic native deletion failed');
    expect(f.remove).toHaveBeenCalledExactlyOnceWith(['synthetic-card']);
    expect(f.store.delete).not.toHaveBeenCalled();
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.documents.has('character-cards')).toBe(true);
  });

  it('uses the native deletion action on the application SDK facade', async () => {
    const remove = vi.fn(async () => empty());
    const api = createApplicationApi({
      conversations: { getDetailsSnapshot: () => ({ id: '' }) },
      window: { location: { href: 'http://localhost/' } }, subscribe: () => () => {},
    }, { characters: { delete: remove } });
    try {
      await api.application.actions.characters.delete(['synthetic-card']);
      expect(remove).toHaveBeenCalledExactlyOnceWith(['synthetic-card']);
    } finally { api.dispose(); }
  });
});
