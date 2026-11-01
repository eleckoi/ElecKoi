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
  const React = { createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }), useLayoutEffect: (effect: () => () => void) => effects.push(effect) }
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
  registration.factory(() => React).apply({ remote: {}, sessions: { retain }, slots, provide() {}, effect() {} })
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
  expect(retain).toHaveBeenCalledWith('synthetic-visible-studio', { source: 'mainView' })
  unmount(); expect(release).toHaveBeenCalledOnce()
  removeView(); removeAction(); await settle()
  expect(slots.entriesOfSlot('eleckoi.creator-studio.view')).toHaveLength(0)
  expect(slots.spec('eleckoi.creator-studio.synthetic-gallery.actions')).toBeUndefined()
  for (const dispose of cleanups.reverse()) dispose()
  root()
})

function studioSessions(items: Array<{ sessionId: string; title: string; pinned: boolean }>) {
  let registration: any
  const services = new Map<string, any>()
  const releases: string[] = []
  const active = (sessionId: string) => ({ sessionId, presetId: 'synthetic-creator-preset', characterId: '' })
  const remote = {
    list: vi.fn(async () => ({ ok: true, value: items.map(item => ({ ...active(item.sessionId), ...item })) })),
    open: vi.fn(async (id: string) => ({ ok: true, value: active(id) })),
    create: vi.fn(async () => ({ ok: true, value: active('synthetic-new-session') })),
    regenerate: vi.fn(async (_id: string) => ({ ok: true, value: undefined })),
    deleteMessagesFrom: vi.fn(async (_id: string, _seq: number, _role: string) => ({ ok: true, value: undefined })),
  }
  const selectModel = vi.fn(async (selection: { sessionId: string; provider: string; model: string }) => ({ ok: true, value: { selected: selection } }))
  runInNewContext(source, { AbortController, AbortSignal, window: { __ModuleLoader__: { load(value: unknown) { registration = value } } } })
  dshClientPlugin(registration).apply({
    remote: { eleckoiCreatorStudioSessions: remote, session: { selectModel } },
    sessions: { refresh: async () => {}, retain: (id: string) => ({ ready: Promise.resolve(), release: () => releases.push(id) }) },
    provide: (name: string, value: unknown) => services.set(name, value),
    effect: () => {},
  })
  return { model: services.get('eleckoiCreatorStudio').sessions, remote, releases, selectModel }
}

describe('Studio Session binding and restoration', () => {
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
  it('releases and reacquires the same Session after regeneration, including failure', async () => {
    const f = studioSessions([{ sessionId: 'synthetic-session', title: '合成对话', pinned: false }])
    await f.model.open('synthetic-session')
    await f.model.regenerate()
    expect(f.remote.regenerate).toHaveBeenCalledWith('synthetic-session')
    expect(f.releases).toEqual(['synthetic-session'])
    f.remote.deleteMessagesFrom.mockRejectedValueOnce(new Error('synthetic-delete-failure'))
    await expect(f.model.deleteMessagesFrom(17, 'assistant')).rejects.toThrow('synthetic-delete-failure')
    expect(f.remote.deleteMessagesFrom).toHaveBeenCalledWith('synthetic-session', 17, 'assistant')
    expect(f.model.getSnapshot().active.sessionId).toBe('synthetic-session')
    expect(f.model.getSnapshot().reference).not.toBeNull()
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
    expect(f.model.getSnapshot().reference).not.toBe(reference)
    expect(f.model.getSnapshot().active.sessionId).toBe('synthetic-session')
    expect(f.model.getSnapshot().editingSessionId).toBe('')
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
