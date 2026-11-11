// @ts-expect-error The browser test runtime does not publish declarations.
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteStream, RemoteStreamCarrierError } from '@deepseek-ai/dsh-api-gateway/client'
import { AUTHOR_EVENT_NAMES, type AuthorScriptProgram, type ElecKoiAuthorApi } from '@eleckoi/author-sdk'
import { NativeAuthorClient } from '@eleckoi/dsh-client-author/runtime'
import { creatorToolsets } from '../../../../../host/product-data/src/domain/creatorStudio/guides'
import type { NativeAuthorScript, NativeAuthorScriptCatalog, NativeAuthorRuleTask } from '@eleckoi/dsh-product-api/types'
import { NativeAudioElement } from '../../../../../../tests/helpers/nativeAudioElement'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })

class Feed<T> implements AsyncIterable<T> {
  readonly sent: unknown[] = []
  readonly send = vi.fn(async (value: unknown) => { this.sent.push(value) })
  readonly dispose = vi.fn(async () => { this.closed = true; this.wake?.() })
  private readonly queue: T[] = []
  private wake: (() => void) | undefined
  private closed = false
  private failure: unknown
  constructor(signal?: AbortSignal) { signal?.addEventListener('abort', () => { void this.dispose() }, { once: true }) }
  push(value: T) { this.queue.push(value); this.wake?.(); this.wake = undefined }
  fail(error: unknown) { this.failure = error; this.wake?.(); this.wake = undefined }
  async *[Symbol.asyncIterator]() {
    while (!this.closed) {
      if (this.failure) throw this.failure
      if (this.queue.length) yield this.queue.shift()!
      else await new Promise<void>(resolve => { this.wake = resolve })
    }
  }
}

function script(scope: NativeAuthorScript['scope'] = 'character'): NativeAuthorScript {
  const ownerId = scope === 'global' ? '' : `synthetic-${scope}`
  return { key: JSON.stringify([scope, ownerId, 'synthetic-script']), id: 'synthetic-script', scope, ownerId,
    name: 'Synthetic script', source: 'export default () => {}', buttonsVisible: true,
    entryUrl: '/eleckoi/scripts/global/_/synthetic-version/scripts/entry.js', settings: {}, librarySettings: {} }
}

const persona = (image_prompt: string) => ({ assistant_name: 'Synthetic character', assistant_avatar: '',
  assistant_square: '', assistant_cover: '', image_prompt })

function harness(programs: AuthorScriptProgram[] = [], scripts = programs.map(() => script())) {
  const page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
  const frames: any[] = [], audio: NativeAudioElement[] = [], detailsListeners = new Set<() => void>(), libraryListeners = new Set<() => void>()
  const tasks: Feed<NativeAuthorRuleTask>[] = [], changes = new Feed<any>()
  let catalog: NativeAuthorScriptCatalog = { conversationId: 'synthetic-chat', characterId: 'synthetic-character',
    presetId: 'synthetic-preset', version: 'synthetic-version-1', scripts }
  let selected: any = { id: 'synthetic-chat', status: 'ready', error: '', details: {
    runtimeSessionId: 'synthetic-session', metadata: { characterId: 'synthetic-character', characterName: 'Synthetic character',
      characterAvatar: '', characterPersona: persona('Synthetic existing persona') },
    conversation: { id: 'synthetic-chat', title: 'Synthetic chat', preview: 'Synthetic preview',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }, messages: [{ id: 'opening',
      selectedOpeningId: 'synthetic-opening-a', openingOptions: [
        { id: 'synthetic-opening-a', title: 'Synthetic opening A', content: 'Synthetic start', initialVariableStateJson: '{"value":1}' },
        { id: 'synthetic-opening-b', title: 'Synthetic opening B', content: 'Another start', initialVariableStateJson: '{"value":2}' },
      ] }],
  } }
  let stream: any = { id: 'synthetic-chat', status: 'idle', requestId: '', runId: '', messageId: '', content: '', sequence: 0 }
  let stats: any = { id: 'synthetic-chat', stats: null }
  let acknowledge = true
  const conversations = {
    subscribeGeneration: vi.fn(() => () => {}),
    subscribeStream: vi.fn(() => () => {}),
    subscribeStats: vi.fn(() => () => {}),
    getDetailsSnapshot: () => selected,
    subscribeDetails: (listener: () => void) => { detailsListeners.add(listener); return () => detailsListeners.delete(listener) },
    getStreamSnapshot: () => stream,
    getStatsSnapshot: () => stats,
    refresh: vi.fn(async () => [{ ...selected.details.conversation, metadata: selected.details.metadata }]),
    create: vi.fn(async (input: any) => ({ ...selected.details,
      conversation: { ...selected.details.conversation, id: 'synthetic-created-chat', title: input.title ?? 'Synthetic new chat' },
      metadata: input.metadata })),
    open: vi.fn(async (id: string) => {
      const details = { ...selected.details, conversation: { ...selected.details.conversation, id, title: 'Synthetic loaded title' } }
      selected = { ...selected, id, status: 'ready', details }; catalog = { ...catalog, conversationId: id }
      for (const listener of detailsListeners) listener()
      return details
    }),
    delete: vi.fn(async (id: string) => {
      if (selected.id !== id) return
      selected = { id: '', status: 'idle', details: null }
      for (const listener of detailsListeners) listener()
    }),
    readModelSelection: vi.fn(async () => ({ provider: 'synthetic-config', model: 'synthetic-model' })),
    selectModel: vi.fn(async (_id: string, selection: any) => selection),
    selectOpening: vi.fn(async () => selected.details),
    send: vi.fn(async (input: any) => {
      stream = { id: input.conversationId, status: 'idle', runId: 'synthetic-session', requestId: '', messageId: 'synthetic-reply' }
      return { cancelled: false, details: { ...selected.details, messages: [
        { id: 'synthetic-input', role: 'user', requestId: input.requestId, dshTurn: 3 },
        { id: 'synthetic-reply', role: 'assistant', dshTurn: 3, status: 'complete' },
      ] } }
    }),
    cancelRequest: vi.fn(async () => true),
    cancelGeneration: vi.fn(async () => true),
    readImage: vi.fn(async () => 'blob:synthetic-image'),
    pageOlder: vi.fn(async () => null as any),
    updateOpening: vi.fn(async (_id: string, content: string) => {
      selected.details = { ...selected.details, messages: selected.details.messages.map((message: any) =>
        message.id === 'opening' ? { ...message, content } : message) }
      return selected.details
    }),
    editMessage: vi.fn(async (_id: string, seq: number, role: string, content: string) => {
      selected.details = { ...selected.details, messages: selected.details.messages.map((message: any) =>
        message.sessionEventSeq === seq && message.role === role ? { ...message, content, displayContent: content } : message) }
      return selected.details
    }),
    deleteMessagesFrom: vi.fn(async () => ({ deletedMessageCount: 6, remainingMessageCount: 4, details: selected.details })),
    regenerate: vi.fn(async () => ({ cancelled: false, details: selected.details })),
  }
  const remote = {
    $stream: <T>(options: ConstructorParameters<typeof RemoteStream<T>>[1]) => new RemoteStream<T>({
      generation: { getSnapshot: () => 'synthetic-generation', subscribe: () => () => {} },
    } as any, options),
    eleckoiCharacterConfiguration: {
      readSettingLibrary: vi.fn(async (_id: string): Promise<any> => ({ ok: true, value: null })),
      replaceSettingLibraryContent: vi.fn(async (_id: string, _library: any, _signal: AbortSignal): Promise<any> => ({ ok: true, value: null })),
    },
    eleckoiCharacters: { list: vi.fn(async (): Promise<any> => ({ ok: true, value: {
      active_character_id: 'synthetic-unrelated-character', groups: [], items: [
        { id: 'synthetic-unrelated-character', name: 'Synthetic character', persona: persona('Synthetic unrelated persona') },
        { id: 'synthetic-character', name: 'Synthetic character', avatar: '', persona: persona('Synthetic current persona') },
      ],
    } })) },
    eleckoiAuthorScripts: {
      read: vi.fn(async () => ({ ok: true, value: structuredClone(catalog) })),
      connect: vi.fn((_id: string, version: string, signal: AbortSignal) => {
        const feed = new Feed<NativeAuthorRuleTask>(signal); tasks.push(feed)
        if (acknowledge) feed.push({ kind: 'ready', version })
        return feed
      }),
    },
    eleckoiAuthorVariables: {
      getState: vi.fn(async () => ({ ok: true, value: '{"value":1}' })),
      getConfig: vi.fn(async () => ({ ok: true, value: null })),
      merge: vi.fn(async (_id: string, _stateJson: string, _signal: AbortSignal) => ({ ok: true, value: '{"value":2}' })),
    },
    eleckoiConversations: { changes: (signal: AbortSignal) => {
      signal.addEventListener('abort', () => { void changes.dispose() }, { once: true }); return changes
    } },
  }
  const models = { refresh: vi.fn(async (): Promise<any[]> => [{ id: 'synthetic-config', name: 'Synthetic model route',
    provider: 'custom', enabled: true, model: 'synthetic-model', api_key: 'synthetic-private-value',
    custom_headers: { Authorization: 'synthetic-private-header' }, credentialRef: 'synthetic-private-reference',
    model_options: [{ id: 'synthetic-model', name: 'Synthetic model', reasoningEfforts: { off: null, precise: 'declared-value' },
      reasoningEffort: 'precise', supportsImageInput: false, inputModalities: ['text'], contextWindowTokens: 12345 }] }]) }
  const report = vi.fn()
  const runtime = new NativeAuthorClient({ window: page.window, remote: remote as any, conversations: conversations as any,
    models: models as any,
    libraries: { subscribeChanges: (listener: () => void) => { libraryListeners.add(listener); return () => libraryListeners.delete(listener) } } as any,
    report,
    createAudio: () => { const element = new NativeAudioElement(); audio.push(element); return element as unknown as HTMLAudioElement },
    createFrame(_window, entryUrl) {
      const frame = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' }), index = frames.length
      frame.entryUrl = entryUrl
      frames.push(frame)
      return { window: frame.window, load: async () => programs[index]!, dispose: () => frame.window.dispatchEvent(new frame.window.Event('pagehide')) }
    },
  })
  cleanups.push(async () => { await runtime.dispose(); for (const frame of frames) frame.window.close(); page.window.close() })
  return { runtime, page, frames, audio, tasks, changes, conversations, remote, models, report, detailsListeners, libraryListeners,
    get catalog() { return catalog }, set catalog(value: NativeAuthorScriptCatalog) { catalog = value },
    get selected() { return selected }, set selected(value: any) { selected = value },
    set acknowledge(value: boolean) { acknowledge = value },
    set stream(value: any) { stream = value },
    set stats(value: any) { stats = value },
    mount(messageId = '') {
      const document = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
      runtime.mountDocument(document.window, selected.id, messageId)
      cleanups.push(async () => document.window.close())
      return document.window.ElecKoi as ElecKoiAuthorApi
    },
    changed() { for (const listener of detailsListeners) listener() },
    edited() { for (const listener of libraryListeners) listener() },
  }
}

function task(id: string, runId: string, stage: 'before' | 'after' | 'afterSchema', value = 1): NativeAuthorRuleTask {
  return { kind: 'process', id, runId, conversationId: 'synthetic-chat', stage, stateJson: JSON.stringify({ value }), beforeJson: '{"value":1}',
    scriptSettings: stage === 'before' ? [{ key: script().key, settings: {}, librarySettings: {} }] : null }
}

function nativeMessage(id: string, role: 'user' | 'assistant', seq: number, overrides = {}) {
  return { id, role, conversationId: 'synthetic-chat', runtimeSessionId: 'synthetic-session',
    content: 'Synthetic text', displayContent: '', status: 'complete', createdAt: '2026-01-01T00:00:00Z',
    sequence: seq, sessionEventSeq: seq, dshTurn: 2, ...overrides }
}

describe('native frontend requests to running scripts', () => {
  const target = { scope: 'character' as const, ownerId: 'synthetic-character', scriptId: 'synthetic-script' }

  it('routes identical names and actions by full identity and carries the exact message caller with isolated data', async () => {
    const scripts = (['global', 'preset', 'character'] as const).map(scope => ({ ...script(scope), name: 'Same name' }))
    const callers: any[] = []
    const r = harness(scripts.map(item => ({ api }) => {
      api.scripts.registerHandler('inspect', ({ caller, data }) => {
        callers.push(caller); (data as any).nested.value++
        return { scope: item.scope, data }
      })
    }), scripts)
    await r.runtime.start()
    const page = r.mount('synthetic-message'), data = { nested: { value: 1 } }
    const listed = await page.scripts.list()
    expect(listed.items).toHaveLength(3)
    expect(listed.items.map(item => item.identity)).toEqual(scripts.map(item => ({ scope: item.scope, ownerId: item.ownerId, scriptId: item.id })))
    expect(listed.items.every(item => item.actions.join() === 'inspect')).toBe(true)
    listed.items[0]!.actions.push('forged')
    expect((await page.scripts.list()).items[0]!.actions).toEqual(['inspect'])
    for (const item of scripts) {
      expect(await page.scripts.request({ scope: item.scope, ownerId: item.ownerId, scriptId: item.id }, 'inspect', data))
        .toEqual({ scope: item.scope, data: { nested: { value: 2 } } })
    }
    expect(data).toEqual({ nested: { value: 1 } })
    expect(callers).toEqual(scripts.map(() => ({ surface: 'message-renderer', conversationId: 'synthetic-chat', messageId: 'synthetic-message', script: null })))
    await expect(page.scripts.request({ ...target, ownerId: 'another-owner' }, 'inspect', null)).rejects.toMatchObject({ code: 'SCRIPT_UNAVAILABLE' })
    await expect(page.scripts.request(target, 'forged', null)).rejects.toMatchObject({ code: 'SCRIPT_ACTION_UNAVAILABLE' })
    expect((await page.app.getCapabilities()).map(item => item.method)).toEqual(expect.arrayContaining(['scripts.list', 'scripts.request']))
    expect(() => page.scripts.registerHandler('forged', () => null)).toThrow('只有运行中的原生脚本')
  })

  it('handles simultaneous requests independently and preserves both explicit errors and empty JSON values', async () => {
    const pending = new Map<string, () => void>()
    const r = harness([({ api }) => {
      api.scripts.registerHandler('echo', async ({ data }) => {
        await new Promise<void>(resolve => pending.set(String(data), resolve)); return data
      })
      api.scripts.registerHandler('fail', () => { throw Object.assign(new Error('Synthetic operation refused'), { code: 'SYNTHETIC_REFUSED' }) })
      api.scripts.registerHandler('throw', () => { throw new Error('Synthetic failure') })
    }])
    await r.runtime.start(); const api = r.mount()
    const first = api.scripts.request(target, 'echo', 'first'), second = api.scripts.request(target, 'echo', false)
    await vi.waitFor(() => expect(pending.size).toBe(2))
    pending.get('false')!(); expect(await second).toBe(false)
    pending.get('first')!(); expect(await first).toBe('first')
    await expect(api.scripts.request(target, 'fail', null)).rejects.toMatchObject({ code: 'SYNTHETIC_REFUSED', message: 'Synthetic operation refused' })
    await expect(api.scripts.request(target, 'throw', null)).rejects.toMatchObject({ code: 'SCRIPT_HANDLER_FAILED', message: 'Synthetic failure' })
    expect(r.runtime.getSnapshot().status).toBe('ready')
  })

  it('rejects unsupported data without executing the handler, and rejects invalid results without silent JSON loss', async () => {
    let invalid: any
    const invoked = vi.fn()
    const r = harness([({ api }) => { api.scripts.registerHandler('check', () => { invoked(); return invalid }) }])
    await r.runtime.start(); const api = r.mount()
    const cycle: any = {}; cycle.self = cycle
    for (const value of [undefined, NaN, Infinity, 1n, new Date(), { missing: undefined }, { fn() {} }, cycle, [, 1]]) {
      await expect(api.scripts.request(target, 'check', value as any)).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    }
    expect(invoked).not.toHaveBeenCalled()
    for (const value of [undefined, NaN, new Date(), { fn() {} }, cycle]) {
      invalid = value
      await expect(api.scripts.request(target, 'check', null)).rejects.toMatchObject({ code: 'INVALID_SCRIPT_RESULT' })
    }
    for (const value of [null, false, 0, '', [], {}]) {
      invalid = value; expect(await api.scripts.request(target, 'check', null)).toEqual(value)
    }
    for (const identity of [{ scriptId: target.scriptId }, { ...target, name: 'Same name' }, { ...target, scope: 'global' }]) {
      await expect(api.scripts.request(identity as any, 'check', null)).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    }
  })

  it('withdraws pending operations immediately and permits a fresh registration under the same action', async () => {
    let stop!: () => void, resume!: () => void, signal!: AbortSignal, escaped!: ElecKoiAuthorApi
    const r = harness([({ api }) => {
      escaped = api
      stop = api.scripts.registerHandler('wait', async context => {
        signal = context.signal
        await new Promise<void>(resolve => { resume = resolve })
        return context.api.input.set('Synthetic late draft') as any
      })
    }])
    const write = vi.fn(); r.runtime.registerChatUi('synthetic-chat', { 'input.set': write })
    await r.runtime.start(); const api = r.mount()
    const rejected = expect(api.scripts.request(target, 'wait', null)).rejects.toMatchObject({ code: 'SCRIPT_ACTION_CLOSED' })
    await vi.waitFor(() => expect(resume).toBeTypeOf('function'))
    stop(); await rejected; expect(signal.aborted).toBe(true)
    escaped.scripts.registerHandler('wait', () => 'new handler')
    expect(await api.scripts.request(target, 'wait', null)).toBe('new handler')
    resume(); await new Promise(resolve => setTimeout(resolve, 0)); expect(write).not.toHaveBeenCalled()
  })

  it('returns complete large JSON payloads without truncating rows or long text', async () => {
    const r = harness([({ api }) => { api.scripts.registerHandler('echo', ({ data }) => data) }])
    await r.runtime.start()
    const data = { rows: Array.from({ length: 10001 }, (_, index) => ({ id: index, text: `Synthetic row ${index}` })),
      text: 'Synthetic long content '.repeat(100001) + 'Synthetic tail' }
    const result = await r.mount('synthetic-message').scripts.request(target, 'echo', data)
    expect(result).toEqual(data)
    expect(result).not.toBe(data)
  })

  it.each(['page-close', 'chat-switch', 'script-edit', 'script-disable', 'runtime-close'] as const)
  ('cancels %s without executing delayed operations through the handler API', async change => {
    let resume!: () => void, signal!: AbortSignal, late: any
    const r = harness([({ api }) => { api.scripts.registerHandler('wait', async context => {
      signal = context.signal
      await new Promise<void>(resolve => { resume = resolve })
      try { await context.api.input.set('Synthetic old draft') } catch (error) { late = error }
      return 'late result'
    }) }, () => {}], [script()])
    const write = vi.fn(); r.runtime.registerChatUi('synthetic-chat', { 'input.set': write })
    await r.runtime.start()
    const document = new JSDOM('<body></body>', { url: 'http://localhost/' }); cleanups.push(async () => document.window.close())
    r.runtime.mountDocument(document.window, 'synthetic-chat', 'synthetic-message')
    const rejected = expect(document.window.ElecKoi.scripts.request(target, 'wait', null)).rejects.toBeTruthy()
    await vi.waitFor(() => expect(resume).toBeTypeOf('function'))
    if (change === 'page-close') document.window.dispatchEvent(new document.window.Event('pagehide'))
    else if (change === 'chat-switch') { r.selected = { id: 'other-chat', status: 'loading', details: null }; r.changed() }
    else if (change === 'runtime-close') await r.runtime.dispose()
    else { r.catalog = { ...r.catalog, version: 'replacement', scripts: change === 'script-disable' ? [] : r.catalog.scripts }; r.edited() }
    await rejected; expect(signal.aborted).toBe(true)
    resume(); await vi.waitFor(() => expect(late).toMatchObject({ code: 'FRAME_CLOSED' }))
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps request APIs outside an in-flight variable candidate and ends them when their handler returns', async () => {
    let releaseRule!: () => void, escaped!: ElecKoiAuthorApi
    const r = harness([({ api }) => {
      api.variables.registerRule({ id: 'pending', stage: 'before', run: async () => {
        await new Promise<void>(resolve => { releaseRule = resolve })
      } })
      api.scripts.registerHandler('update', async context => { escaped = context.api; return await context.api.variables.merge({ value: 9 }) as any })
    }])
    await r.runtime.start(); r.tasks[0]!.push(task('candidate', 'synthetic-run', 'before'))
    await vi.waitFor(() => expect(releaseRule).toBeTypeOf('function'))
    expect(await r.mount().scripts.request(target, 'update', null)).toEqual({ value: 2 })
    expect(r.remote.eleckoiAuthorVariables.merge).toHaveBeenCalledWith('synthetic-chat', '{"value":9}', expect.anything())
    await expect(escaped.input.set('After return')).rejects.toMatchObject({ code: 'SCRIPT_REQUEST_FINISHED' })
    expect(() => escaped.scripts.registerHandler('after-return', () => null)).toThrow('本次脚本操作已经结束')
    expect(() => escaped.events.on('messages.changed', () => {})).toThrow('本次脚本操作已经结束')
    releaseRule()
  })

  it('preserves the real project and script caller identities and refuses calls until startup finishes', async () => {
    let finish!: () => void, source!: ElecKoiAuthorApi
    const r = harness([async ({ api }) => {
      source = api
      api.scripts.registerHandler('caller', ({ caller }) => caller as any)
      await new Promise<void>(resolve => { finish = resolve })
    }])
    const starting = r.runtime.start(); await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    const api = r.mount()
    await expect(api.scripts.request(target, 'caller', null)).rejects.toMatchObject({ code: 'SCRIPTS_NOT_READY' })
    finish(); await starting
    expect(await source.scripts.request(target, 'caller', null)).toMatchObject({ surface: 'script', script: target })
    const page = new JSDOM('<body></body>', { url: 'http://localhost/' }); cleanups.push(async () => page.window.close())
    r.runtime.mountProjectDocument(page.window, { scope: 'application', projectId: 'synthetic-project', entryFile: 'index.html', view: 'main' } as any)
    expect(await page.window.ElecKoi.scripts.request(target, 'caller', null)).toMatchObject({
      surface: 'application-frontend', projectId: 'synthetic-project', entryFile: 'index.html', view: 'main', script: null
    })
  })

  it('rejects duplicate actions during startup and removes every partial registration', async () => {
    const r = harness([({ api }) => {
      api.scripts.registerHandler('same', () => null)
      api.scripts.registerHandler('same', () => null)
    }])
    await r.runtime.start()
    expect(r.runtime.getSnapshot()).toMatchObject({ status: 'error', error: expect.stringContaining('操作名重复') })
    await expect(r.mount().scripts.list()).rejects.toMatchObject({ code: 'SCRIPTS_NOT_READY' })
  })

  it('opens an owned panel through a message request and keeps panel calls bound to the originating script', async () => {
    const panel = { id: 'synthetic-request-panel', title: 'Synthetic request panel',
      html: '<html><head><meta name="eleckoi-author-api" content="0.1.0"></head><body>Panel</body></html>' }
    const r = harness([({ api }) => {
      api.scripts.registerHandler('open', async context => { await context.api.ui.openPanel(panel); return context.caller as any })
      api.scripts.registerHandler('caller', context => context.caller as any)
    }])
    await r.runtime.start(); const api = r.mount('synthetic-message')
    expect(await api.scripts.request(target, 'open', null)).toMatchObject({ surface: 'message-renderer', messageId: 'synthetic-message' })
    const page = new JSDOM('<body></body>', { url: 'http://localhost/' }); cleanups.push(async () => page.window.close())
    r.runtime.mountScriptPanelDocument(page.window, r.runtime.getUiSnapshot().panel!.key)
    expect(await page.window.ElecKoi.scripts.request(target, 'caller', null)).toMatchObject({ surface: 'script-panel', script: target })
  })
})

describe('native script buttons and panels', () => {
  const panel = { id: 'synthetic-settings', title: 'Synthetic settings', html: '<html><head><meta name="eleckoi-author-api" content="0.1.0"></head><body>Settings</body></html>' }

  it('runs equal button IDs in three scopes by exact identity, and never promotes names into identities', async () => {
    const calls: string[] = []
    const scripts = (['global', 'preset', 'character'] as const).map(scope => ({ ...script(scope), name: 'Same display name' }))
    const programs = scripts.map(item => (({ api }) => { api.ui.registerButton({ id: 'same-id', label: 'Same label', onClick: async ({ api }) => {
      calls.push(item.scope); await api.input.set(item.scope)
    } }) }) as AuthorScriptProgram)
    const h = harness(programs, scripts)
    const write = vi.fn((_params: unknown) => ({ text: 'Synthetic draft' })); h.runtime.registerChatUi(h.selected.id, { 'input.set': write })
    await h.runtime.start()
    const buttons = h.runtime.getUiSnapshot().buttons
    expect(buttons).toHaveLength(3); expect(new Set(buttons.map(button => button.key)).size).toBe(3)
    for (const button of [buttons[2]!, buttons[0]!, buttons[1]!]) await h.runtime.invokeButton(button.key)
    expect(calls).toEqual(['character', 'global', 'preset'])
    expect(write.mock.calls.map(call => call[0])).toEqual([{ text: 'character' }, { text: 'global' }, { text: 'preset' }])
    await expect(h.runtime.invokeButton('Same label')).rejects.toMatchObject({ code: 'BUTTON_UNAVAILABLE' })
    expect(() => h.frames[0].window.ElecKoi.ui.registerButton({ id: 'same-id', label: 'Different name', onClick() {} })).toThrow('按钮编号重复')
  })

  it('shows busy state, blocks duplicate clicks, retains author errors and permits retry', async () => {
    let finish!: () => void, attempts = 0
    const h = harness([({ api }) => { api.ui.registerButton({ id: 'synthetic-action', label: 'Synthetic action', async onClick() {
      attempts++; if (attempts === 1) { await new Promise<void>(resolve => { finish = resolve }); throw new Error('Synthetic button failure') }
    } }) }])
    await h.runtime.start(); const key = h.runtime.getUiSnapshot().buttons[0]!.key
    const pending = h.runtime.invokeButton(key), rejected = expect(pending).rejects.toThrow('Synthetic button failure')
    await vi.waitFor(() => expect(attempts).toBe(1)); expect(h.runtime.getUiSnapshot().buttons[0]!.busy).toBe(true)
    await expect(h.runtime.invokeButton(key)).rejects.toMatchObject({ code: 'BUTTON_BUSY' })
    finish(); await rejected
    expect(h.runtime.getUiSnapshot().buttons[0]).toMatchObject({ busy: false, error: 'Synthetic button failure' })
    expect(h.runtime.getSnapshot().status).toBe('ready')
    await h.runtime.invokeButton(key); expect(attempts).toBe(2)
    expect(h.runtime.getUiSnapshot().buttons[0]!.error).toBe('')
  })

  it('binds panel APIs to their script and closes SDKs before replacement or chat switch', async () => {
    const h = harness([({ api }) => { api.ui.registerButton({ id: 'settings', label: 'Settings', onClick: async ({ api }) => { await api.ui.openPanel(panel) } }) }])
    await h.runtime.start()
    const api = h.frames[0].window.ElecKoi as ElecKoiAuthorApi
    await expect(h.mount().ui.openPanel(panel)).rejects.toThrow('只有所属脚本')
    await expect(api.ui.openPanel({ ...panel, html: '<body>Undeclared</body>' })).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' })
    expect(h.runtime.getUiSnapshot().panel).toBeNull()
    await h.runtime.invokeButton(h.runtime.getUiSnapshot().buttons[0]!.key)
    const first = h.runtime.getUiSnapshot().panel!, page = new JSDOM('<body></body>', { url: 'http://localhost/' })
    cleanups.push(async () => page.window.close())
    h.runtime.mountScriptPanelDocument(page.window, first.key)
    expect((await page.window.ElecKoi.app.getCapabilities()).map((item: any) => item.method)).toContain('script.setSettings')
    expect(() => page.window.ElecKoi.ui.registerButton({ id: 'another', label: 'Another', onClick() {} })).toThrow('只有运行中的原生脚本')
    expect(await api.ui.closePanel('different-id')).toEqual({ closed: false })
    await api.ui.openPanel({ ...panel, title: 'Replacement' })
    const second = h.runtime.getUiSnapshot().panel!
    expect(second.key).not.toBe(first.key); expect(second.baseUrl).toBe(script().entryUrl)
    await expect(page.window.ElecKoi.variables.getState()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    expect(h.runtime.dismissPanel(first.key)).toBe(false)
    expect(() => h.runtime.mountScriptPanelDocument(page.window, first.key)).toThrow('已关闭或被替换')
    h.selected = { id: 'synthetic-other-chat', status: 'loading', details: null }; h.changed()
    expect(h.runtime.getUiSnapshot()).toEqual({ buttons: [], panel: null })
    await expect(h.runtime.invokeButton(h.runtime.getUiSnapshot().buttons[0]?.key || 'old-key')).rejects.toMatchObject({ code: 'BUTTON_UNAVAILABLE' })
  })

  it('cancels a stopped callback immediately and cannot apply its late input to another chat', async () => {
    let resume!: () => void, signal!: AbortSignal, late: unknown
    const h = harness([({ api }) => { api.ui.registerButton({ id: 'async', label: 'Async', async onClick(context) {
      signal = context.signal; await new Promise<void>(resolve => { resume = resolve })
      try { await context.api.input.set('Synthetic late text') } catch (error) { late = error }
    } }) }])
    const write = vi.fn(); h.runtime.registerChatUi(h.selected.id, { 'input.set': write })
    await h.runtime.start(); const key = h.runtime.getUiSnapshot().buttons[0]!.key
    const rejected = expect(h.runtime.invokeButton(key)).rejects.toMatchObject({ code: 'SCRIPT_CLOSED' })
    await vi.waitFor(() => expect(resume).toBeTypeOf('function'))
    h.selected = { id: 'synthetic-other-chat', status: 'loading', details: null }; h.changed()
    await rejected; expect(signal.aborted).toBe(true); resume()
    await vi.waitFor(() => expect(late).toMatchObject({ code: 'FRAME_CLOSED' }))
    expect(write).not.toHaveBeenCalled(); expect(h.report).not.toHaveBeenCalled()
  })

  it('honors the stored script button switch without matching legacy button names', async () => {
    const h = harness([({ api }) => { api.ui.registerButton({ id: 'action', label: 'Action', onClick() {} }) }], [{ ...script(), buttonsVisible: false }])
    await h.runtime.start(); expect(h.runtime.getUiSnapshot().buttons).toEqual([])
  })

  it('allows a declared settings panel to mount during its script startup without invoking unfinished buttons', async () => {
    let finish!: () => void
    const h = harness([async ({ api }) => {
      api.ui.registerButton({ id: 'settings', label: 'Settings', onClick() {} })
      await api.ui.openPanel(panel)
      await new Promise<void>(resolve => { finish = resolve })
    }])
    const started = h.runtime.start()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(h.runtime.getSnapshot().status).toBe('starting')
    const page = new JSDOM('<body></body>', { url: 'http://localhost/' }); cleanups.push(async () => page.window.close())
    h.runtime.mountScriptPanelDocument(page.window, h.runtime.getUiSnapshot().panel!.key)
    expect(await page.window.ElecKoi.context.current()).toMatchObject({ conversationId: h.selected.id })
    await expect(h.runtime.invokeButton(h.runtime.getUiSnapshot().buttons[0]!.key)).rejects.toThrow('尚未就绪')
    finish(); await started; expect(h.runtime.getSnapshot().status).toBe('ready')
  })
})

describe('native author chat and model commands', () => {
  it('opens the exact same-role chat, returns loaded data and closes the old fixed page without rejecting the navigation', async () => {
    const r = harness(); await r.runtime.start()
    const api = r.mount()
    r.conversations.refresh.mockResolvedValueOnce([{ ...r.selected.details.conversation, id: 'synthetic-destination',
      title: 'Synthetic catalog title', metadata: r.selected.details.metadata }])
    expect(await api.chat.open('synthetic-destination')).toMatchObject({ chat: { id: 'synthetic-destination', title: 'Synthetic loaded title' } })
    expect(r.conversations.open).toHaveBeenCalledExactlyOnceWith('synthetic-destination')
    expect(r.selected.id).toBe('synthetic-destination')
    await expect(api.chat.current()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    expect((await r.mount().chat.current()).id).toBe('synthetic-destination')
  })
  it('deletes another chat without switching, and deletes the current one without choosing or creating a replacement', async () => {
    const r = harness(); await r.runtime.start()
    const api = r.mount(), current = { ...r.selected.details.conversation, metadata: r.selected.details.metadata }
    r.conversations.refresh.mockResolvedValueOnce([{ ...current, id: 'synthetic-sibling' }, current])
    expect(await api.chat.delete('synthetic-sibling')).toMatchObject({ deletedId: 'synthetic-sibling', chat: { id: 'synthetic-chat' } })
    expect((await api.chat.current()).id).toBe('synthetic-chat')
    r.conversations.refresh.mockResolvedValueOnce([{ ...current, id: 'synthetic-sibling' }, current])
    expect(await api.chat.delete('synthetic-chat')).toEqual({ deletedId: 'synthetic-chat', chat: null })
    expect(r.conversations.open).not.toHaveBeenCalled(); expect(r.conversations.create).not.toHaveBeenCalled()
    expect(r.selected.id).toBe('')
    await expect(api.chat.current()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
  })
  it.each(['chat.open', 'chat.delete'])('rejects invalid, missing, foreign-role and ambiguous %s targets before handoff', async method => {
    const r = harness(), api = r.mount(), current = { ...r.selected.details.conversation, metadata: r.selected.details.metadata }
    await expect(api.call(method, { id: 1 })).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    await expect(api.call(method, { id: 'synthetic-missing' })).rejects.toMatchObject({ code: 'CHAT_NOT_FOUND' })
    r.conversations.refresh.mockResolvedValueOnce([{ ...current, id: 'synthetic-foreign',
      metadata: { ...current.metadata, characterId: 'synthetic-other-role' } }])
    await expect(api.call(method, { id: 'synthetic-foreign' })).rejects.toMatchObject({ code: 'CHAT_SCOPE_MISMATCH' })
    r.conversations.refresh.mockResolvedValueOnce([current, { ...current }])
    await expect(api.call(method, { id: 'synthetic-chat' })).rejects.toMatchObject({ code: 'AMBIGUOUS_CHAT' })
    expect(r.conversations.open).not.toHaveBeenCalled(); expect(r.conversations.delete).not.toHaveBeenCalled()
    expect((await api.chat.current()).id).toBe('synthetic-chat')
  })
  it('allows explicit navigation between no-role chats and reports superseded navigation without a catalog-only success', async () => {
    const r = harness(), api = r.mount()
    r.selected.details.metadata.characterId = ''
    r.conversations.refresh.mockResolvedValueOnce([{ ...r.selected.details.conversation, id: 'synthetic-no-role', metadata: r.selected.details.metadata }])
    r.conversations.open.mockResolvedValueOnce(null)
    await expect(api.chat.open('synthetic-no-role')).rejects.toMatchObject({ code: 'NAVIGATION_SUPERSEDED' })
    expect(r.conversations.open).toHaveBeenCalledExactlyOnceWith('synthetic-no-role')
  })
  it('does not hand off navigation after its catalog validation becomes stale', async () => {
    const r = harness(); await r.runtime.start()
    const api = r.mount(), current = { ...r.selected.details.conversation, metadata: r.selected.details.metadata }
    let finish!: (value: any) => void
    r.conversations.refresh.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = api.chat.open('synthetic-destination'), rejected = expect(pending).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.selected = { ...r.selected, id: 'synthetic-manually-selected' }; r.changed()
    finish([{ ...current, id: 'synthetic-destination' }]); await rejected
    expect(r.conversations.open).not.toHaveBeenCalled()
  })
  it('preserves real owner failure and permits deletion retry without closing the valid page', async () => {
    const r = harness(), api = r.mount()
    r.conversations.delete.mockRejectedValueOnce(new Error('Synthetic deletion failed'))
    await expect(api.chat.delete('synthetic-chat')).rejects.toThrow('Synthetic deletion failed')
    expect((await api.chat.current()).id).toBe('synthetic-chat')
    expect(await api.chat.delete('synthetic-chat')).toEqual({ deletedId: 'synthetic-chat', chat: null })
    expect(r.conversations.delete).toHaveBeenCalledTimes(2)
  })
  it('reads the bound character and filters chats by its explicit identity, not the selected catalog item or name', async () => {
    const r = harness(), api = r.mount()
    const current = await api.chat.current()
    expect(current).toEqual({ ...r.selected.details.conversation, characterId: 'synthetic-character',
      characterName: 'Synthetic character', characterAvatar: '' })
    r.conversations.refresh.mockResolvedValueOnce([
      { ...r.selected.details.conversation, metadata: r.selected.details.metadata },
      { ...r.selected.details.conversation, id: 'synthetic-same-role-chat', metadata: r.selected.details.metadata },
      { ...r.selected.details.conversation, id: 'synthetic-unrelated-chat',
        metadata: { ...r.selected.details.metadata, characterId: 'synthetic-unrelated-character' } },
    ])
    expect((await api.chat.list()).items.map(item => item.id)).toEqual(['synthetic-chat', 'synthetic-same-role-chat'])
    expect(r.conversations.refresh).toHaveBeenCalledTimes(1)
    const card = await api.character.current()
    expect(card).toMatchObject({ id: 'synthetic-character', persona: persona('Synthetic current persona') })
    card!.name = 'Synthetic changed in page'
    expect((await api.character.current())!.name).toBe('Synthetic character')
  })
  it('creates through the conversation owner with the bound role current persona and does not switch the page', async () => {
    const r = harness(), api = r.mount()
    expect(await api.chat.create({ title: 'Synthetic created title' })).toMatchObject({ chat: {
      id: 'synthetic-created-chat', title: 'Synthetic created title', characterId: 'synthetic-character',
    } })
    expect(r.conversations.create).toHaveBeenCalledWith({ title: 'Synthetic created title', metadata: {
      characterId: 'synthetic-character', characterName: 'Synthetic character', characterAvatar: '',
      characterPersona: persona('Synthetic current persona'),
    } })
    expect((await api.context.current()).conversationId).toBe('synthetic-chat')
    await expect(api.call('chat.create', { title: 1 })).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    expect(r.conversations.create).toHaveBeenCalledTimes(1)
  })
  it('distinguishes no role, missing role and host failure without inventing a role or empty catalog', async () => {
    const r = harness(), api = r.mount()
    r.selected.details.metadata.characterId = ''
    expect(await api.character.current()).toBeNull()
    await expect(api.chat.create()).rejects.toMatchObject({ code: 'CHARACTER_REQUIRED' })
    expect(r.remote.eleckoiCharacters.list).not.toHaveBeenCalled()
    r.selected.details.metadata.characterId = 'synthetic-missing-role'
    await expect(api.character.current()).rejects.toMatchObject({ code: 'CHARACTER_NOT_AVAILABLE' })
    expect(r.conversations.create).not.toHaveBeenCalled()
    r.remote.eleckoiCharacters.list.mockResolvedValueOnce({ ok: false, error: { code: 'synthetic/host-failed', message: 'Synthetic host failed' } })
    await expect(api.character.current()).rejects.toMatchObject({ code: 'synthetic/host-failed', message: 'Synthetic host failed' })
    r.conversations.refresh.mockRejectedValueOnce(new Error('Synthetic catalog failed'))
    await expect(api.chat.list()).rejects.toThrow('Synthetic catalog failed')
  })
  it('does not write a new chat after its preceding character read becomes stale', async () => {
    const r = harness(), api = r.mount()
    let finish!: (value: any) => void
    r.remote.eleckoiCharacters.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = api.chat.create(), rejected = expect(pending).rejects.toThrow('no longer active')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.selected = { ...r.selected, id: 'synthetic-other-chat' }
    finish({ ok: true, value: { items: [{ id: 'synthetic-character', name: 'Synthetic character' }] } })
    await rejected
    expect(r.conversations.create).not.toHaveBeenCalled()
  })
  it('exposes declared model capabilities without credentials, headers, guessed effort levels or shared mutable objects', async () => {
    const r = harness(), api = r.mount(), configs = await r.models.refresh()
    r.models.refresh.mockResolvedValue(configs)
    const catalog = await api.chat.getModels()
    expect(catalog.current).toEqual({ configId: 'synthetic-config', model: 'synthetic-model' })
    expect(catalog.items[0]).toEqual({ configId: 'synthetic-config', name: 'Synthetic model route', provider: 'custom',
      enabled: true, defaultModel: 'synthetic-model', models: [{ id: 'synthetic-model', name: 'Synthetic model',
        contextWindowTokens: 12345, reasoningEffort: 'precise', reasoningEfforts: { off: null, precise: 'declared-value' },
        supportsImageInput: false, inputModalities: ['text'] }] })
    expect(JSON.stringify(catalog)).not.toContain('synthetic-private')
    catalog.items[0]!.models[0]!.reasoningEfforts = false
    catalog.items[0]!.models[0]!.inputModalities!.push('image')
    expect(configs[0].model_options[0].reasoningEfforts).toEqual({ off: null, precise: 'declared-value' })
    expect(configs[0].model_options[0].inputModalities).toEqual(['text'])
    r.models.refresh.mockRejectedValueOnce(new Error('Synthetic model catalog failed'))
    await expect(api.chat.getModels()).rejects.toThrow('Synthetic model catalog failed')
  })
  it('selects the existing global route through the owner and reports its actual result or error', async () => {
    const r = harness(), api = r.mount()
    r.conversations.selectModel.mockResolvedValueOnce({ provider: 'synthetic-config', model: 'synthetic-model-resolved' })
    expect(await api.chat.selectModel({ configId: 'synthetic-config', model: 'synthetic-model' }))
      .toEqual({ configId: 'synthetic-config', model: 'synthetic-model-resolved' })
    expect(r.conversations.selectModel).toHaveBeenCalledWith('synthetic-chat', { provider: 'synthetic-config', model: 'synthetic-model' })
    expect(await api.chat.selectModel({ configId: 'synthetic-config', model: 'synthetic-model', reasoningEffort: 'precise' }))
      .toEqual({ configId: 'synthetic-config', model: 'synthetic-model', reasoningEffort: 'precise' })
    expect(r.conversations.selectModel).toHaveBeenLastCalledWith('synthetic-chat', { provider: 'synthetic-config', model: 'synthetic-model', reasoningEffort: 'precise' })
    r.conversations.selectModel.mockRejectedValueOnce(new Error('Synthetic route not available'))
    await expect(api.chat.selectModel({ configId: 'synthetic-unknown-config', model: 'synthetic-model' })).rejects.toThrow('Synthetic route not available')
    await expect(api.chat.selectModel({ configId: '', model: 'synthetic-model' })).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    await expect(api.call('chat.selectModel', { configId: 'synthetic-config', model: 'synthetic-model', reasoningEffort: 1 })).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    expect(r.conversations.selectModel).toHaveBeenCalledTimes(3)
  })
  it('returns only available native generation statistics and never another chat state', async () => {
    const r = harness(), api = r.mount()
    expect(await api.chat.getGenerationState()).toEqual({ active: false, conversationId: 'synthetic-chat', stats: null })
    const source = { tokenUsage: { uncachedInputTokens: 3, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      contextPressure: { contextWindow: 12345 } }
    r.stats = { id: 'synthetic-chat', stats: source }
    r.stream = { id: 'synthetic-chat', status: 'running', runId: 'synthetic-session', messageId: 'synthetic-reply', content: 'Synthetic partial', sequence: 4 }
    const running = await api.chat.getGenerationState()
    expect(running).toEqual({ active: true, conversationId: 'synthetic-chat', runId: 'synthetic-session', messageId: 'synthetic-reply',
      generationId: null, turn: null, accumulated: 'Synthetic partial', sequence: 4, stats: source })
    expect(running.stats).not.toHaveProperty('turns')
    running.stats!.tokenUsage!.outputTokens = 100
    expect(source.tokenUsage.outputTokens).toBe(2)
    r.stats = { id: 'synthetic-other-chat', stats: source }
    r.stream = { id: 'synthetic-other-chat', status: 'running', runId: 'synthetic-unrelated-session' }
    expect(await api.chat.getGenerationState()).toEqual({ active: false, conversationId: 'synthetic-chat', stats: null })
  })
  it('advertises the connected native commands', async () => {
    const api = harness().mount(), capabilities = (await api.app.getCapabilities()).map(item => item.method)
    expect(new Set(capabilities).size).toBe(capabilities.length)
    expect(capabilities).toEqual(expect.arrayContaining(['scripts.list', 'scripts.request']))
    for (const method of ['chat.current', 'chat.list', 'chat.create', 'chat.getGenerationState', 'chat.getModels', 'chat.selectModel', 'character.current']) {
      expect(capabilities).toContain(method)
    }
    expect(capabilities).toContain('audio.play')
    for (const method of ['settingLibrary.current', 'settingLibrary.getSummary', 'settingLibrary.replace', 'settingLibrary.getEntry', 'settingLibrary.updateEntry', 'settingLibrary.updateEntries',
      'presets.current', 'presets.list', 'presets.get', 'presets.getEntry', 'presets.updateEntry', 'presets.updateEntries', 'presets.select']) expect(capabilities).toContain(method)
    for (const method of ['chat.open', 'chat.delete']) expect(capabilities).toContain(method)
    expect(capabilities).toContain('chat.getAgentTrajectory')
  })
  it('cancels a former-chat setting read without delivering it to the next chat', async () => {
    const r = harness(), api = r.mount()
    let finish!: (result: any) => void
    r.remote.eleckoiCharacterConfiguration.readSettingLibrary.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = api.settingLibrary.current(), rejected = expect(pending).rejects.toThrow('页面已关闭')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.selected = { ...r.selected, id: 'synthetic-next-chat', details: { ...r.selected.details,
      conversation: { ...r.selected.details.conversation, id: 'synthetic-next-chat' } } }
    await r.runtime.refresh()
    finish({ ok: true, value: null }); await rejected
    expect(await r.mount().settingLibrary.current()).toBeNull()
    expect(r.remote.eleckoiCharacterConfiguration.readSettingLibrary).toHaveBeenLastCalledWith('synthetic-character')
  })
})

describe('native character project SDK', () => {
  const mount = (r: ReturnType<typeof harness>, conversationId?: string) => {
    const page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
    const stop = r.runtime.mountProjectDocument(page.window, { scope: 'character', characterId: 'synthetic-character',
      projectId: 'synthetic-role-project', entryFile: 'index.html', view: 'chat', ...(conversationId ? { conversationId } : {}) })
    cleanups.push(async () => { stop(); page.window.close() })
    return page.window.ElecKoi as ElecKoiAuthorApi
  }
  it('uses the declared character identity and does not use another character chat in an editor preview', async () => {
    const r = harness()
    r.selected.details.metadata.characterId = 'synthetic-other-character'
    const api = mount(r)
    expect(await api.context.current()).toMatchObject({ surface: 'character-frontend', scope: 'current-character',
      characterId: 'synthetic-character', conversationId: '', projectId: 'synthetic-role-project' })
    await expect(api.variables.getState()).rejects.toThrow('这个角色的聊天')
    await expect(api.chat.send('Synthetic send')).rejects.toThrow('这个角色的聊天')
    expect(r.remote.eleckoiAuthorVariables.getState).not.toHaveBeenCalled()
    expect(r.conversations.send).not.toHaveBeenCalled()
    expect((await api.app.getCapabilities()).map(item => item.method)).not.toContain('variables.getState')
  })
  it('binds a chat page to its exact conversation and cancels late variable work on selection change', async () => {
    const r = harness(), api = mount(r, 'synthetic-chat')
    expect(await api.context.current()).toMatchObject({ conversationId: 'synthetic-chat', characterId: 'synthetic-character' })
    let finish!: (result: any) => void
    r.remote.eleckoiAuthorVariables.merge.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = api.variables.merge({ value: 3 }), rejected = expect(pending).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.selected = { ...r.selected, id: 'synthetic-other-chat' }; r.changed()
    await rejected; finish({ ok: true, value: '{"value":3}' })
    expect(r.remote.eleckoiAuthorVariables.merge.mock.calls[0]![2].aborted).toBe(true)
    await expect(api.variables.getState()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    expect(r.detailsListeners.size).toBe(0)
  })
  it('releases a role preview when switching to another character, even when the conversation id is unchanged', async () => {
    const r = harness(), api = mount(r)
    await api.variables.getState()
    r.selected.details.metadata.characterId = 'synthetic-other-character'; r.changed()
    await expect(api.context.current()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    await expect(api.chat.send('Synthetic late send')).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    expect(r.conversations.send).not.toHaveBeenCalled()
  })
})

describe('native application project SDK', () => {
  const mount = (r: ReturnType<typeof harness>) => {
    const page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
    const stop = r.runtime.mountProjectDocument(page.window, { scope: 'application', projectId: 'synthetic-project', entryFile: 'pages/main.html', view: 'main' })
    cleanups.push(async () => { stop(); page.window.close() })
    return { api: page.window.ElecKoi as ElecKoiAuthorApi, stop }
  }
  it('keeps accepted navigation alive across selection and page close while cancelling other old-chat work', async () => {
    const r = harness(), { api, stop } = mount(r), current = { ...r.selected.details.conversation, metadata: r.selected.details.metadata }
    let finish!: (value: any) => void, finishRead!: (value: any) => void
    r.remote.eleckoiAuthorVariables.merge.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve }))
    const ordinary = api.variables.merge({ value: 2 }), rejected = expect(ordinary).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    r.conversations.refresh.mockResolvedValueOnce([{ ...current, id: 'synthetic-destination' }])
    r.conversations.open.mockImplementationOnce(id => {
      const details = { ...r.selected.details, conversation: { ...r.selected.details.conversation, id } }
      r.selected = { ...r.selected, id, details }; r.changed()
      return new Promise(resolve => { finish = () => resolve(details) })
    })
    const navigation = api.chat.open('synthetic-destination')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect((await api.context.current()).conversationId).toBe('synthetic-destination')
    stop(); await rejected
    finishRead({ ok: true, value: '{"value":2}' }); finish(undefined)
    expect(await navigation).toMatchObject({ chat: { id: 'synthetic-destination' } })
    await expect(api.context.current()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
  })
  it('mounts without a chat or compatibility resources and only advertises connected capabilities', async () => {
    const r = harness(); r.selected = { id: '', status: 'idle', details: null }
    const { api } = mount(r)
    expect(await api.context.current()).toMatchObject({ surface: 'application-frontend', scope: 'application',
      projectId: 'synthetic-project', entryFile: 'pages/main.html', conversationId: '', characterId: '' })
    expect((await api.app.getCapabilities()).map(item => item.method)).toEqual(['app.getInfo', 'app.getCapabilities', 'context.current', 'audio.getSettings', 'audio.setSettings', 'events.list'])
    expect(await api.audio.setSettings({ masterVolume: 0.5 })).toMatchObject({ masterVolume: 0.5 })
    await expect(api.audio.play({ track: 'https://example.com/synthetic.wav' })).rejects.toThrow('先选择一个聊天')
    expect(r.audio).toHaveLength(0)
    await expect(api.variables.getState()).rejects.toThrow('先选择一个聊天')
    await expect(api.chat.send('Synthetic message')).rejects.toThrow('先选择一个聊天')
    expect(r.conversations.send).not.toHaveBeenCalled()
    expect(r.remote.eleckoiAuthorVariables.getState).not.toHaveBeenCalled()
  })
  it('keeps the page available across chat selection but cancels in-flight calls to the former chat', async () => {
    const r = harness(); await r.runtime.start()
    const { api, stop } = mount(r)
    let finish!: (value: any) => void
    r.remote.eleckoiAuthorVariables.merge.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = api.variables.merge({ value: 5 })
    const rejected = expect(pending).rejects.toThrow('chat has changed')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.selected = { ...r.selected, id: 'synthetic-other-chat', details: { ...r.selected.details,
      conversation: { id: 'synthetic-other-chat', title: 'Synthetic other chat' } } }
    r.changed()
    finish({ ok: true, value: '{"value":5}' }); await rejected
    expect(r.remote.eleckoiAuthorVariables.merge.mock.calls[0]).toMatchObject(['synthetic-chat', '{"value":5}', expect.objectContaining({ aborted: true })])
    expect(await api.context.current()).toMatchObject({ conversationId: 'synthetic-other-chat', projectId: 'synthetic-project' })
    await api.variables.getState()
    expect(r.remote.eleckoiAuthorVariables.getState).toHaveBeenLastCalledWith('synthetic-other-chat')
    await expect(api.call('variables.getState', { conversationId: 'synthetic-chat' })).rejects.toThrow('redirect')
    const receipt = await api.chat.send('Synthetic direct send')
    expect(receipt).toMatchObject({ accepted: true, conversationId: 'synthetic-other-chat', messageId: 'synthetic-input' })
    stop(); stop()
    await expect(api.context.current()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
  })
  it('releases the project subscription and rejects late work on runtime disposal', async () => {
    const r = harness(), { api } = mount(r)
    expect(r.detailsListeners.size).toBe(1)
    let finish!: (value: any) => void
    r.remote.eleckoiAuthorVariables.merge.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = api.variables.merge({ value: 5 }), rejected = expect(pending).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await r.runtime.dispose(); await rejected
    finish({ ok: true, value: '{"value":5}' })
    expect(r.detailsListeners.size).toBe(0)
    await expect(api.chat.send('Synthetic late send')).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
  })
  it('shares native audio across pages, preserves completed playback on page close and clears it on chat switch', async () => {
    const r = harness(); await r.runtime.start()
    const first = mount(r), second = mount(r), message = r.mount()
    const projectEvent = vi.fn(), messageEvent = vi.fn()
    second.api.events.on('audio.state.changed', projectEvent); message.events.on('audio.state.changed', messageEvent)
    expect(await first.api.audio.play({ track: 'https://example.com/synthetic.wav' })).toMatchObject({ status: 'playing' })
    expect((await second.api.audio.getState()).currentTrack!.url).toBe('https://example.com/synthetic.wav')
    expect((await message.audio.getState()).status).toBe('playing')
    first.stop()
    expect(r.audio[0]!.paused).toBe(false); expect((await second.api.audio.getState()).status).toBe('playing')
    await second.api.audio.pause(); expect((await message.audio.getState()).status).toBe('paused')
    await second.api.audio.resume()
    expect(projectEvent).toHaveBeenCalled(); expect(messageEvent).toHaveBeenCalled()
    r.selected = { ...r.selected, id: 'synthetic-other-chat' }; r.changed()
    expect(r.audio[0]!.paused).toBe(true); expect(r.audio[0]!.src).toBe(''); expect(r.audio[0]!.listenerCount).toBe(0)
    expect(await second.api.audio.getState()).toMatchObject({ conversationId: 'synthetic-other-chat', status: 'idle', currentTrack: null })
    await expect(message.audio.getState()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
  })
  it('pauses unfinished playback on page close and releases pending playback on runtime disposal', async () => {
    const r = harness(); await r.runtime.start()
    const first = mount(r), second = mount(r)
    await first.api.audio.play({ track: 'https://example.com/synthetic.wav' })
    await first.api.audio.pause(); r.audio[0]!.deferredPlay = true
    const resuming = first.api.audio.resume(), cancelled = expect(resuming).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    first.stop(); await cancelled
    expect(await second.api.audio.getState()).toMatchObject({ status: 'paused' }); expect(r.audio[0]!.paused).toBe(true)
    const pending = second.api.audio.resume(), disposed = expect(pending).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    await r.runtime.dispose(); await disposed
    expect(r.audio[0]!.src).toBe(''); expect(r.audio[0]!.listenerCount).toBe(0)
    expect(r.detailsListeners.size).toBe(0)
  })
  it('does not deliver old-chat queued events after project selection changes and follows real message events in the new chat', async () => {
    const r = harness(); await r.runtime.start()
    const { api } = mount(r), audioEvent = vi.fn(), messageEvent = vi.fn()
    api.events.on('audio.state.changed', audioEvent); api.events.on('messages.changed', messageEvent)
    const pending = api.audio.play({ track: 'https://example.com/synthetic.wav' }), rejected = expect(pending).rejects.toMatchObject({ code: 'AUDIO_CONTEXT_CHANGED' })
    r.selected = { ...r.selected, id: 'synthetic-other-chat' }; r.changed(); await rejected
    expect(audioEvent).not.toHaveBeenCalled()
    r.changes.push({ kind: 'messages', conversationId: 'synthetic-chat', reason: 'edited', messageIds: ['synthetic-old'] })
    r.changes.push({ kind: 'messages', conversationId: 'synthetic-other-chat', reason: 'edited', messageIds: ['synthetic-new'] })
    await vi.waitFor(() => expect(messageEvent).toHaveBeenCalledExactlyOnceWith({ conversationId: 'synthetic-other-chat', reason: 'edited', messageIds: ['synthetic-new'] }))
    expect(() => api.events.on('agent.run.finished', () => {})()).not.toThrow()
  })
})

function messageHarness() {
  const r = harness()
  r.selected = { ...r.selected, details: { ...r.selected.details, hasMore: true, beforeSequence: 20, messages: [
    nativeMessage('opening', 'assistant', 0, { runtimeSessionId: undefined, sessionEventSeq: undefined,
      nativeVariableStateJson: '{"score":1}', ...r.selected.details.messages[0] }),
    nativeMessage('synthetic-input', 'user', 20),
    nativeMessage('synthetic-reply', 'assistant', 25, { nativeVariableStateJson: '{"score":4}',
      variableStateJson: '{"score":999}', process: [{ id: 'synthetic-process', summary: 'Synthetic process' }],
      inputImageAttachments: [{ attachmentId: 'synthetic-image', mediaType: 'image/png', bytes: 12, width: 1, height: 1 }],
      inputFileAttachments: [{ attachmentId: 'synthetic-file', name: 'synthetic.txt', bytes: 9 }],
    }),
  ] } }
  return r
}

describe('native author message operations', () => {
  it('reads exact native history, keeps display text, and never substitutes compatibility or current variables', async () => {
    const r = messageHarness(), api = r.mount('synthetic-reply')
    const result = await api.messages.get('synthetic-reply')
    expect(result).toMatchObject({ id: 'synthetic-reply', content: 'Synthetic text', displayContent: '', variableState: { score: 4 } })
    expect(await api.variables.getState({ messageId: 'synthetic-reply' })).toEqual({ score: 4 })
    expect(r.remote.eleckoiAuthorVariables.getState).not.toHaveBeenCalled()
    result.process[0]!.summary = 'Author-local change'
    result.variableState!.score = 99
    expect(r.selected.details.messages[2].process[0].summary).toBe('Synthetic process')
    expect((await api.messages.current()).variableState).toEqual({ score: 4 })
    expect((await api.messages.list()).map(message => message.id)).toEqual(['opening', 'synthetic-input', 'synthetic-reply'])
    r.selected.details.messages[2].nativeVariableStateJson = undefined
    expect((await api.messages.get('synthetic-reply')).variableState).toBeNull()
    await expect(api.variables.getState({ messageId: 'synthetic-reply' })).rejects.toMatchObject({ code: 'VARIABLE_HISTORY_NOT_AVAILABLE' })
    expect(await api.variables.getState()).toEqual({ value: 1 })
    await expect(api.messages.get('synthetic-not-loaded')).rejects.toMatchObject({ code: 'MESSAGE_NOT_AVAILABLE' })
  })

  it('does not turn invalid history or unprojected content into successful empty values', async () => {
    const r = messageHarness(), api = r.mount()
    r.selected.details.messages[2].nativeVariableStateJson = '[]'
    await expect(api.messages.get('synthetic-reply')).rejects.toMatchObject({ code: 'INVALID_VARIABLE_HISTORY' })
    r.selected.details.messages[2].nativeVariableStateJson = '{'
    await expect(api.messages.get('synthetic-reply')).rejects.toThrow()
    r.selected.details.messages[2].nativeVariableStateJson = undefined
    r.selected.details.messages[2].content = undefined
    await expect(api.messages.get('synthetic-reply')).rejects.toMatchObject({ code: 'MESSAGE_NOT_READY' })
  })

  it('pages the actual loaded window with its explicit cursor and rejects stale results', async () => {
    const r = messageHarness(), api = r.mount()
    expect(await api.messages.getPage()).toMatchObject({ hasMore: true, beforeSequence: 20 })
    r.conversations.pageOlder.mockImplementationOnce(async () => {
      r.selected.details = { ...r.selected.details, hasMore: false, beforeSequence: 10,
        messages: [r.selected.details.messages[0], nativeMessage('synthetic-older', 'user', 10), ...r.selected.details.messages.slice(1)] }
      return r.selected.details
    })
    const result = await api.messages.pageOlder(20)
    expect(result).toMatchObject({ hasMore: false, beforeSequence: 10 })
    expect(result.items.map(message => message.id)).toEqual(['opening', 'synthetic-older', 'synthetic-input', 'synthetic-reply'])
    expect(r.conversations.pageOlder).toHaveBeenCalledExactlyOnceWith('synthetic-chat', 20)
    await expect(api.messages.pageOlder(20)).rejects.toMatchObject({ code: 'STALE_HISTORY_CURSOR' })
    r.selected.details.hasMore = true
    await expect(api.messages.pageOlder(10)).rejects.toMatchObject({ code: 'STALE_HISTORY_CURSOR' })
  })

  it('edits opening or durable messages through their separate native commands and returns saved projection', async () => {
    const r = messageHarness(), api = r.mount()
    expect(await api.messages.setContent('synthetic-input', 'Synthetic edited input')).toMatchObject({ content: 'Synthetic edited input' })
    expect(r.conversations.editMessage).toHaveBeenCalledExactlyOnceWith('synthetic-chat', 20, 'user', 'Synthetic edited input')
    await api.messages.setContent('opening', 'Synthetic edited opening')
    expect(r.conversations.updateOpening).toHaveBeenCalledExactlyOnceWith('synthetic-chat', 'Synthetic edited opening')
    r.conversations.editMessage.mockRejectedValueOnce(new Error('Synthetic save failure'))
    await expect(api.messages.setContent('synthetic-input', 'Rejected edit')).rejects.toThrow('Synthetic save failure')
    expect((await api.messages.get('synthetic-input')).content).toBe('Synthetic edited input')
    r.selected.details.messages[1].sessionEventSeq = undefined
    await expect(api.messages.setContent('synthetic-input', 'No formal event')).rejects.toMatchObject({ code: 'MESSAGE_NOT_PERSISTED' })
    expect(r.conversations.editMessage).toHaveBeenCalledTimes(2)
  })

  it('returns authoritative deletion counts, not counts inferred from a partially loaded list', async () => {
    const r = messageHarness(), api = r.mount()
    expect(await api.messages.deleteFrom('synthetic-reply')).toEqual({ ok: true, deletedMessageCount: 6, remainingMessageCount: 4 })
    expect(r.conversations.deleteMessagesFrom).toHaveBeenCalledExactlyOnceWith('synthetic-chat', 25, 'assistant')
    await expect(api.messages.deleteFrom('opening')).rejects.toMatchObject({ code: 'MESSAGE_NOT_PERSISTED' })
  })

  it('regenerates from the formal input link even when visible list order points to a different user', async () => {
    const r = messageHarness(), api = r.mount()
    r.selected.details.messages[2].inputEventSeq = 20
    r.selected.details.messages.splice(2, 0, nativeMessage('synthetic-other-input', 'user', 22))
    r.conversations.regenerate.mockImplementationOnce(async () => ({ cancelled: false, details: { ...r.selected.details,
      messages: [nativeMessage('synthetic-new-reply', 'assistant', 31, { inputEventSeq: 20 }),
        nativeMessage('synthetic-unrelated-tail', 'assistant', 60, { inputEventSeq: 55 })] } }))
    expect(await api.messages.regenerate('synthetic-reply')).toEqual({ accepted: true, conversationId: 'synthetic-chat',
      runId: 'synthetic-session', messageId: 'synthetic-new-reply' })
    expect(r.conversations.regenerate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      conversationId: 'synthetic-chat', eventSeq: 20, requestId: expect.any(String), signal: expect.anything() }))
  })

  it('rejects ambiguous or missing input links before mutation instead of choosing a neighboring message', async () => {
    const r = messageHarness(), api = r.mount()
    r.selected.details.messages.splice(2, 0, nativeMessage('synthetic-extra-input', 'user', 22))
    await expect(api.messages.regenerate('synthetic-reply')).rejects.toMatchObject({ code: 'INPUT_NOT_AVAILABLE' })
    r.selected.details.messages.at(-1).inputEventSeq = 99
    await expect(api.messages.regenerate('synthetic-reply')).rejects.toMatchObject({ code: 'INPUT_NOT_AVAILABLE' })
    expect(r.conversations.regenerate).not.toHaveBeenCalled()
    await expect(api.messages.regenerate('synthetic-input')).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    await expect(api.call('messages.regenerate', { id: 'synthetic-input', text: 'Must not select editing by field presence' }))
      .rejects.toMatchObject({ code: 'INVALID_PARAMS' })
  })

  it('edits and regenerates a user once, waits for completion, and requires an exact reply receipt', async () => {
    const r = messageHarness(), api = r.mount()
    let finish!: (value: any) => void
    r.conversations.regenerate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const running = api.messages.editAndRegenerate('synthetic-input', 'Synthetic replacement')
    let settled = false; void running.then(() => { settled = true })
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(settled).toBe(false); expect(r.conversations.editMessage).not.toHaveBeenCalled()
    finish({ cancelled: false, details: { ...r.selected.details,
      messages: [nativeMessage('synthetic-new-reply', 'assistant', 31, { inputEventSeq: 20 })] } })
    expect(await running).toMatchObject({ messageId: 'synthetic-new-reply' })
    expect(r.conversations.regenerate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventSeq: 20, replacementMessage: 'Synthetic replacement' }))
    await expect(api.messages.editAndRegenerate('synthetic-reply', 'Wrong role')).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    await expect(api.messages.editAndRegenerate('synthetic-input', '')).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    await expect(api.messages.editAndRegenerate('synthetic-input', 'Synthetic retry')).rejects.toMatchObject({ code: 'INVALID_RUN_RESULT' })
    r.conversations.regenerate.mockResolvedValueOnce({ cancelled: true, details: r.selected.details })
    await expect(api.messages.editAndRegenerate('synthetic-input', 'Synthetic retry')).rejects.toMatchObject({ code: 'GENERATION_CANCELLED' })
  })

  it('loads exact images and preserves file or pending metadata without invented URLs or media types', async () => {
    const r = messageHarness(), api = r.mount()
    const result = await api.media.getMessageAttachments('synthetic-reply')
    expect(result.items).toEqual([
      { id: 'synthetic-image', type: 'image', url: 'blob:synthetic-image', mimeType: 'image/png', name: '', size: 12, width: 1, height: 1, duration: null, metadata: {} },
      { id: 'synthetic-file', type: 'file', url: null, mimeType: null, name: 'synthetic.txt', size: 9, width: null, height: null, duration: null, metadata: {} },
    ])
    const openingApi = r.mount('opening')
    expect(await openingApi.media.getMessageAttachments()).toEqual({ items: [] })
    await expect(openingApi.call('media.getMessageAttachments', { messageId: null })).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    r.conversations.readImage.mockClear()
    expect((await api.media.getMessageAttachment('synthetic-reply', 'synthetic-file')).url).toBeNull()
    expect(r.conversations.readImage).not.toHaveBeenCalled()
    await expect(api.media.getMessageAttachment('synthetic-reply', 'synthetic-absent')).rejects.toMatchObject({ code: 'MEDIA_NOT_AVAILABLE' })
    r.selected.details.messages[2].inputImageAttachments = [{ attachmentId: 'synthetic-pending', name: 'Synthetic image', dataUrl: 'data:image/png;base64,AA==' }]
    expect((await api.media.getMessageAttachments()).items[0]).toMatchObject({ id: 'synthetic-pending', mimeType: null, size: null })
  })

  it('does not deliver late image or mutation results after the author context is retired', async () => {
    const r = messageHarness(), api = r.mount()
    let finish!: (url: string) => void
    r.conversations.readImage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = api.messages.get('synthetic-reply')
    const failed = expect(pending).rejects.toThrow('no longer active')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.selected = { id: 'synthetic-other-chat', status: 'ready', details: { conversation: { id: 'synthetic-other-chat' }, messages: [] } }
    finish('blob:synthetic-retired'); await failed
  })
})

describe('native author Client ownership and interaction', () => {
  it('does not replace a candidate settings snapshot with an older delayed configuration read', async () => {
    let finishRule!: () => void, finishRead!: (value: { ok: true; value: NativeAuthorScriptCatalog }) => void
    const r = harness([context => {
      context.api.variables.registerRule({ id: 'settings', stage: 'before', run: async candidate => {
        await new Promise<void>(resolve => { finishRule = resolve })
        candidate.state.amount = context.settings.amount
      } })
    }])
    r.catalog.scripts[0]!.settings = { amount: 2 }
    await r.runtime.start()
    const older = structuredClone(r.catalog)
    r.remote.eleckoiAuthorScripts.read.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve }))
    r.edited(); await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'))
    r.catalog.scripts[0]!.settings = { amount: 5 }
    const next = task('synthetic-settings-task', 'synthetic-settings-run', 'before') as Extract<NativeAuthorRuleTask, { kind: 'process' }>
    next.scriptSettings = [{ key: script().key, settings: { amount: 5 }, librarySettings: {} }]
    r.tasks[0]!.push(next)
    await vi.waitFor(() => expect(finishRule).toBeTypeOf('function'))
    finishRead({ ok: true, value: older }); await new Promise(resolve => setTimeout(resolve, 0))
    finishRule()
    await vi.waitFor(() => expect(r.tasks[0]!.sent).toHaveLength(1))
    expect(r.tasks[0]!.sent[0]).toMatchObject({ id: next.id, ok: true, stateJson: '{"value":1,"amount":5}' })
    expect(r.runtime.getSnapshot().status).toBe('ready')
  })
  it('persists settings through the owning script SDK without closing frames and applies external settings live', async () => {
    let context!: Parameters<AuthorScriptProgram>[0]
    const cleanup = vi.fn(), r = harness([value => { context = value; return cleanup }])
    let revision = 1
    const getSettings = vi.fn(async (_chat, _version, _identity, target) => ({ ok: true,
      value: { revision, values: structuredClone(target === 'script' ? r.catalog.scripts[0]!.settings : r.catalog.scripts[0]!.librarySettings) } }))
    const setSettings = vi.fn(async (_chat, _version, _identity, target, json, expected) => {
      if (expected !== revision) return { ok: false, error: { code: 'CONFLICT', message: 'Synthetic stale settings' } }
      revision++
      r.catalog.scripts[0]![target === 'script' ? 'settings' : 'librarySettings'] = JSON.parse(json)
      r.edited()
      return { ok: true, value: { revision, values: JSON.parse(json) } }
    })
    Object.assign(r.remote.eleckoiAuthorScripts, { getSettings, setSettings })
    await r.runtime.start()
    const api = r.frames[0].window.ElecKoi as ElecKoiAuthorApi
    expect((await api.app.getCapabilities()).map(item => item.method)).toEqual(expect.arrayContaining(['script.getSettings', 'script.setLibrarySettings']))
    expect((await r.mount().app.getCapabilities()).some(item => item.method.startsWith('script.'))).toBe(false)
    const before = await api.script.getSettings()
    expect(await api.script.setSettings({ amount: 3 }, before.revision)).toEqual({ revision: 2, values: { amount: 3 } })
    expect(context.settings).toEqual({ amount: 3 }); expect(r.frames).toHaveLength(1); expect(cleanup).not.toHaveBeenCalled()
    expect(setSettings.mock.calls[0]?.slice(0, 4)).toEqual(['synthetic-chat', r.catalog.version,
      { scope: 'character', ownerId: 'synthetic-character', scriptId: 'synthetic-script' }, 'script'])
    await expect(api.script.setSettings({ amount: 9 }, before.revision)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(context.settings).toEqual({ amount: 3 })
    await expect(api.script.setSettings({ lost: undefined }, 2)).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    expect(setSettings).toHaveBeenCalledTimes(2)
    await expect(api.script.setSettings({}, -1)).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    const library = await api.script.getLibrarySettings()
    await api.script.setLibrarySettings({ shared: true }, library.revision)
    expect(context.librarySettings).toEqual({ shared: true })
    r.catalog.scripts[0]!.settings = { amount: 7 }; r.edited()
    await vi.waitFor(() => expect(context.settings).toEqual({ amount: 7 }))
    const older = structuredClone(r.catalog)
    let finish!: (result: { ok: true; value: NativeAuthorScriptCatalog }) => void
    r.remote.eleckoiAuthorScripts.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    r.edited(); await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.catalog.scripts[0]!.settings = { amount: 9 }; r.edited()
    await vi.waitFor(() => expect(context.settings).toEqual({ amount: 9 }))
    finish({ ok: true, value: older }); await new Promise(resolve => setTimeout(resolve, 0))
    expect(context.settings).toEqual({ amount: 9 })
    expect(r.frames).toHaveLength(1); expect(r.remote.eleckoiAuthorScripts.connect).toHaveBeenCalledTimes(1)
    expect(r.frames[0].window.__ElecKoiAuthorPendingCount()).toBe(0)
    await r.runtime.dispose()
    await expect(api.script.getSettings()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
  it('reports a closed runtime and withdraws subscriptions even if author cleanup fails', async () => {
    const r = harness([() => () => { throw new Error('Synthetic cleanup error') }]); await r.runtime.start()
    await expect(r.runtime.dispose()).rejects.toThrow('清理失败')
    expect(r.runtime.getSnapshot().status).toBe('closed')
    expect(r.runtime.getSnapshot().scriptStatuses[script().key]).toMatchObject({ status: 'error', error: 'Synthetic cleanup error' })
    expect(r.detailsListeners.size).toBe(0); expect(r.libraryListeners.size).toBe(0)
  })

  it('starts independent scopes and reports their full identity without compatibility resources', async () => {
    const scripts = [script('global'), script('preset'), script('character')], starts: string[] = [], stops: string[] = []
    const r = harness(scripts.map(item => context => { starts.push(context.scope); return () => { stops.push(item.scope) } }), scripts)
    await r.runtime.start()
    expect(r.runtime.getSnapshot().status).toBe('ready')
    expect(starts).toEqual(['global', 'preset', 'character'])
    for (const item of scripts) expect(r.runtime.getSnapshot().scriptStatuses[item.key]).toMatchObject({
      status: 'running', scope: item.scope, ownerId: item.ownerId, source: item.source,
    })
    expect(r.frames.every(frame => !frame.window.Mvu && !frame.window.TavernHelper)).toBe(true)
    await r.runtime.dispose()
    expect(stops).toEqual(['character', 'preset', 'global'])
    expect(r.detailsListeners.size).toBe(0); expect(r.libraryListeners.size).toBe(0)
    expect(r.runtime.getSnapshot().status).toBe('closed')
  })

  it('does not declare readiness before the Host acknowledges the exact catalog', async () => {
    const r = harness([() => {}]); r.acknowledge = false
    const starting = r.runtime.start()
    await vi.waitFor(() => expect(r.tasks).toHaveLength(1))
    expect(r.runtime.getSnapshot().status).toBe('starting')
    r.tasks[0]!.push({ kind: 'ready', version: r.catalog.version })
    await starting
    expect(r.runtime.getSnapshot().status).toBe('ready')
  })

  it.each(['rules', 'changes'] as const)('recovers the %s carrier without restarting programs or losing the rule channel', async source => {
    const cleanup = vi.fn(), r = harness([({ api }) => {
      api.variables.registerRule({ id: 'synthetic-rule', stage: 'before', run(context) { context.state.derived = 7 } })
      return cleanup
    }])
    const changedFeed = new Feed<any>()
    r.remote.eleckoiConversations.changes = vi.fn(r.remote.eleckoiConversations.changes)
    await r.runtime.start()
    vi.mocked(r.remote.eleckoiConversations.changes).mockReturnValue(changedFeed)
    ;(source === 'rules' ? r.tasks[0]! : r.changes).fail(new RemoteStreamCarrierError('Synthetic carrier disconnected'))
    await vi.waitFor(() => {
      expect(source === 'rules' ? r.tasks.length : r.remote.eleckoiConversations.changes.mock.calls.length).toBe(2)
      expect(r.runtime.getSnapshot().status).toBe('ready')
    })
    expect(cleanup).not.toHaveBeenCalled()
    const feed = r.tasks.at(-1)!
    feed.push(task('synthetic-reconnected-task', 'synthetic-reconnected-run', 'before'))
    await vi.waitFor(() => expect(feed.sent).toHaveLength(1))
    expect(feed.sent[0]).toMatchObject({ ok: true, stateJson: '{"value":1,"derived":7}' })
    expect(r.report).not.toHaveBeenCalled()
  })

  it('cancels a disconnected candidate and waits for the replacement Host acknowledgement without replaying it', async () => {
    let release!: () => void, candidateSignal!: AbortSignal
    const r = harness([({ api }) => { api.variables.registerRule({ id: 'synthetic-wait', stage: 'before', run: async context => {
      if (context.state.value === 1) {
        candidateSignal = context.signal
        await new Promise<void>(resolve => { release = resolve })
      }
      context.state.derived = 8
    } }) }])
    await r.runtime.start()
    const old = r.tasks[0]!
    old.push(task('synthetic-old-task', 'synthetic-old-run', 'before'))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    r.acknowledge = false
    old.fail(new RemoteStreamCarrierError('Synthetic carrier disconnected during a candidate'))
    await vi.waitFor(() => expect(r.tasks).toHaveLength(2))
    expect(candidateSignal.aborted).toBe(true)
    expect(r.runtime.getSnapshot().status).toBe('starting')
    release()
    const replacement = r.tasks[1]!
    replacement.push({ kind: 'ready', version: r.catalog.version })
    await vi.waitFor(() => expect(r.runtime.getSnapshot().status).toBe('ready'))
    replacement.push(task('synthetic-new-task', 'synthetic-new-run', 'before', 2))
    await vi.waitFor(() => expect(replacement.sent).toHaveLength(1))
    expect(replacement.sent[0]).toMatchObject({ id: 'synthetic-new-task', ok: true, stateJson: '{"value":2,"derived":8}' })
    expect(old.sent).toEqual([])
    expect(r.report).not.toHaveBeenCalled()
  })

  it('unloads running programs and buttons when the saved catalog removes disabled libraries and restarts them on re-enable', async () => {
    const cleanup = vi.fn()
    const program: AuthorScriptProgram = ({ api }) => {
      api.ui.registerButton({ id: 'synthetic-button', label: 'Synthetic button', onClick() {} })
      return cleanup
    }
    const r = harness([program, program], [script()])
    await r.runtime.start()
    expect(r.runtime.getUiSnapshot().buttons).toHaveLength(1)
    const enabled = structuredClone(r.catalog)
    r.catalog = { ...enabled, version: 'synthetic-disabled', scripts: [] }; r.edited()
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))
    expect(r.runtime.getUiSnapshot().buttons).toEqual([])
    expect(r.runtime.getSnapshot().scriptStatuses).toEqual({})
    r.catalog = { ...enabled, version: 'synthetic-restored' }; r.edited()
    await vi.waitFor(() => expect(r.frames).toHaveLength(2))
    expect(r.runtime.getUiSnapshot().buttons).toHaveLength(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('keeps empty script libraries available without claiming a Host runtime owner', async () => {
    const r = harness([], [])
    await r.runtime.start()
    expect(r.runtime.getSnapshot()).toMatchObject({ status: 'ready', error: '', scriptStatuses: {} })
    expect(r.frames).toHaveLength(0)
    expect(r.remote.eleckoiAuthorScripts.connect).not.toHaveBeenCalled()
    r.selected = { ...r.selected, id: 'synthetic-other-chat' }
    r.catalog = { ...r.catalog, conversationId: 'synthetic-other-chat', version: 'synthetic-empty-other' }
    await r.runtime.refresh()
    expect(r.runtime.getSnapshot()).toMatchObject({ status: 'ready', conversationId: 'synthetic-other-chat', error: '' })
    expect(r.remote.eleckoiAuthorScripts.connect).not.toHaveBeenCalled()
  })

  it('runs the Studio script example and opens its declared native panel through the SDK', async () => {
    const source = creatorToolsets.find(item => item.id === 'scripts')!.examples[0].content
    const program = (await import(`data:text/javascript,${encodeURIComponent(source)}`)).default
    const r = harness([program]); await r.runtime.start()
    const button = r.runtime.getUiSnapshot().buttons[0]!
    expect(button.label).toBe('查看说明')
    await r.runtime.invokeButton(button.key)
    expect(r.runtime.getUiSnapshot().panel).toMatchObject({ title: '计算说明' })
    expect(r.report).not.toHaveBeenCalled()
  })

  it('ignores repeated notifications for the same source version and restarts the changed module once', async () => {
    const cleanup = vi.fn(), r = harness([() => cleanup, () => cleanup], [script()])
    await r.runtime.start()
    expect(r.frames[0].entryUrl).toBe(r.catalog.scripts[0]!.entryUrl)
    r.edited(); r.edited(); await r.runtime.refresh()
    expect(r.frames).toHaveLength(1); expect(cleanup).not.toHaveBeenCalled()
    const entryUrl = '/eleckoi/scripts/character/synthetic-character/helper-version/scripts/entry.js'
    r.catalog = { ...r.catalog, version: 'helper-version', scripts: [{ ...r.catalog.scripts[0]!, entryUrl }] }
    r.edited()
    await vi.waitFor(() => expect(r.frames).toHaveLength(2))
    expect(r.frames[1].entryUrl).toBe(entryUrl); expect(cleanup).toHaveBeenCalledTimes(1)
    r.edited(); await r.runtime.refresh()
    expect(r.frames).toHaveLength(2)
  })

  it('keeps the management service alive after startup failure and restarts only when context is explicitly changed', async () => {
    const r = harness([() => { throw new Error('Synthetic startup error') }, () => {}], [script()])
    await expect(r.runtime.start()).resolves.toBeUndefined()
    expect(r.runtime.getSnapshot()).toMatchObject({ status: 'error', error: 'Synthetic startup error' })
    expect(r.runtime.getSnapshot().scriptStatuses[script().key]).toMatchObject({ status: 'error' })
    await r.runtime.refresh()
    expect(r.frames).toHaveLength(1)
    expect(r.runtime.getSnapshot().status).toBe('error')
    r.catalog = { ...r.catalog, version: 'synthetic-version-2' }; r.edited()
    await vi.waitFor(() => expect(r.runtime.getSnapshot().status).toBe('ready'))
    expect(r.frames).toHaveLength(2)
    expect(r.runtime.getSnapshot().scriptStatuses[script().key]!.status).toBe('running')
  })

  it('reports a failed source reload once instead of reporting again through its notification handler', async () => {
    const r = harness([() => {}, () => { throw new Error('Synthetic reload failure') }], [script()])
    await r.runtime.start()
    r.catalog = { ...r.catalog, version: 'synthetic-version-2' }; r.edited()
    await vi.waitFor(() => expect(r.runtime.getSnapshot().status).toBe('error'))
    expect(r.report).toHaveBeenCalledTimes(1)
    expect(r.report.mock.calls[0]![0]).toMatchObject({ message: 'Synthetic reload failure' })
  })

  it('cancels waiting startup when the selected chat becomes unavailable', async () => {
    const cleanup = vi.fn(); let finish!: () => void
    const r = harness([async () => { await new Promise<void>(resolve => { finish = resolve }); return cleanup }])
    const starting = r.runtime.start()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.selected = { ...r.selected, status: 'loading', details: null }; r.changed()
    await starting
    await vi.waitFor(() => expect(r.runtime.getSnapshot().status).toBe('idle'))
    finish(); await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))
    expect(r.remote.eleckoiAuthorScripts.connect).not.toHaveBeenCalled()
  })

  it('cancels a waiting startup for changed files but not for duplicate source notifications', async () => {
    const cleanup = vi.fn(); let finish!: () => void
    const r = harness([async () => { await new Promise<void>(resolve => { finish = resolve }); return cleanup }, () => {}], [script()])
    const starting = r.runtime.start()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.edited()
    await vi.waitFor(() => expect(r.remote.eleckoiAuthorScripts.read).toHaveBeenCalledTimes(2))
    expect(r.runtime.getSnapshot().status).toBe('starting'); expect(r.frames).toHaveLength(1)
    r.catalog = { ...r.catalog, version: 'synthetic-version-2' }; r.edited()
    await starting
    await vi.waitFor(() => expect(r.runtime.getSnapshot().status).toBe('ready'))
    expect(r.frames).toHaveLength(2)
    finish(); await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))
    expect(r.remote.eleckoiAuthorScripts.connect).toHaveBeenCalledTimes(1)
  })

  it('delivers cancellation while an async rule is pending and allows a fresh candidate', async () => {
    let finish!: () => void
    const r = harness([({ api }) => { api.variables.registerRule({ id: 'wait', stage: 'before', run: async context => {
      if (context.state.value === 1) await new Promise<void>(resolve => { finish = resolve })
      context.state.derived = Number(context.state.value) * 2
    } }) }])
    await r.runtime.start()
    const feed = r.tasks[0]!
    feed.push(task('synthetic-task-a', 'synthetic-run-a', 'before'))
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    feed.push({ kind: 'cancel', runId: 'synthetic-run-a' })
    await vi.waitFor(() => expect(feed.sent).toHaveLength(1))
    expect(feed.sent[0]).toMatchObject({ id: 'synthetic-task-a', ok: false })
    finish(); await Promise.resolve()
    expect(feed.sent).toHaveLength(1)
    feed.push(task('synthetic-task-b', 'synthetic-run-b', 'before', 2))
    await vi.waitFor(() => expect(feed.sent).toHaveLength(2))
    expect(feed.sent[1]).toEqual({ id: 'synthetic-task-b', ok: true, stateJson: '{"value":2,"derived":4}' })
    expect(r.runtime.getSnapshot().status).toBe('ready')
  })

  it('never replies with late old-generation results after a script edit', async () => {
    let finish!: () => void
    const r = harness([({ api }) => { api.variables.registerRule({ id: 'wait', stage: 'before', run: async context => {
      await new Promise<void>(resolve => { finish = resolve }); context.state.value = 99
    } }) }, () => {}], [script()])
    await r.runtime.start()
    const previous = r.tasks[0]!
    previous.push(task('synthetic-task', 'synthetic-run', 'before'))
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    r.catalog = { ...r.catalog, version: 'synthetic-version-2' }; r.edited()
    await vi.waitFor(() => expect(r.tasks).toHaveLength(2))
    finish(); await Promise.resolve()
    expect(previous.sent).toHaveLength(0); expect(previous.dispose).toHaveBeenCalled()
    expect(r.runtime.getSnapshot().status).toBe('ready')
  })

  it('keeps input editing separate from direct message submission and returns the exact submitted message identity', async () => {
    const r = harness(); await r.runtime.start(); const api = r.mount()
    let input = 'Synthetic draft'
    const inputSend = vi.fn(async () => ({ submitted: true }))
    const stop = r.runtime.registerChatUi('synthetic-chat', {
      'input.get': () => ({ text: input }),
      'input.set': params => { input = String(params.text); return { text: input } },
      'input.append': params => { input += params.text; return { text: input } },
      'input.clear': () => { input = ''; return { text: input } }, 'input.send': inputSend,
    })
    expect(await api.input.get()).toMatchObject({ text: 'Synthetic draft' })
    await api.input.set('Synthetic '); await api.input.append('choice')
    expect(input).toBe('Synthetic choice')
    const result = await api.chat.send('Synthetic form result')
    expect(input).toBe('Synthetic choice'); expect(inputSend).not.toHaveBeenCalled()
    expect(r.conversations.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      conversationId: 'synthetic-chat', text: 'Synthetic form result', images: [], requestId: expect.any(String), signal: expect.anything(),
    }))
    expect(result).toMatchObject({ accepted: true, conversationId: 'synthetic-chat', messageId: 'synthetic-input', runId: 'synthetic-session' })
    await api.input.send(); expect(inputSend).toHaveBeenCalledTimes(1)
    await api.input.clear(); expect(input).toBe('')
    stop(); await expect(api.input.get()).rejects.toThrow('not mounted')
  })

  it('does not invent a message receipt when the completed request has no or ambiguous formal input identity', async () => {
    const r = harness(); await r.runtime.start(); const api = r.mount()
    r.conversations.send.mockResolvedValueOnce({ cancelled: false, details: { ...r.selected.details, messages: [] } })
    await expect(api.chat.send('Synthetic input')).rejects.toThrow('identity')
    r.conversations.send.mockImplementationOnce(async (input: any) => ({ cancelled: false, details: { ...r.selected.details,
      messages: [{ id: 'synthetic-a', role: 'user', requestId: input.requestId }, { id: 'synthetic-b', role: 'user', requestId: input.requestId }],
    } }))
    await expect(api.chat.send('Synthetic input')).rejects.toThrow('identity')
  })

  it('stops an actual running generation even when the projection has no request id', async () => {
    const r = harness(); await r.runtime.start(); const api = r.mount()
    r.stream = { id: 'synthetic-chat', status: 'running', runId: 'synthetic-session', requestId: '', messageId: 'synthetic-reply' }
    expect(await api.chat.stopGeneration()).toEqual({ cancelled: true })
    expect(r.conversations.cancelGeneration).toHaveBeenCalledExactlyOnceWith('synthetic-chat')
    expect(r.conversations.cancelRequest).not.toHaveBeenCalled()
  })

  it('forwards explicit opening ids and native accepted variable results', async () => {
    const r = harness(); await r.runtime.start(); const api = r.mount('synthetic-message')
    expect(await api.context.current()).toMatchObject({ surface: 'message-renderer', messageId: 'synthetic-message', characterId: 'synthetic-character' })
    expect((await api.openings.list()).items[1]).toMatchObject({ id: 'synthetic-opening-b', initialVariableState: { value: 2 } })
    await api.openings.select('synthetic-opening-b')
    expect(r.conversations.selectOpening).toHaveBeenCalledExactlyOnceWith('synthetic-chat', 'synthetic-opening-b')
    expect(await api.variables.getState()).toEqual({ value: 1 })
    expect(await api.variables.merge({ value: 2 })).toEqual({ value: 2 })
    expect(r.remote.eleckoiAuthorVariables.merge).toHaveBeenCalledWith('synthetic-chat', '{"value":2}', expect.anything())
    await expect(api.call('variables.getState', { conversationId: 'synthetic-other' })).rejects.toThrow('redirect')
  })

  it('forwards only real message events and rejects unsupported capabilities explicitly', async () => {
    const r = harness(); await r.runtime.start(); const api = r.mount(), listener = vi.fn()
    const stop = api.events.on('messages.changed', listener)
    r.changes.push({ kind: 'catalog', reason: 'updated', conversationId: 'synthetic-chat' })
    r.changes.push({ kind: 'messages', reason: 'deleted', conversationId: 'synthetic-other', messageIds: ['synthetic-other-message'] })
    r.changes.push({ kind: 'messages', reason: 'edited', conversationId: 'synthetic-chat', messageIds: ['synthetic-message'] })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledExactlyOnceWith({ conversationId: 'synthetic-chat', reason: 'edited', messageIds: ['synthetic-message'] }))
    stop()
    expect(await api.events.list()).toEqual({ items: AUTHOR_EVENT_NAMES })
    expect(() => api.events.on('agent.run.finished', () => {})()).not.toThrow()
    await expect(api.call('synthetic.unknown')).rejects.toThrow('not connected')
    await expect(api.call('toString')).rejects.toThrow('not connected')
    expect((await api.app.getCapabilities()).some(item => item.method === 'audio.play')).toBe(true)
  })

  it.each(['configuration', 'details'] as const)('does not report a late %s read failure after the chat has closed', async source => {
    const r = harness(); await r.runtime.start(); const api = r.mount()
    let rejectRead: (error: Error) => void = () => {}
    const pending = new Promise<never>((_resolve, reject) => { rejectRead = reject })
    r.remote.eleckoiAuthorScripts.read.mockImplementationOnce(() => pending)
    if (source === 'configuration') for (const listener of r.libraryListeners) listener()
    else r.changed()
    await vi.waitFor(() => expect(r.remote.eleckoiAuthorScripts.read).toHaveBeenCalledTimes(2))
    r.selected = { id: '', status: 'idle', details: null }; r.changed()
    rejectRead(new Error('Synthetic deleted conversation'))
    await vi.waitFor(() => expect(r.runtime.getSnapshot().status).toBe('idle'))
    expect(r.report).not.toHaveBeenCalled()
    await expect(api.context.current()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
  })

  it('continues reporting a catalog failure while its chat is still active', async () => {
    const r = harness(); await r.runtime.start()
    r.remote.eleckoiAuthorScripts.read.mockRejectedValueOnce(new Error('Synthetic active read failure'))
    r.changed()
    await vi.waitFor(() => expect(r.runtime.getSnapshot().status).toBe('error'))
    expect(r.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'Synthetic active read failure' }))
  })

  it('closes author documents on chat switch rather than redirecting them to a new chat', async () => {
    const r = harness(); await r.runtime.start(); const api = r.mount()
    expect(await api.variables.getState()).toEqual({ value: 1 })
    r.selected = { id: '', status: 'idle', details: null }; r.changed()
    await expect(api.variables.getState()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    expect(r.remote.eleckoiAuthorVariables.getState).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(r.runtime.getSnapshot().status).toBe('idle'))
  })
})
