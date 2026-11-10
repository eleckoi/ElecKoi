import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dshClientPlugin } from '../../../../../../tests/helpers/dshClientPlugin'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'

const source = readFileSync(new URL('../../src/client.js', import.meta.url), 'utf8')
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

it('bridges the official view roster, header, plugin children and composer without copying their state', async () => {
  let registration: any
  runInNewContext(source, { window: { __ModuleLoader__: { load(value: unknown) { registration = value } } } })
  const effects: Array<() => () => void> = [], cleanups: Array<() => void> = []
  const React = { lazy: () => () => null, createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }), useLayoutEffect: (effect: () => () => void) => effects.push(effect) }
  const slots: any = new SlotCore()
  slots.inject = (name: string, install: () => () => void) => {
    let dispose: (() => void) | undefined
    const sync = () => { dispose?.(); dispose = slots.spec(name) ? install() : undefined }
    const stop = slots.subscribeDeclaration(name, sync); sync()
    cleanups.push(() => { stop(); dispose?.() })
  }
  const root = slots.register({ name: 'root', children: {
    'eleckoi.creator-studio.conversation': { kind: 'single', scope: 'root' },
    'conversation.session': { kind: 'single', scope: 'session' },
    'conversation.session.header': { kind: 'single', scope: 'session' },
    'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
  } }, () => null)
  const release = vi.fn(), retain = vi.fn(() => ({ release }))
  registration.factory(() => React).apply({ remote: {}, sessions: { retain }, get: () => ({ openSession: retain }), slots, provide() {}, effect() {} })
  const store = () => null, inject = () => ({ hooks: {} })
  const register = (options: any, component: any = () => null) => { const dispose = slots.register(options, component); cleanups.push(dispose); return dispose }
  register({ name: 'conversation.session', store, inject, children: { 'conversation.view': { kind: 'list', scope: 'session' } } })
  register({ name: 'conversation.session.header', store, inject, children: { 'conversation.session.header.corner': { kind: 'single', scope: 'session' } } })
  register({ name: 'conversation.composer.bar', children: { 'conversation.input.right': { kind: 'list', scope: 'session' }, 'conversation.input.model': { kind: 'single', scope: 'session' } } })
  register({ name: 'conversation.input.model', children: { 'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true } } })
  const ModelLabel = () => null
  const releaseLabel = register({ name: 'conversation.input.model.label', locale: 'model-label' }, ModelLabel)
  await settle()
  const label = slots.entriesOfSlot('eleckoi.creator-studio.model.label')[0]
  expect(label.locale).toBe('model-label')
  expect(label.component({ model: { id: 'example', name: 'Example' } }).type).toBe(ModelLabel)
  releaseLabel()
  await settle()
  expect(slots.entriesOfSlot('eleckoi.creator-studio.model.label')).toHaveLength(0)
  const Sidebar = () => null, Control = () => null
  register({ name: 'conversation.session.header.corner', store, inject }, Sidebar)
  register({ name: 'conversation.input.right', id: 'synthetic-image-provider' }, Control)
  const removeView = register({ name: 'conversation.view', id: 'synthetic-gallery', label: '画廊', store, inject,
    children: { 'synthetic-gallery.actions': { kind: 'list', scope: 'session' } } })
  const removeAction = register({ name: 'synthetic-gallery.actions', id: 'synthetic-action' }, Control)
  await settle()
  const entry = (name: string) => slots.entriesOfSlot(name)[0]
  expect(entry('eleckoi.creator-studio.view')).toMatchObject({ store, inject })
  expect(entry('eleckoi.creator-studio.session.header.corner')).toMatchObject({ store, inject })
  expect(entry('eleckoi.creator-studio.input.right').options.id).toBe('synthetic-image-provider')
  expect(entry('eleckoi.creator-studio.synthetic-gallery.actions').options.id).toBe('synthetic-action')
  const renderNativeTool = vi.fn((name, owner) => ({ name, owner }))
  const projectedView = entry('eleckoi.creator-studio.view').component({ renderSlot: renderNativeTool })
  for (const toolName of ['eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability']) {
    const owner = { toolName, callId: `synthetic-${toolName}`, phase: 'result', inspect: vi.fn(), useDisclosure: vi.fn() }
    const rendered = projectedView.props.renderSlot('tool.call.toolview', owner, { entryKey: toolName })
    expect(rendered.children[0].props).toMatchObject(owner)
    expect(rendered.children[0].props.renderNative()).toEqual({ name: 'eleckoi.creator-studio.tool.call.toolview', owner })
    expect(rendered.children[0].props.inspect).toBe(owner.inspect)
  }
  expect(projectedView.props.renderSlot('tool.call.toolview', { toolName: 'read_file' })).toEqual({
    name: 'eleckoi.creator-studio.tool.call.toolview', owner: { toolName: 'read_file' },
  })
  const Product = () => null, native = { useConversationViews: () => [], renderSlot: (name: string, owner: unknown) => ({ name, owner }) }
  const session = entry('eleckoi.creator-studio.session').component({ component: Product, props: {}, ...native })
  const headerOwner = session.type(session.props).owner
  const selectView = vi.fn(), renderHeaderSlot = vi.fn()
  const header = entry('eleckoi.creator-studio.session.header').component({ ...headerOwner, selectView, renderSlot: renderHeaderSlot })
  const product = header.type(header.props)
  expect(product.props.useConversationViews).toBe(native.useConversationViews)
  product.props.selectView('synthetic-gallery'); expect(selectView).toHaveBeenCalledWith('synthetic-gallery')
  product.props.renderHeaderSlot('eleckoi.creator-studio.session.header.corner', {}); expect(renderHeaderSlot).toHaveBeenCalled()
  const conversation = entry('eleckoi.creator-studio.conversation')
  conversation.component({ reference: { sessionId: 'synthetic-visible-studio' }, SessionProvider: 'Provider', renderSlot: () => null })
  const unmount = effects[0]!()
  expect(retain).toHaveBeenCalledWith('synthetic-visible-studio')
  expect(unmount).toBeUndefined(); expect(release).not.toHaveBeenCalled()
  removeView(); removeAction(); await settle()
  expect(slots.entriesOfSlot('eleckoi.creator-studio.view')).toHaveLength(0)
  expect(slots.spec('eleckoi.creator-studio.synthetic-gallery.actions')).toBeUndefined()
  for (const dispose of cleanups.reverse()) dispose()
  root()
})

function observable<T>(value: T) {
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    set(next: T) { value = next; for (const listener of listeners) listener() }, listeners }
}
function studioSessions(items: Array<{ sessionId: string; title: string; pinned: boolean }>, workspaceItems: any[] = []) {
  let registration: any
  const services = new Map<string, any>()
  const releases: string[] = []
  const reloadHistory = vi.fn(async (_id: string) => {})
  const active = (sessionId: string) => ({ sessionId, presetId: 'synthetic-creator-preset', characterId: '' })
  const remote = {
    list: vi.fn(async () => ({ ok: true, value: items.map(item => ({ ...active(item.sessionId), ...item })) })),
    open: vi.fn(async (id: string) => ({ ok: true, value: active(id) })),
    create: vi.fn(async () => ({ ok: true, value: active('synthetic-new-session') })),
    delete: vi.fn(async (_id: string) => ({ ok: true, value: undefined })),
    regenerate: vi.fn(async (_id: string) => ({ ok: true, value: undefined })),
    deleteMessagesFrom: vi.fn(async (_id: string, _seq: number, _role: string) => ({ ok: true, value: undefined })),
  }
  const selectModel = vi.fn(async (selection: { sessionId: string; provider: string; model: string }) => ({ ok: true, value: { selected: selection } }))
  const draft = vi.fn(() => 'accepted')
  const inputState = { draft: '', attachmentIds: [] as string[] }
  const sessionState = observable({ running: false })
  const faces = new Map(['sessionStats', 'tokenUsage', 'contextPressure', 'contextBreakdown'].map(key => [key, observable<any>(undefined)]))
  const session = { ...sessionState, projections: { faceOf: (key: string) => faces.get(key)! } }
  const readProjections = vi.fn(async () => ({ ok: true, value: { kind: 'sequenced', values: Object.fromEntries([...faces].map(([key, face]) => [key, face.getSnapshot()])) } }))
  const list = { ids: items.map(item => item.sessionId), byId: Object.fromEntries(items.map(item => [item.sessionId, { ...item, blank: true, updatedAt: 1 }])) }
  runInNewContext(source, { AbortController, AbortSignal, window: { __ModuleLoader__: { load(value: unknown) { registration = value } } } })
  dshClientPlugin(registration).apply({
    remote: { eleckoiCreatorStudioSessions: remote, session: { selectModel, projections: readProjections } },
    sessions: { list: { getSnapshot: () => list }, binding: (sessionId: string) => ({ sessionId }), scope: () => ({}), refresh: async () => {}, reloadHistory, retain: (id: string) => ({ binding: { sessionId: id, session }, ready: Promise.resolve(), release: () => releases.push(id) }) },
    workspaces: { list: { getSnapshot: () => ({ items: workspaceItems }) }, initializeDefault: async () => undefined },
    get: () => ({ input: { requestDraftInitialization: draft, for: () => ({ state: { getSnapshot: () => inputState } }) } }),
    provide: (name: string, value: unknown) => services.set(name, value),
    effect: () => {},
  })
  return { model: services.get('eleckoiCreatorStudio').sessions, remote, releases, reloadHistory, selectModel, draft, inputState, faces, readProjections,
    setRunning: (running: boolean) => sessionState.set({ running }), updateStats: (values: Record<string, unknown>) => { for (const [key, value] of Object.entries(values)) faces.get(key)!.set(value) } }
}

describe('Studio Session binding and restoration', () => {
  it('keeps the complete Remote failure in the failed session snapshot', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-session', title: '合成对话', pinned: false }])
    const failure = { isDSHRemoteError: true, code: 'gateway/service-unavailable',
      message: 'active Service "synthetic-studio" is unavailable', details: { endpoint: 'creatorStudio.open' } }
    f.remote.open.mockRejectedValueOnce(failure)
    await expect(f.model.open('synthetic-session')).rejects.toBe(failure)
    expect(f.model.getSnapshot().error).toBe(failure)
    expect(f.model.getSnapshot().status).toBe('error')
  })

  it('retains confirmed statistics across rewind and streaming, then hands off to the new settled step', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-session', title: '合成对话', pinned: false }])
    const previous = { sessionStats: { turns: 1, steps: 1 }, tokenUsage: { outputTokens: 120 }, contextPressure: { pressureTokens: 300, contextWindow: 1000 }, contextBreakdown: { messageTokens: 300 } }
    f.updateStats(previous)
    await f.model.open('synthetic-session')
    f.remote.regenerate.mockImplementationOnce(async () => {
      f.updateStats({ sessionStats: { turns: 0, steps: 0 }, tokenUsage: { outputTokens: 0 }, contextPressure: {}, contextBreakdown: {} })
      f.setRunning(true)
      return { ok: true, value: undefined }
    })
    await f.model.regenerate()
    expect(f.model.getSnapshot().retainedStats).toEqual({ sessionId: 'synthetic-session', values: previous })
    f.updateStats({ contextPressure: { pressureTokens: 500, contextWindow: 1000 } })
    expect(f.model.getSnapshot().retainedStats.values).toEqual(previous)
    f.updateStats({ tokenUsage: { outputTokens: 200 }, sessionStats: { turns: 1, steps: 1 } })
    expect(f.model.getSnapshot().retainedStats).toBeNull()
    expect(f.faces.get('sessionStats')!.listeners.size).toBe(0)
  })
  it('waits for the settled projection when the stopped status arrives first', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-session', title: '合成对话', pinned: false }])
    f.updateStats({ sessionStats: { turns: 1, steps: 1 } })
    await f.model.open('synthetic-session')
    f.remote.regenerate.mockImplementationOnce(async () => {
      f.updateStats({ sessionStats: { turns: 0, steps: 0 } }); f.setRunning(true)
      return { ok: true, value: undefined }
    })
    await f.model.regenerate()
    f.readProjections.mockResolvedValueOnce({ ok: true, value: { kind: 'sequenced', values: { sessionStats: { turns: 1, steps: 1 } } } })
    f.setRunning(false)
    await settle()
    expect(f.model.getSnapshot().retainedStats.values.sessionStats).toEqual({ turns: 1, steps: 1 })
    f.updateStats({ sessionStats: { turns: 1, steps: 1 } })
    expect(f.model.getSnapshot().retainedStats).toBeNull()
  })
  it('reports a failed settlement read with its original error and releases its subscriptions', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-session', title: '合成对话', pinned: false }])
    await f.model.open('synthetic-session')
    f.setRunning(true)
    await f.model.regenerate()
    const failure = new Error('synthetic-projection-failure')
    f.readProjections.mockRejectedValueOnce(failure)
    f.setRunning(false)
    await settle()
    expect(f.model.getSnapshot().error).toBe(failure)
    expect(f.model.getSnapshot().retainedStats).toBeNull()
    expect(f.faces.get('sessionStats')!.listeners.size).toBe(0)
    await f.model.regenerate()
    expect(f.model.getSnapshot().error).toBe('')
  })
  it.each(['failure', 'stop', 'switch', 'dispose'])('releases held statistics on %s without carrying them into another conversation', async mode => {
    const f = studioSessions([{ sessionId: 'synthetic-session', title: '合成对话', pinned: false }])
    f.updateStats({ sessionStats: { turns: 2, steps: 3 } })
    await f.model.open('synthetic-session')
    f.setRunning(true)
    if (mode === 'failure') f.remote.regenerate.mockRejectedValueOnce(new Error('synthetic-failure'))
    if (mode === 'failure') await expect(f.model.regenerate()).rejects.toThrow('synthetic-failure')
    else await f.model.regenerate()
    if (mode === 'stop') f.setRunning(false)
    if (mode === 'switch') await f.model.open('synthetic-other-session')
    if (mode === 'dispose') f.model.dispose()
    await settle()
    expect(f.model.getSnapshot().retainedStats).toBeNull()
    expect(f.faces.get('sessionStats')!.listeners.size).toBe(0)
  })
  it('keeps the active reference when deletion fails and releases it only after successful deletion', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-current', title: 'Synthetic creation', pinned: false }])
    await f.model.open('synthetic-current')
    f.remote.delete.mockRejectedValueOnce(new Error('Synthetic cleanup blocked'))
    await expect(f.model.delete('synthetic-current')).rejects.toThrow('Synthetic cleanup blocked')
    expect(f.model.getSnapshot().active?.sessionId).toBe('synthetic-current')
    expect(f.releases).toEqual([])
    f.remote.list.mockResolvedValueOnce({ ok: true, value: [] })
    await f.model.delete('synthetic-current')
    expect(f.model.getSnapshot().active).toBeNull()
    expect(f.releases).toEqual(['synthetic-current'])
  })
  it('creates in the explicitly chosen workspace and otherwise inherits the active workspace', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-current', title: 'Synthetic creation', pinned: false }], [
      { workspaceId: 'synthetic-a', sessionIds: ['synthetic-current'], createdAt: '2026-01-01' },
      { workspaceId: 'synthetic-b', sessionIds: [], createdAt: '2026-01-02' },
    ])
    await f.model.open('synthetic-current')
    await f.model.create('synthetic-character')
    expect(f.remote.create).toHaveBeenLastCalledWith('synthetic-character', 'synthetic-a')
    await f.model.create('', 'synthetic-b')
    expect(f.remote.create).toHaveBeenLastCalledWith('', 'synthetic-b')
  })
  it('prepares plugin text through the official draft API without creating or submitting another blank', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-current', title: 'Synthetic creation', pinned: false }])
    await f.model.open('synthetic-current')
    await f.model.startWorkspace(undefined, { prompt: 'Synthetic plugin task', whenDraftExists: 'append' })
    expect(f.remote.create).not.toHaveBeenCalled()
    expect(f.draft).toHaveBeenCalledWith({ sessionId: 'synthetic-current' }, { prompt: 'Synthetic plugin task', whenDraftExists: 'append' })
  })
  it('reuses the current blank in its workspace when New Session is requested again', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-current', title: 'Synthetic creation', pinned: false }], [
      { workspaceId: 'synthetic-workspace', sessionIds: ['synthetic-current'], createdAt: '2026-01-01' },
    ])
    await f.model.open('synthetic-current')
    await f.model.create()
    expect(f.remote.create).not.toHaveBeenCalled()
    expect(f.model.getSnapshot().active.sessionId).toBe('synthetic-current')
  })
  it('retains a blank draft owner while changing workspace and releases it after restoring or disposing', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-current', title: 'Synthetic creation', pinned: false }], [
      { workspaceId: 'synthetic-a', sessionIds: ['synthetic-current'], createdAt: '2026-01-01' },
      { workspaceId: 'synthetic-b', sessionIds: [], createdAt: '2026-01-02' },
    ])
    await f.model.open('synthetic-current')
    f.inputState.draft = 'Synthetic draft'
    f.inputState.attachmentIds = ['synthetic-file']
    await f.model.startWorkspace('synthetic-b')
    expect(f.releases).not.toContain('synthetic-current')
    expect(f.inputState.attachmentIds).toEqual(['synthetic-file'])
    await f.model.startWorkspace('synthetic-a')
    expect(f.model.getSnapshot().active.sessionId).toBe('synthetic-current')
    expect(f.releases.filter(id => id === 'synthetic-current')).toHaveLength(1)
    f.model.dispose()
    expect(f.releases.filter(id => id === 'synthetic-current')).toHaveLength(2)
  })
  it('refreshes the exact active Session target after a creation tool and ignores a late previous binding', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-studio-a', title: '合成工作室甲', pinned: false }])
    await f.model.open('synthetic-studio-a')
    const reference = f.model.getSnapshot().reference
    const item = { sessionId: 'synthetic-studio-a', title: '合成工作室甲', pinned: false,
      presetId: 'synthetic-creator-preset', characterId: 'synthetic-new-character' }
    f.remote.list.mockResolvedValueOnce({ ok: true, value: [item] })
    await f.model.refresh()
    expect(f.model.getSnapshot().active.characterId).toBe('synthetic-new-character')
    expect(f.model.getSnapshot().reference).toBe(reference)
    let finish!: () => void
    f.remote.list.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ ok: true, value: [item] }) }))
    const pending = f.model.refresh()
    await f.model.open('synthetic-studio-b')
    finish(); await pending
    expect(f.model.getSnapshot().active).toEqual({ sessionId: 'synthetic-studio-b', presetId: 'synthetic-creator-preset', characterId: '' })
  })
  it('sends a model selection only to the explicitly opened Studio Session', async () => {
    const f = studioSessions([])
    await expect(f.model.selectModel({ provider: 'synthetic-provider', model: 'synthetic-model' })).rejects.toThrow('尚未打开')
    expect(f.selectModel).not.toHaveBeenCalled()
    await f.model.open('synthetic-studio-model-session')
    await f.model.selectModel({ provider: 'synthetic-provider', model: 'synthetic-model' })
    expect(f.selectModel).toHaveBeenCalledWith({ sessionId: 'synthetic-studio-model-session', provider: 'synthetic-provider', model: 'synthetic-model' })
    f.model.release()
    await expect(f.model.selectModel({ provider: 'synthetic-provider', model: 'synthetic-model' })).rejects.toThrow('尚未打开')
    expect(f.selectModel).toHaveBeenCalledOnce()
  })
  it('reopens the activity-ordered latest conversation, independently of sidebar pins', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-recent', title: '最近对话', pinned: false }, { sessionId: 'synthetic-pinned', title: '置顶对话', pinned: true }])
    await f.model.restoreRecent()
    expect(f.remote.open).toHaveBeenCalledWith('synthetic-recent')
    expect(f.remote.create).not.toHaveBeenCalled()
    f.model.release()
    await f.model.restoreRecent()
    expect(f.remote.open).toHaveBeenCalledTimes(2)
    expect(f.model.getSnapshot().active.sessionId).toBe('synthetic-recent')
  })
  it('creates only when the successful Studio catalog is empty', async () => {
    const f = studioSessions([])
    await f.model.restoreRecent()
    expect(f.remote.create).toHaveBeenCalledOnce()
    const failed = studioSessions([])
    failed.remote.list.mockRejectedValueOnce(new Error('synthetic-list-failure'))
    await expect(failed.model.restoreRecent()).rejects.toThrow('synthetic-list-failure')
    expect(failed.remote.create).not.toHaveBeenCalled()
  })
  it('reloads the retained Session after a rewrite or rollback without releasing the visible conversation', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-session', title: '合成对话', pinned: false }])
    await f.model.open('synthetic-session')
    await f.model.regenerate()
    expect(f.remote.regenerate).toHaveBeenCalledWith('synthetic-session')
    expect(f.releases).toEqual([])
    expect(f.reloadHistory).toHaveBeenCalledWith('synthetic-session')
    f.remote.deleteMessagesFrom.mockRejectedValueOnce(new Error('synthetic-delete-failure'))
    await expect(f.model.deleteMessagesFrom(17, 'assistant')).rejects.toThrow('synthetic-delete-failure')
    expect(f.remote.deleteMessagesFrom).toHaveBeenCalledWith('synthetic-session', 17, 'assistant')
    expect(f.model.getSnapshot().active.sessionId).toBe('synthetic-session')
    expect(f.model.getSnapshot().reference).not.toBeNull()
    expect(f.reloadHistory).toHaveBeenCalledTimes(2)
    expect(f.remote.open).toHaveBeenCalledTimes(1)
  })
  it('keeps the visible Session while the Host rewinds and restores it', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-session', title: '合成对话', pinned: false }])
    await f.model.open('synthetic-session')
    const reference = f.model.getSnapshot().reference
    let complete!: () => void
    f.remote.regenerate.mockImplementationOnce(() => new Promise(resolve => { complete = () => resolve({ ok: true, value: undefined }) }))
    const pending = f.model.regenerate()
    await settle()
    expect(f.model.getSnapshot().reference).toBe(reference)
    expect(f.model.getSnapshot().active.sessionId).toBe('synthetic-session')
    expect(f.releases).toEqual([])
    expect(f.model.getSnapshot().editingSessionId).toBe('synthetic-session')
    await expect(f.model.regenerate()).rejects.toThrow('等待')
    complete(); await pending
    expect(f.model.getSnapshot().reference).toBe(reference)
    expect(f.reloadHistory).toHaveBeenCalledWith('synthetic-session')
    expect(f.releases).toEqual([])
    expect(f.model.getSnapshot().active.sessionId).toBe('synthetic-session')
    expect(f.model.getSnapshot().editingSessionId).toBe('')
  })
  it('keeps both failures and unlocks the resident conversation when rollback reload also fails', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-session', title: '合成对话', pinned: false }])
    await f.model.open('synthetic-session')
    const reference = f.model.getSnapshot().reference
    const mutationFailure = new Error('synthetic-rewind-failure'), reloadFailure = new Error('synthetic-reload-failure')
    f.remote.regenerate.mockRejectedValueOnce(mutationFailure)
    f.reloadHistory.mockRejectedValueOnce(reloadFailure)
    const failure = await f.model.regenerate().catch((error: AggregateError) => error)
    expect(failure.errors).toEqual([mutationFailure, reloadFailure])
    expect(f.model.getSnapshot().reference).toBe(reference)
    expect(f.model.getSnapshot().editingSessionId).toBe('')
    await f.model.regenerate()
    expect(f.reloadHistory).toHaveBeenCalledTimes(2)
    expect(f.releases).toEqual([])
  })
})

function projectChanges() {
  const queue: Array<{ kind: 'snapshot' } | { kind: 'records'; domain: 'creatorProjects' }> = [{ kind: 'snapshot' }]
  let wake: (() => void) | undefined
  let stopped = false
  return {
    open(signal?: AbortSignal): AsyncIterable<(typeof queue)[number]> {
      const stop = () => { stopped = true; wake?.(); wake = undefined }
      if (signal?.aborted) stop()
      else signal?.addEventListener('abort', stop, { once: true })
      return (async function* () {
        try {
          while (!stopped) {
            if (queue.length) yield queue.shift()!
            else await new Promise<void>(resolve => { wake = resolve })
          }
        } finally {
          signal?.removeEventListener('abort', stop)
          stop()
        }
      })()
    },
    emit() { queue.push({ kind: 'records', domain: 'creatorProjects' }); wake?.(); wake = undefined },
    isStopped: () => stopped
  }
}

describe('DSH ElecKoi creator studio projects', () => {
  it('lists, mutates and reconnects through generated Remote methods', async () => {
    const list = vi.fn(async () => ({ ok: true, value: collection('project-1') }))
    const create = vi.fn(async () => ({ ok: true, value: collection('project-2') }))
    const remove = vi.fn(async () => ({ ok: true, value: { items: [] } }))
    const pick = vi.fn(async (_signal: AbortSignal) => ({ ok: true, value: 'C:\\Projects' as string | null }))
    let resetListener: (() => void) | undefined
    let cleanup = () => {}
    let registration: { factory(): { apply(ctx: unknown): void } } | undefined
    const services = new Map<string, any>()
    const changeFeed = projectChanges()

    runInNewContext(source, {
      AbortController, AbortSignal,
      window: {
        __ModuleLoader__: { load(value: typeof registration) { registration = value } }
      }
    })
    dshClientPlugin(registration!).apply({
      remote: {
        eleckoiCreatorStudio: {
          list,
          create,
          delete: remove,
          changes: (signal?: AbortSignal) => changeFeed.open(signal)
        },
        directoryPicker: { pick }
      },
      provide(name: string, value: unknown) { services.set(name, value) },
      effect(run: () => () => void) { cleanup = run() },
      on(name: string, listener: () => void) {
        expect(name).toBe('connection/reset')
        resetListener = listener
        return () => { resetListener = undefined }
      }
    })

    const projects = services.get('eleckoiCreatorStudio')
    await settle()
    expect(projects.getSnapshot()).toMatchObject({
      status: 'ready', collection: { items: [{ id: 'project-1' }] }
    })
    expect(list).toHaveBeenCalledTimes(2)
    await expect(projects.create({ name: '项目', mode: 'blank', parentDirectory: 'C:\\Projects' }))
      .resolves.toMatchObject({ items: [{ id: 'project-2' }] })
    expect(projects.getSnapshot().collection.items[0].id).toBe('project-2')
    await expect(projects.delete('project-2')).resolves.toEqual({ items: [] })
    expect(projects.getSnapshot().collection.items).toEqual([])

    await expect(projects.selectDirectory()).resolves.toBe('C:\\Projects')
    pick.mockResolvedValueOnce({ ok: true, value: null })
    await expect(projects.selectDirectory()).resolves.toBeNull()
    const canceled = new AbortController()
    canceled.abort()
    await expect(projects.selectDirectory(canceled.signal)).rejects.toThrow()
    expect(pick).toHaveBeenCalledTimes(2)

    resetListener?.()
    await settle()
    expect(list).toHaveBeenCalledTimes(3)
    changeFeed.emit()
    await settle()
    expect(list).toHaveBeenCalledTimes(4)
    let pendingSignal: AbortSignal | undefined
    pick.mockImplementationOnce(async signal => {
      pendingSignal = signal
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    })
    const pending = projects.selectDirectory()
    cleanup()
    await expect(pending).rejects.toThrow()
    expect(pendingSignal?.aborted).toBe(true)
    expect(resetListener).toBeUndefined()
    expect(changeFeed.isStopped()).toBe(true)
  })
})

function collection(id: string) {
  return {
    items: [{
      id,
      name: '测试项目',
      mode: 'blank',
      rootPath: `C:\\Projects\\${id}`,
      sourceCharacterId: '',
      coverImage: '',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z'
    }]
  }
}
