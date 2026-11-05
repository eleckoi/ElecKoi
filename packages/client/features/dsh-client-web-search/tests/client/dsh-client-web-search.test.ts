import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dshClientPlugin } from '../../../../../../tests/helpers/dshClientPlugin'

const source = readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8')
const ok = (value: unknown) => Promise.resolve({ ok: true, value })

function harness() {
  let registration: any
  let model: any
  let cleanup = () => {}
  let selection = 'tavily'
  let fetchSelection = 'http'
  const remote = {
    eleckoiWebSearch: {
      selection: vi.fn(() => ok(selection)),
      fetchSelection: vi.fn(() => ok(fetchSelection)),
      selectFetch: vi.fn((value: string) => { fetchSelection = value; return ok(value) }),
      select: vi.fn((value: string) => { selection = value; return ok(value) }),
      testTavily: vi.fn(() => ok({ ok: true, used: 0, limit: 100, plan: 'Test' }))
    },
    settings: {
      describe: vi.fn(() => ok({ writable: true, namespaces: [{
        ns: 'web-search-tavily', revision: 4, value: { apiKeyEnv: 'CUSTOM_SEARCH_KEY', maxResults: 8 }
      }, { ns: 'web-deepseek-api', revision: 7, value: { count: 10 } }] })),
      mutate: vi.fn(() => ok(undefined))
    },
    credentials: {
      describe: vi.fn(() => ok({ CUSTOM_SEARCH_KEY: { configured: true, writable: true } })),
      set: vi.fn(() => ok(undefined)),
      unset: vi.fn(() => ok(undefined))
    },
    $on: vi.fn(() => () => {})
  }
  const items = [{ id: 'web-search' }]
  const navigation = { actions: { setView: vi.fn(), setTab: vi.fn() } }
  const layout = { selectPanel: vi.fn() }
  const entry = { options: { key: 'plugins' }, store: { create: () => navigation }, inject: () => ({ hooks: { configLedger: { getSnapshot: () => ({ items }) } } }) }
  const slots = { entriesOfSlot: vi.fn(() => [{ options: { key: 'other' } }, entry]) }
  runInNewContext(source, { window: { __ModuleLoader__: { load: (value: any) => { registration = value } } } })
  dshClientPlugin(registration).apply({
    remote, get: (name: string) => ({ slots, layout })[name], provide: (_name: string, value: any) => { model = value },
    effect: (run: () => () => void) => { cleanup = run() }, on: () => () => {}
  })
  return { remote, model, layout, navigation, items, cleanup: () => cleanup() }
}

describe('DSH web search Client model', () => {
  it.each([0, 20])('persists and reopens the official Tavily count %i without replacing it with five', async count => {
    const { remote, model, cleanup } = harness()
    try {
      remote.settings.describe.mockImplementation(() => ok({ writable: true, namespaces: [{ ns: 'web-search-tavily', revision: 4, value: { apiKeyEnv: 'CUSTOM_SEARCH_KEY', maxResults: count } }] }))
      await model.refresh()
      expect(model.getSnapshot().maxResults).toBe(count)
      await model.update({ maxResults: count === 0 ? 20 : 0 })
      expect(remote.settings.mutate).toHaveBeenCalledWith('web-search-tavily', [{ op: 'set', path: ['maxResults'], value: count === 0 ? 20 : 0 }], 4)
    } finally { cleanup() }
  })

  it('selects official providers without editing DeepSeek settings or credentials', async () => {
    const { remote, model, cleanup } = harness()
    try {
      await model.refresh()
      await model.update({ mode: 'deepseek_search_api', fetchMode: 'deepseek_fetch_api' })
      expect(remote.eleckoiWebSearch.select).toHaveBeenCalledWith('deepseek_search_api')
      expect(remote.eleckoiWebSearch.selectFetch).toHaveBeenCalledWith('deepseek_fetch_api')
      expect(model.getSnapshot().officialDeepSeekAvailable).toBe(true)
      expect(model.getSnapshot()).toMatchObject({ mode: 'deepseek_search_api', fetchMode: 'deepseek_fetch_api' })
      expect(remote.settings.mutate).not.toHaveBeenCalled()
      expect(remote.credentials.set).not.toHaveBeenCalled()
    } finally { cleanup() }
  })
  it('keeps Messages search selected after refreshing without enabling the new API or navigating', async () => {
    const { remote, model, layout, cleanup } = harness()
    try {
      await model.refresh()
      expect(model.getSnapshot().mode).toBe('tavily')
      await model.update({ mode: 'provider_native' })
      await model.refresh()
      expect(model.getSnapshot()).toMatchObject({ mode: 'provider_native', fetchMode: 'http' })
      expect(remote.eleckoiWebSearch.select).toHaveBeenCalledExactlyOnceWith('provider_native')
      expect(remote.eleckoiWebSearch.selectFetch).not.toHaveBeenCalled()
      expect(remote.settings.mutate).not.toHaveBeenCalled()
      expect(remote.credentials.set).not.toHaveBeenCalled()
      expect(layout.selectPanel).not.toHaveBeenCalled()
    } finally { cleanup() }
  })
  it('opens the exact official configuration item in the installed tab', async () => {
    const { model, remote, layout, navigation, items, cleanup } = harness()
    try {
      await model.refresh()
      model.openPluginSettings()
      expect(layout.selectPanel).toHaveBeenCalledWith('plugins')
      expect(navigation.actions.setTab).toHaveBeenCalledWith('installed')
      expect(navigation.actions.setView).toHaveBeenCalledWith({ kind: 'item', id: 'web-search' })
      expect(remote.settings.mutate).not.toHaveBeenCalled()
      expect(remote.credentials.set).not.toHaveBeenCalled()
      items.splice(0)
      expect(() => model.openPluginSettings()).toThrow('网页搜索插件设置当前不可用')
      expect(layout.selectPanel).toHaveBeenCalledTimes(1)
    } finally { cleanup() }
  })
  it('uses the configured credential reference and revision without reading credential contents', async () => {
    const { remote, model, cleanup } = harness()
    try {
      await model.refresh()
      expect(model.getSnapshot()).toMatchObject({ mode: 'tavily', maxResults: 8, apiKeyConfigured: true })
      expect(remote.credentials.describe).toHaveBeenCalledWith(['CUSTOM_SEARCH_KEY'])
      await model.saveAndTest('synthetic-key')
      expect(remote.credentials.set).toHaveBeenCalledWith('CUSTOM_SEARCH_KEY', 'synthetic-key')
      await model.update({ maxResults: 3 })
      expect(remote.settings.mutate).toHaveBeenCalledWith('web-search-tavily', [{
        op: 'set', path: ['maxResults'], value: 3
      }], 4)
      await model.removeKey()
      expect(remote.credentials.unset).toHaveBeenCalledWith('CUSTOM_SEARCH_KEY')
    } finally { cleanup() }
  })

  it('does not save a credential when its connection test fails', async () => {
    const { remote, model, cleanup } = harness()
    try {
      await model.refresh()
      remote.eleckoiWebSearch.testTavily.mockResolvedValueOnce({ ok: false, error: { isDSHRemoteError: true, code: 'gateway/internal', message: 'invalid credential' } } as any)
      await expect(model.saveAndTest('invalid')).rejects.toThrow('invalid credential')
      expect(remote.credentials.set).not.toHaveBeenCalled()
    } finally { cleanup() }
  })
})
