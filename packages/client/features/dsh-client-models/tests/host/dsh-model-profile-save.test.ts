import { mkdtempSync, mkdirSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { boot, initProfile, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import Settings from '@deepseek-ai/dsh-settings'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import * as piAi from '@deepseek-ai/dsh-llm-pi-ai'
import { discoverDraftModels, readModelApiKey } from '@eleckoi/dsh-product-api'
import { afterEach, describe, expect, it } from 'vitest'
import { dshClientPlugin } from '../../../../../../tests/helpers/dshClientPlugin'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'

const source = readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8')
const modelSettings = createRequire(import.meta.url)('../../src/index.js')
const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'eleckoi-model-save-')))
  cleanups.push(() => rmSync(home, { recursive: true, force: true }))
  const dir = join(home, 'profiles', 'test')
  initProfile(dir, ['model-save-test'])
  writeFileSync(join(home, 'package.json'), '{"name":"model-save-test"}\n')
  const bundle = join(dir, 'node_modules', 'model-save-test')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({
    name: 'model-save-test', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } }
  }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' },
    { id: 'llm', name: 'cordis:llm' },
    { id: 'credentials', name: 'cordis:credentials', config: { path: join(dir, '.credentials.yaml'), watch: false } },
    { id: 'llm-pi-ai', name: 'cordis:pi-ai', config: { providers: {} } },
    { id: 'eleckoi-client-models', name: 'cordis:model-settings', config: { schemaVersion: 2 } }
  ] }]))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const profile: ProfileContext = {
    name: 'test', startedBundles: ['model-save-test'], dir, patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(home, 'package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined
  }
  const start = async () => {
    const ctx = await boot('test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), context => {
      context.provide('profileContext', profile)
      context.provide('appReady', { onReady: (listener: () => void) => { listener(); return () => {} } })
      Object.assign(context.loader.builtins, {
        editor: ConfigEditor, settings: Settings, llm: LlmRuntime,
        credentials: LocalCredentialProvider, 'pi-ai': piAi, 'model-settings': modelSettings
      })
    })
    cleanups.push(() => ctx.fiber.dispose())
    return { ctx, catalog: await clientCatalog(ctx) }
  }
  return { ...(await start()), profile, start }
}

async function clientCatalog(ctx: Context) {
  let registration: any
  let catalog: any
  const result = async (read: () => unknown) => {
    try { return { ok: true, value: await read() } }
    catch (error) { return { ok: false, error: { isDSHRemoteError: true, code: 'gateway/internal', message: (error as Error).message } } }
  }
  const remote = {
    settings: {
      describe: () => result(() => ({ namespaces: ctx.settings.describe({ redactSecrets: true }) })),
      mutate: (ns: string, ops: any, revision: number) => result(async () => {
        await ctx.settings.mutate(ns, JSON.parse(JSON.stringify(ops)), revision)
        return ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === ns)
      })
    },
    llm: { listConfigurableProviders: () => result(() => ctx.llm.listConfigurableProviders()) },
    credentials: {
      describe: (refs: string[]) => result(async () => Object.fromEntries(await Promise.all(
        refs.map(async ref => [ref, await ctx.credentials.describe(ref as never)])
      ))),
      set: (ref: string, value: string) => result(() => ctx.credentials.set(ref as never, value)),
      unset: (ref: string) => result(() => ctx.credentials.unset(ref as never))
    },
    eleckoiModels: {
      revealApiKey: (id: string) => result(() => readModelApiKey(ctx, id)),
      discoverModels: (input: any) => result(() => discoverDraftModels(ctx, input))
    },
    session: { modelCatalog: () => result(async () => ({
      groups: await Promise.all(ctx.llm.listProviders().map(async provider => ({
        id: provider.id, name: provider.name, models: await ctx.llm.listModels(provider.id)
      })))
    })) }
  }
  runInNewContext(source, { window: { __ModuleLoader__: { load: (item: any) => { registration = item } } } })
  dshClientPlugin(registration).apply({ remote,
    provide: (_name: string, value: unknown) => { catalog = value }, effect: () => {}, on: () => () => {} })
  cleanups.push(() => catalog.dispose())
  await catalog.refresh()
  return catalog
}

const draft = () => ({ id: 'config-synthetic', provider: 'custom', name: '', model: '', model_options: [],
  api_format: 'responses', base_url: 'https://models.example/v1', api_key: 'synthetic-test-value',
  custom_headers: { 'x-model-config': 'synthetic-header' } })

describe('model configuration persistence through DSH settings', () => {
  it('merges concurrent menu edits into the latest model, rejects invalid values without writes, and restores after reopening', async () => {
    const { ctx, catalog, start } = await fixture()
    await catalog.save({ ...draft(), model: 'synthetic-main', model_options: [
      { id: 'synthetic-main', contextWindowTokens: 64000, topP: .8, temperature: .2 },
      { id: 'synthetic-peer', contextWindowTokens: 32000, temperature: .4 },
    ] })
    await Promise.all([
      catalog.saveModelParameters('config-synthetic', 'synthetic-main', { temperature: .72 }),
      catalog.saveModelParameters('config-synthetic', 'synthetic-main', { topP: .93 }),
    ])
    const saved = catalog.getSnapshot().configs.find((item: any) => item.id === 'config-synthetic')
    expect(saved.model_options).toMatchObject([
      { id: 'synthetic-main', temperature: .72, topP: .93, contextWindowTokens: 64000 },
      { id: 'synthetic-peer', temperature: .4, contextWindowTokens: 32000 },
    ])
    expect(saved.custom_headers).toEqual({ 'x-model-config': 'synthetic-header' })
    const values = () => ctx.settings.describe().map(({ ns, revision, value }) => ({ ns, revision, value }))
    const before = JSON.stringify(values())
    for (const patch of [{ topP: 1.2 }, { maxOutputTokens: 0 }, { autoCompactTokenLimit: 64001 }, { inputModalities: [] }, { id: 'other-model' },
      { reasoningEfforts: {} }, { reasoningEfforts: { off: null } }, { reasoningEfforts: { high: '' } },
      { reasoningEfforts: { unknown: 'unknown' } }, { reasoningEfforts: { high: null } }, { reasoningEffort: 'high' }]) {
      await expect(catalog.saveModelParameters('config-synthetic', 'synthetic-main', patch)).rejects.toMatchObject({ code: ELECKOI_FAILURE_CODES.modelConfigInvalid })
      expect(JSON.stringify(values())).toBe(before)
    }
    await ctx.fiber.dispose()
    const reopened = await start()
    expect(reopened.catalog.getSnapshot().configs.find((item: any) => item.id === 'config-synthetic').model_options).toMatchObject(saved.model_options)
  }, 30_000)

  it('publishes explicitly declared reasoning levels for a custom Chat model and restores them after reopening', async () => {
    const { ctx, catalog, start } = await fixture()
    await catalog.save({ ...draft(), api_format: 'chat_completions', model: 'synthetic-main', model_options: [
      { id: 'synthetic-main', contextWindowTokens: 64000, temperature: .2 },
      { id: 'synthetic-peer', contextWindowTokens: 32000 },
    ] })
    expect((await ctx.llm.resolveModelInfo('config-synthetic' as never, 'synthetic-main' as never)).reasoning).toBeUndefined()
    const saved = await catalog.saveModelParameters('config-synthetic', 'synthetic-main', { reasoningEfforts: { off: null, low: 'low', high: 'high' } })
    const reasoning = (await ctx.llm.resolveModelInfo('config-synthetic' as never, 'synthetic-main' as never)).reasoning
    expect(reasoning?.efforts.map(level => level.id)).toEqual(['off', 'low', 'high'])
    expect(saved.model_options[0]).toMatchObject({ reasoningEfforts: { off: null, low: 'low', high: 'high' }, temperature: .2 })
    expect((await ctx.llm.resolveModelInfo('config-synthetic' as never, 'synthetic-peer' as never)).reasoning).toBeUndefined()
    await ctx.fiber.dispose()
    const reopened = await start()
    expect((await reopened.ctx.llm.resolveModelInfo('config-synthetic' as never, 'synthetic-main' as never)).reasoning).toEqual(reasoning)
    await reopened.catalog.saveModelParameters('config-synthetic', 'synthetic-main', { reasoningEfforts: false })
    expect((await reopened.ctx.llm.resolveModelInfo('config-synthetic' as never, 'synthetic-main' as never)).reasoning).toBeUndefined()
    expect((reopened.ctx.settings.describe().find(row => row.ns === 'llm-pi-ai')!.value as any).providers['config-synthetic'].models[0].reasoningEfforts).toBe(false)
  }, 30_000)

  it('saves two independent drawing configurations and deletes only the selected credentials', async () => {
    const { ctx, catalog } = await fixture()
    const first = await catalog.save({ ...draft(), id: 'drawing-first', name: 'Drawing One', provider: 'openai_image',
      model: 'synthetic-image-model', image_settings: { width: 1024, height: 1536, quality: 'auto', background: 'auto' } })
    const second = await catalog.save({ ...draft(), id: 'drawing-second', name: 'Drawing Two', provider: 'novelai_image',
      model: 'synthetic-image-model', image_settings: { width: 832, height: 1216, steps: 28 } })
    expect(catalog.getSnapshot().configs.map((item: any) => item.id)).toEqual(['drawing-first', 'drawing-second'])
    expect(ctx.llm.listProviders()).toEqual([])
    await catalog.deleteConfig(first.id)
    expect(catalog.getSnapshot().configs).toMatchObject([{ id: second.id, provider: 'novelai_image', image_settings: second.image_settings }])
    expect((await ctx.credentials.describe(first.credentialRef)).configured).toBe(false)
    expect((await ctx.credentials.describe(second.credentialRef)).configured).toBe(true)
  }, 30_000)

  it('keeps the builtin catalog and native protocol while saving individual model overrides', async () => {
    const { ctx, catalog, start } = await fixture()
    const route = catalog.getSnapshot().providers.find((item: any) => item.provider === 'openai')
    expect(route).toBeDefined()
    const models = await catalog.discover({ id: route.provider, provider: 'custom', builtin: true, api_format: 'catalog' })
    expect(models.length).toBeGreaterThan(1)
    const selected = models.find((item: any) => item.reasoningEfforts && Object.hasOwn(item.reasoningEfforts, 'high'))
    expect(selected).toBeDefined()
    const saved = await catalog.save({ id: route.provider, name: 'Synthetic builtin', provider: 'custom', builtin: true,
      useBuiltinModels: true, api_format: 'catalog', model: selected.id, base_url: '', api_key: '',
      model_options: models.map((item: any) => item.id === selected.id ? { ...item, contextWindowTokens: 65536,
        overrideFields: ['contextWindow'], autoCompactTokenLimit: 40000, topP: 0.95 } : item) })
    const profile = (ctx.settings.describe().find(row => row.ns === 'llm-pi-ai')!.value as any).providers.openai
    expect(profile).not.toHaveProperty('api')
    expect(profile.models || []).toEqual([])
    expect(profile.apiKeyEnv || undefined).toBeUndefined()
    expect(Object.keys(profile.modelOverrides)).toEqual([selected.id])
    expect(profile.modelOverrides[selected.id]).toMatchObject({ contextWindow: 65536 })
    expect(profile.modelOverrides[selected.id].reasoningEfforts).toBeUndefined()
    expect((await ctx.llm.listModels('openai')).length).toBe(models.length)
    expect(saved.model_options.find((item: any) => item.id === selected.id)).toMatchObject({ contextWindowTokens: 65536, autoCompactTokenLimit: 40000, topP: 0.95 })
    await ctx.fiber.dispose()
    const reopened = await start()
    const restored = reopened.catalog.getSnapshot().configs.find((item: any) => item.id === 'openai')
    expect(restored).toMatchObject({ builtin: true, useBuiltinModels: true, model: selected.id })
    expect(restored.model_options.find((item: any) => item.id === selected.id).catalogDefaults.contextWindowTokens).toBe(selected.catalogDefaults.contextWindowTokens)
    await reopened.catalog.deleteConfig('openai')
    expect(reopened.catalog.getSnapshot().configs.some((item: any) => item.id === 'openai')).toBe(false)
  }, 30_000)

  it.each(['responses', 'chat_completions', 'anthropic_messages', 'google_gemini'])(
    'retains an incomplete %s configuration and clears it without registering a route', async api_format => {
      const { ctx, catalog, start } = await fixture()
      const saved = await catalog.save({ ...draft(), api_format })
      expect(saved).toMatchObject({ api_format, base_url: draft().base_url, model: '', model_options: [],
        api_key: '', credentialConfigured: true, enabled: false })
      expect(ctx.llm.listProviders()).toEqual([])
      await ctx.fiber.dispose()
      const reopened = await start()
      const restored = reopened.catalog.getSnapshot().configs.find((item: any) => item.id === saved.id)
      expect(restored).toMatchObject(saved)
      await reopened.catalog.save({ ...restored, clearConfiguration: true })
      expect(reopened.catalog.getSnapshot().configs).toEqual([])
      expect((await reopened.ctx.credentials.describe(saved.credentialRef)).configured).toBe(false)
    }, 30_000)

  it.each(['responses', 'chat_completions', 'anthropic_messages', 'google_gemini'])(
    'saves and restores an endpoint and key, then activates a manually added %s model without discovery', async api_format => {
    let { ctx, catalog, profile, start } = await fixture()
    const saved = await catalog.save({ ...draft(), api_format })
    expect(saved).toMatchObject({ ...draft(), api_format, name: draft().id, api_key: '', credentialConfigured: true, enabled: false })
    expect(ctx.llm.listProviders()).toEqual([])
    expect(readFileSync(profile.patchPath, 'utf8')).not.toContain(draft().api_key)
    await ctx.fiber.dispose()
    ;({ ctx, catalog } = await start())
    const restored = catalog.getSnapshot().configs.find((item: any) => item.id === saved.id)
    expect(restored).toMatchObject({ ...saved, api_key: '', enabled: false })
    await expect(catalog.revealApiKey(saved.id)).resolves.toBe(draft().api_key)

    await expect(catalog.save({ ...restored, model: 'synthetic-model', model_options: [
      { id: 'synthetic-model', contextWindowTokens: -1 }
    ] })).rejects.toThrow('contextWindow')
    await catalog.refresh()
    expect(catalog.getSnapshot().configs.find((item: any) => item.id === saved.id)).toMatchObject(restored)
    expect(ctx.llm.listProviders()).toEqual([])

    const active = await catalog.save({ ...restored, name: 'Synthetic provider', model: 'synthetic-model',
      model_options: [{ id: 'synthetic-model', isUserAdded: true, contextWindowTokens: 65536, topP: 0.95 }] })
    expect(active).toMatchObject({ enabled: true, credentialConfigured: true, model: 'synthetic-model' })
    expect(active.model_options[0]).toMatchObject({ isUserAdded: true, contextWindowTokens: 65536, topP: 0.95 })
    expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual([saved.id])
    expect((await ctx.llm.listModels(saved.id)).map(model => model.id)).toEqual(['synthetic-model'])
    expect((ctx.settings.describe().find(row => row.ns === 'eleckoi-client-models')!.value as any)
      .entries[saved.id]).not.toHaveProperty('draftProfile')

    await ctx.fiber.dispose()
    ;({ ctx, catalog } = await start())
    expect(catalog.getSnapshot().configs.find((item: any) => item.id === saved.id))
      .toMatchObject({ api_format, enabled: true, credentialConfigured: true, model: 'synthetic-model' })
    expect((await ctx.llm.listModels(saved.id)).map(model => model.id)).toEqual(['synthetic-model'])

    const emptied = await catalog.save({ ...active, model: '', model_options: [] })
    expect(emptied).toMatchObject({ enabled: false, model_options: [], base_url: draft().base_url })
    expect(ctx.llm.listProviders()).toEqual([])
    await expect(catalog.revealApiKey(saved.id)).resolves.toBe(draft().api_key)
    await catalog.deleteConfig(saved.id)
    expect(catalog.getSnapshot().configs).toEqual([])
    expect((await ctx.credentials.describe(saved.credentialRef)).configured).toBe(false)
  }, 30_000)

  it('discovers later with the saved key and headers, then registers the explicitly selected model', async () => {
    const requests: Array<{ path: string | undefined; authorization: string | undefined; header: string | string[] | undefined }> = []
    const server = createServer((request, response) => {
      requests.push({ path: request.url, authorization: request.headers.authorization,
        header: request.headers['x-model-config'] })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'synthetic-model-one' }, { id: 'synthetic-model-two' }] }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanups.push(async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    })
    const { ctx, catalog } = await fixture()
    const saved = await catalog.save({ ...draft(),
      base_url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1` })
    expect(requests).toEqual([])
    const models = await catalog.discover(saved)
    expect(requests).toEqual([{ path: '/v1/models', authorization: `Bearer ${draft().api_key}`,
      header: 'synthetic-header' }])
    expect(models.map((model: any) => model.id)).toEqual(['synthetic-model-one', 'synthetic-model-two'])
    expect(ctx.llm.listProviders()).toEqual([])
    const active = await catalog.save({ ...saved, model: 'synthetic-model-two', model_options: models })
    expect(active).toMatchObject({ enabled: true, model: 'synthetic-model-two', credentialConfigured: true })
    expect((await ctx.llm.listModels(saved.id)).map(model => model.id)).toEqual(models.map((model: any) => model.id))
    expect(requests).toHaveLength(1)
  }, 30_000)
})
