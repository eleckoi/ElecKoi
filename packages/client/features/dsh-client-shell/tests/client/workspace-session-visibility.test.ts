import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dshClientRequire } from '../../../../../../tests/helpers/dshClientPlugin'

function source<T>(initial: T) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    publish: (value: T) => { snapshot = value; listeners.forEach(listener => listener()) } }
}

function fixture(platform = 'desktop') {
  const row = (id: string, projectionValues: any = {}, parentId?: string) => ({ id, projectionValues, parentId, retainedBy: {} })
  const byId = Object.fromEntries([
    row('role', { agentPreset: 'historical-preset' }), row('studio', { eleckoiCreatorStudio: { presetId: 'creator', characterId: '' } }),
    row('new-role', { agentPreset: 'eleckoi-active' }), row('new-studio', { agentPreset: 'eleckoi-creator-active' }),
    row('grandchild', {}, 'child'), row('child', {}, 'role'), row('native', { agentPreset: 'cordis' }), row('loose', { agentPreset: 'default' }),
    { id: 'unknown', retainedBy: {} },
  ].map(item => [item.id, item]))
  const sessions = Object.assign(source({ ids: Object.keys(byId), byId, projectionsBySession: {}, phase: 'ready' }), {
    search: vi.fn(async () => ({ ok: true, value: { items: ['role', 'studio', 'child', 'native'].map(sessionId => ({ sessionId, snippet: 'shared search text' })), hasMore: true } })),
  })
  const conversations = source({ status: 'ready', items: [{ id: 'conversation', runtimeSessionId: 'role' }] })
  const registry = source({ phase: 'ready', items: [{ workspaceId: 'workspace', sessionIds: ['role', 'native'] }],
    pinnedSessionIds: ['role', 'native'], archivedSessionIds: ['studio', 'loose'] })
  const studio = { open: vi.fn(async () => {}), startWorkspace: vi.fn(async () => {}) }
  const uiWorkspace = { openSession: vi.fn(), startSession: vi.fn() }
  const layout = { selectPanel: vi.fn(), panelInfo: source<{ activePanelId: string | null; windowPanelId?: string }>({ activePanelId: null }) }
  const face = { requestSessionRename: vi.fn(), unarchiveSession: vi.fn() }
  const entries: any[] = []
  const slots: any = {
    provideRoot: () => () => {}, spec: () => undefined, subscribe: () => () => {},
    register: (options: any, component: any) => { const entry = { options, component }; entries.push(entry); return () => entries.splice(entries.indexOf(entry), 1) },
    inject: (_name: string, register: any) => { const disposers = register(); if (typeof disposers !== 'function') Array.from(disposers) },
    entries: (name: string) => entries.filter(entry => entry.options.name === name),
    entriesOfSlot: (name: string) => name === 'sidebar.workspaces' ? [{ inject: () => face }] : entries.filter(entry => entry.options.name === name),
  }
  const services: any = { sessions: { list: sessions, search: sessions.search }, workspaces: { list: registry }, eleckoiConversations: conversations, uiWorkspace, eleckoiCreatorStudio: { sessions: studio } }
  const context: any = { slots, layout, get: (name: string) => services[name], inject: () => {},
    reflect: { provide: () => () => {} }, extend: (values: any) => ({ ...context, ...values }),
    plugin: (plugin: any) => { plugin.apply(context); return { dispose: () => {} } },
    effect: (run: any, label: string) => { if (label === 'eleckoi: native workspace sidebar library') run() },
  }
  const official = { inject: [], apply: (ctx: any) => ctx.slots.inject('sidebar', () => ctx.slots.register({ name: 'sidebar' }, () => null)) }
  const React = { lazy: () => () => null, useEffect: (run: any) => run(),
    createElement: (component: any, props: any) => ({ component, props }) }
  let registration: any
  runInNewContext(readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8'), {
    __ELECKOI_CLIENT_PLATFORM__: { kind: platform }, __ELECKOI_DSH_SIDEBAR_READY__: true, AbortController,
    window: { __ModuleLoader__: { load: (value: any) => { registration = value } }, addEventListener: () => {}, removeEventListener: () => {} },
  })
  registration.factory((name: string) => name === 'react' ? React : name === '@deepseek-ai/dsh-client-ui-primitives' ? {}
    : name === '@deepseek-ai/dsh-client-ui-sidebar' ? official : dshClientRequire(name)).apply(context)
  const sidebar = entries.find(entry => entry.options.name === 'sidebar')
  const hooks = sidebar.options.inject().hooks
  const render = () => {
    const body = sidebar.component({ workspace: true, renderContent: (_render: any, value: any) => value,
      useEleckoiWorkspaceSessions: (select: any) => select(hooks.eleckoiWorkspaceSessions.getSnapshot()),
      useEleckoiWorkspaceRegistry: (select: any) => select(hooks.eleckoiWorkspaceRegistry.getSnapshot()),
      useSessions: (select: any) => select(sessions.getSnapshot()),
      renderSlot: (_name: string, owner: any) => owner,
    })
    return body.props.renderSlot('sidebar.workspaces', { wide: true })
  }
  return { sessions, conversations, registry, uiWorkspace, studio, layout, face, hooks, render }
}

describe.each(['desktop', 'android'])('%s plugin Workspace Session ownership', platform => {
  it('shows only existing creative conversations in Studio, across workspaces and ungrouped, without modifying any Session', async () => {
    const f = fixture(platform), list = f.sessions.getSnapshot(), registry = f.registry.getSnapshot()
    f.layout.panelInfo.publish(platform === 'android' ? { activePanelId: null, windowPanelId: 'creatorStudio' } : { activePanelId: 'creatorStudio' })
    expect(f.hooks.eleckoiWorkspaceSessions.getSnapshot().ids).toEqual(['studio', 'new-studio'])
    expect(f.hooks.eleckoiWorkspaceRegistry.getSnapshot().items[0].sessionIds).toEqual([])
    const owner = f.render()
    expect(() => owner.open('native')).toThrow()
    expect(() => owner.open('role')).toThrow()
    owner.open('studio'); owner.open('new-studio')
    await Promise.resolve()
    expect(f.studio.open.mock.calls).toEqual([['studio'], ['new-studio']])
    expect(f.uiWorkspace.openSession).not.toHaveBeenCalled()
    expect(f.sessions.getSnapshot()).toBe(list)
    expect(f.registry.getSnapshot()).toBe(registry)
    f.layout.panelInfo.publish({ activePanelId: null, windowPanelId: 'conversation' })
    expect(f.hooks.eleckoiWorkspaceSessions.getSnapshot().ids).toContain('native')
  })
  it('excludes product Sessions and their descendants from grouped and ungrouped metadata without changing the shared catalogs', () => {
    const f = fixture(platform), originalList = f.sessions.getSnapshot(), originalRegistry = f.registry.getSnapshot()
    const list = f.hooks.eleckoiWorkspaceSessions.getSnapshot()
    expect(list.ids).toEqual(['studio', 'new-studio', 'native', 'loose'])
    expect(Object.keys(list.byId)).toEqual(['studio', 'new-studio', 'native', 'loose'])
    expect(f.hooks.eleckoiWorkspaceSessions.getSnapshot()).toBe(list)
    expect(f.hooks.eleckoiWorkspaceRegistry.getSnapshot()).toMatchObject({ items: [{ sessionIds: ['native'] }],
      pinnedSessionIds: ['native'], archivedSessionIds: ['studio', 'loose'] })
    expect(f.sessions.getSnapshot()).toBe(originalList)
    expect(f.registry.getSnapshot()).toBe(originalRegistry)
    expect(f.conversations.getSnapshot().items).toHaveLength(1)
  })

  it('keeps pending ownership and unknown projection rows unavailable, then updates from the official metadata sources', () => {
    const f = fixture(platform), source = f.hooks.eleckoiWorkspaceSessions, listener = vi.fn(), stop = source.subscribe(listener)
    f.conversations.publish({ status: 'loading', items: [] })
    expect(source.getSnapshot()).toMatchObject({ phase: 'pending', ids: [], byId: {} })
    f.conversations.publish({ status: 'ready', items: [{ id: 'conversation', runtimeSessionId: 'role' }] })
    const previous = f.sessions.getSnapshot()
    f.sessions.publish({ ...previous, byId: { ...previous.byId, unknown: { ...previous.byId.unknown!, projectionValues: { agentPreset: 'cordis' } } } })
    expect(source.getSnapshot().ids).toEqual(['studio', 'new-studio', 'native', 'loose', 'unknown'])
    expect(listener).toHaveBeenCalledTimes(3)
    stop()
    f.conversations.publish({ ...f.conversations.getSnapshot() })
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('filters content search and blocks stale product-row operations while preserving normal workspace actions', async () => {
    const f = fixture(platform), owner = f.render(), signal = new AbortController().signal
    expect(await owner.searchSessions('shared', signal)).toEqual({ items: [{ sessionId: 'studio', snippet: 'shared search text' }, { sessionId: 'native', snippet: 'shared search text' }], hasMore: true })
    expect(f.sessions.search).toHaveBeenCalledWith('shared', signal)
    for (const id of ['role', 'child', 'unknown']) {
      expect(() => owner.open(id)).toThrow()
      expect(() => owner.requestSessionRename(id, 'changed')).toThrow()
      expect(() => owner.unarchiveSession(id)).toThrow()
    }
    expect(f.uiWorkspace.openSession).not.toHaveBeenCalled()
    expect(f.face.requestSessionRename).not.toHaveBeenCalled()
    expect(f.face.unarchiveSession).not.toHaveBeenCalled()
    owner.open('native'); owner.requestSessionRename('native', 'changed'); owner.unarchiveSession('loose')
    expect(f.uiWorkspace.openSession).toHaveBeenCalledWith('native')
    expect(f.face.requestSessionRename).toHaveBeenCalledWith('native', 'changed')
    expect(f.face.unarchiveSession).toHaveBeenCalledWith('loose')
    owner.startSession('workspace')
    expect(f.studio.startWorkspace).toHaveBeenCalledWith('workspace', undefined)
    owner.open('studio')
    await Promise.resolve()
    expect(f.studio.open).toHaveBeenCalledWith('studio')
    expect(f.layout.selectPanel).toHaveBeenCalledWith('creatorStudio')
  })

  it('leaves an already open product Session out of the programming surface', () => {
    const f = fixture(platform), list = f.sessions.getSnapshot()
    f.sessions.publish({ ...list, byId: { ...list.byId, role: { ...list.byId.role!, retainedBy: { mainView: 1 } } } })
    f.render()
    expect(f.layout.selectPanel).toHaveBeenCalledWith('messages')
    f.layout.selectPanel.mockClear()
    const next = f.sessions.getSnapshot()
    f.sessions.publish({ ...next, byId: { ...next.byId, native: { ...next.byId.native!, retainedBy: { mainView: 1 } } } })
    f.render()
    expect(f.layout.selectPanel).not.toHaveBeenCalled()
  })
  it('lets Studio replace the previous roleplay foreground while its Session is loading', () => {
    const f = fixture(platform), list = f.sessions.getSnapshot()
    f.sessions.publish({ ...list, byId: { ...list.byId, role: { ...list.byId.role!, retainedBy: { mainView: 1 } } } })
    f.layout.panelInfo.publish({ activePanelId: 'creatorStudio' })
    f.render()
    expect(f.layout.selectPanel).not.toHaveBeenCalled()
  })
})
