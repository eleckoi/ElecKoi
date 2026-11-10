import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error The browser test runtime does not publish declarations.
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installElecKoiAuthorApi, runWithAuthorVariableTransaction, type AuthorHostAdapter, type AuthorVariableTransaction } from '@eleckoi/author-sdk/browser'
import { applyAuthorVariablePatch, mergeAuthorVariableState } from '@eleckoi/author-sdk'
import { Context } from '@deepseek-ai/cordis'
import { createVariableIdentities } from '../../packages/shared/src/foundation/variables/identity'
import { ElecKoiAuthorVariablesApi, ElecKoiVariableProcessing } from '@eleckoi/dsh-product-api'

const pages: any[] = []
afterEach(() => { for (const page of pages.splice(0)) { page.window.dispatchEvent(new page.window.Event('pagehide')); page.window.close() } })

function browser(adapter?: AuthorHostAdapter) {
  const page = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
  pages.push(page)
  const api = installElecKoiAuthorApi(page.window, adapter)
  return { window: page.window, api }
}

describe('native author browser SDK', () => {
  it('keeps user button variable operations outside an asynchronously active rule candidate', async () => {
    let click!: Parameters<NonNullable<AuthorHostAdapter['registerButton']>>[0]['onClick'], dispose = vi.fn()
    const request = vi.fn(async () => ({ value: 7 }))
    const { window, api } = browser({ request, on: () => () => {}, registerButton: button => { click = button.onClick; return dispose } })
    const candidate = { value: 3 }, controller = new AbortController()
    api.ui.registerButton({ id: 'user-action', label: 'User action', async onClick({ api }) {
      expect(await api.variables.merge({ value: 7 })).toEqual({ value: 7 })
    } })
    await runWithAuthorVariableTransaction(window, { conversationId: 'synthetic-chat', signal: controller.signal,
      getState: () => candidate, setState: () => { throw new Error('User action incorrectly joined candidate') } }, async () => {
      await click(controller.signal)
      expect(await api.variables.getState()).toEqual(candidate)
    })
    expect(candidate).toEqual({ value: 3 }); expect(request).toHaveBeenCalledOnce()
    window.dispatchEvent(new window.Event('pagehide')); expect(dispose).toHaveBeenCalledOnce()
  })

  it('cancels all API namespaces belonging to an unregistered button invocation', async () => {
    let click!: Parameters<NonNullable<AuthorHostAdapter['registerButton']>>[0]['onClick'], resume!: () => void
    const request = vi.fn(), controller = new AbortController()
    const { api } = browser({ request, on: () => () => {}, registerButton: button => { click = button.onClick; return () => {} } })
    api.ui.registerButton({ id: 'cancel', label: 'Cancel', async onClick({ api }) {
      await new Promise<void>(resolve => { resume = resolve })
      await expect(api.input.set('Synthetic text')).rejects.toThrow('Synthetic cancelled')
      await expect(api.ui.openPanel({ id: 'panel', title: 'Panel', html: '<html></html>' })).rejects.toThrow('Synthetic cancelled')
    } })
    const pending = click(controller.signal)
    await vi.waitFor(() => expect(resume).toBeTypeOf('function'))
    controller.abort(new Error('Synthetic cancelled')); resume(); await pending
    expect(request).not.toHaveBeenCalled()
  })
  it.each(['chat.open', 'chat.delete'])('waits for an accepted %s after its source page closes, but cancels other calls', async method => {
    let finish!: (value: unknown) => void
    let navigationOptions: Parameters<AuthorHostAdapter['request']>[2] | undefined
    let ordinarySignal: AbortSignal | undefined
    const { window, api } = browser({ on: () => () => {}, request: (name, _params, options) => {
      if (name === method) {
        navigationOptions = options
        options.commitContextChange!()
        return new Promise(resolve => { finish = resolve })
      }
      ordinarySignal = options.signal
      return new Promise(() => {})
    } })
    const ordinary = api.variables.getState(), ordinaryRejected = expect(ordinary).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    const navigation = method === 'chat.open' ? api.chat.open('synthetic-destination') : api.chat.delete('synthetic-destination')
    const outcome = navigation.then(value => ({ value }), error => ({ error }))
    window.dispatchEvent(new window.Event('pagehide'))
    await ordinaryRejected
    expect(ordinarySignal!.aborted).toBe(true)
    expect(navigationOptions!.signal.aborted).toBe(false)
    expect(window.__ElecKoiAuthorPendingCount()).toBe(1)
    await expect(api.context.current()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    const result = method === 'chat.open' ? { chat: { id: 'synthetic-destination' } } : { deletedId: 'synthetic-destination', chat: null }
    finish(result)
    expect(await outcome).toEqual({ value: result })
    expect(window.__ElecKoiAuthorPendingCount()).toBe(0)
  })

  it('cancels navigation before handoff and does not permit a late handoff to revive it', async () => {
    let options!: Parameters<AuthorHostAdapter['request']>[2]
    const { window, api } = browser({ on: () => () => {}, request: (_method, _params, requestOptions) => {
      options = requestOptions
      return new Promise(() => {})
    } })
    const pending = api.chat.open('synthetic-destination'), rejected = expect(pending).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    window.dispatchEvent(new window.Event('pagehide'))
    await rejected
    expect(options.signal.aborted).toBe(true)
    expect(() => options.commitContextChange!()).toThrow('作者页面已关闭')
  })

  it('installs and calls native services without any compatibility globals or resources', async () => {
    const request = vi.fn(async (method: string) => method === 'variables.getState' ? { value: 2 } : { name: 'ElecKoi', apiVersion: '0.1.0', stage: 'preview' })
    const adapter = { request, on: vi.fn(() => () => {}) }
    const { window, api } = browser(adapter)
    expect(await api.variables.getState()).toEqual({ value: 2 })
    expect(await api.app.getInfo()).toMatchObject({ name: 'ElecKoi' })
    expect(request).toHaveBeenCalledWith('variables.getState', {}, { signal: expect.anything() })
    expect(window.TavernHelper).toBeUndefined(); expect(window.SillyTavern).toBeUndefined(); expect(window.Mvu).toBeUndefined()
    expect(window.__ElecKoiSt).toBeUndefined(); expect(window.__ElecKoiShared).toBeUndefined()
    expect(window.document.querySelectorAll('script')).toHaveLength(0)
    expect(installElecKoiAuthorApi(window, adapter)).toBe(api)
    expect(Object.isFrozen(api)).toBe(true); expect(Object.isFrozen(api.variables)).toBe(true)
  })

  it('reports an unavailable native service rather than returning an empty state', async () => {
    const { api } = browser()
    await expect(api.variables.getState()).rejects.toMatchObject({ code: 'HOST_UNAVAILABLE' })
  })

  it('passes declared message and setting commands to the installed native adapter', async () => {
    const request = vi.fn(async () => ({}))
    const { api } = browser({ request, on: () => () => {} })
    await api.messages.setContent('synthetic-message', 'Synthetic text')
    const library = { characterId: 'synthetic-character', name: 'Synthetic settings', entries: [], groups: [], promptPositions: [] }
    await api.settingLibrary.replace(library)
    expect(request).toHaveBeenCalledWith('messages.setContent', { id: 'synthetic-message', text: 'Synthetic text' }, { signal: expect.anything() })
    expect(request).toHaveBeenCalledWith('settingLibrary.replace', { library }, { signal: expect.anything() })
  })

  it('reads and edits the active candidate without a second Host read or save, then resumes normal calls', async () => {
    const request = vi.fn(async () => ({ value: 2 }))
    const { window, api } = browser({ request, on: () => () => {} })
    let state = { value: 5 } as Record<string, unknown>
    const transaction: AuthorVariableTransaction = {
      conversationId: 'synthetic-chat',
      signal: new AbortController().signal, getState: () => state, setState: value => { state = value }
    }
    await runWithAuthorVariableTransaction(window, transaction, async () => {
      const read = await api.variables.getState(); read.value = 99
      expect(state.value).toBe(5)
      await api.variables.merge({ derived: 10 })
      await api.variables.applyPatch([{ op: 'add', path: '/items', value: [] }, { op: 'add', path: '/items/-', value: 'Synthetic' }])
      expect(await api.call('variables.getState')).toEqual({ value: 5, derived: 10, items: ['Synthetic'] })
      await runWithAuthorVariableTransaction(window, transaction, async () => {
        await api.variables.setState({ value: 6 })
      })
    })
    expect(state).toEqual({ value: 6 }); expect(request).not.toHaveBeenCalled()
    expect(await api.variables.getState()).toEqual({ value: 2 }); expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps explicitly requested historical reads outside the current candidate', async () => {
    const request = vi.fn(async () => ({ value: 1 }))
    const { window, api } = browser({ request, on: () => () => {} })
    await runWithAuthorVariableTransaction(window, {
      conversationId: 'synthetic-chat',
      signal: new AbortController().signal, getState: () => ({ value: 5 }), setState: () => { throw new Error('Unexpected write') }
    }, async () => { expect(await api.variables.getState({ messageId: 'synthetic-history' })).toEqual({ value: 1 }) })
    expect(request).toHaveBeenCalledWith('variables.getState', { messageId: 'synthetic-history' }, { signal: expect.anything() })
  })

  it('does not substitute the candidate for an explicitly different conversation', async () => {
    const request = vi.fn(async () => ({ value: 1 }))
    const { window, api } = browser({ request, on: () => () => {} })
    await runWithAuthorVariableTransaction(window, {
      conversationId: 'synthetic-chat', signal: new AbortController().signal,
      getState: () => ({ value: 5 }), setState: () => { throw new Error('Unexpected candidate write') }
    }, async () => {
      expect(await api.call('variables.getState', { conversationId: 'synthetic-other-chat' })).toEqual({ value: 1 })
    })
    expect(request).toHaveBeenCalledWith('variables.getState', { conversationId: 'synthetic-other-chat' }, { signal: expect.anything() })
  })

  it('captures native requests before an asynchronous page-context switch', async () => {
    let conversationId = 'synthetic-chat'
    const request = vi.fn(async () => ({ conversationId }))
    const { api } = browser({ request, on: () => () => {} })
    const task = api.context.current()
    conversationId = 'synthetic-other-chat'
    expect(await task).toEqual({ conversationId: 'synthetic-chat' })
  })

  it('clears failed and aborted rule contexts before a corrected attempt', async () => {
    const request = vi.fn(async () => ({ value: 2 }))
    const { window, api } = browser({ request, on: () => () => {} })
    const controller = new AbortController()
    const transaction = { conversationId: 'synthetic-chat', signal: controller.signal, getState: () => ({ value: 5 }), setState: vi.fn() }
    await expect(runWithAuthorVariableTransaction(window, transaction, async () => {
      controller.abort(new Error('Synthetic cancellation'))
      await api.variables.merge({ derived: 10 })
    })).rejects.toThrow('Synthetic cancellation')
    expect(transaction.setState).not.toHaveBeenCalled()
    await expect(runWithAuthorVariableTransaction(window, { ...transaction, signal: new AbortController().signal }, () => {
      throw new Error('Synthetic rule failure')
    })).rejects.toThrow('Synthetic rule failure')
    expect(await api.variables.getState()).toEqual({ value: 2 })
  })

  it('rejects an unfinished request on page close and releases subscriptions', async () => {
    const stop = vi.fn(); let signal: AbortSignal | undefined
    const { window, api } = browser({ request: (_method, _params, options) => {
      signal = options.signal; return new Promise(() => {})
    }, on: () => stop })
    api.events.on('messages.changed', () => {})
    const task = api.variables.getState()
    await Promise.resolve()
    expect(window.__ElecKoiAuthorPendingCount()).toBe(1)
    window.dispatchEvent(new window.Event('pagehide'))
    await expect(task).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
    expect(signal?.aborted).toBe(true); expect(stop).toHaveBeenCalledTimes(1)
    expect(window.__ElecKoiAuthorPendingCount()).toBe(0)
    await expect(api.variables.getState()).rejects.toMatchObject({ code: 'FRAME_CLOSED' })
  })

  it('subscribes once per event and removes the native subscription after the final listener', async () => {
    const stop = vi.fn(); let emit: ((payload: unknown) => void) | undefined
    const on = vi.fn((_event, listener) => { emit = listener; return stop })
    const { api } = browser({ request: async () => null, on })
    const first = vi.fn(), second = vi.fn()
    const offFirst = api.events.on('messages.changed', first)
    api.events.on('messages.changed', second)
    emit?.({ conversationId: 'synthetic-chat' }); await Promise.resolve()
    expect(first).toHaveBeenCalled(); expect(second).toHaveBeenCalled(); expect(on).toHaveBeenCalledTimes(1)
    offFirst(); expect(stop).not.toHaveBeenCalled()
    expect(api.events.off('messages.changed', second)).toBe(true); expect(stop).toHaveBeenCalledTimes(1)
  })

  it('drops queued callbacks after unsubscribe or a project chat change, and isolates listener payloads', async () => {
    let emit!: (payload: unknown) => void, selected = 'synthetic-chat'
    const { api } = browser({ request: async () => null, on: (_event, listener) => { emit = listener; return () => {} },
      isEventCurrent: (_event, payload) => (payload as any).conversationId === selected })
    const first = vi.fn(payload => { payload.messageIds.push('synthetic-local-change') }), second = vi.fn()
    const stop = api.events.on('messages.changed', first); api.events.on('messages.changed', second)
    const payload = { conversationId: 'synthetic-chat', reason: 'edited', messageIds: ['synthetic-message'] }
    emit(payload); await Promise.resolve()
    expect(second).toHaveBeenCalledWith(payload); expect(payload.messageIds).toEqual(['synthetic-message'])
    first.mockClear(); second.mockClear()
    emit(payload); selected = 'synthetic-other-chat'; await Promise.resolve()
    expect(first).not.toHaveBeenCalled(); expect(second).not.toHaveBeenCalled()
    selected = 'synthetic-chat'; emit(payload); stop(); await Promise.resolve()
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledTimes(1)
  })

  it('resolves relative audio sources against the author document base for typed and generic calls without rewriting metadata', async () => {
    const request = vi.fn(async () => ({})), { window, api } = browser({ request, on: () => () => {} })
    const base = window.document.createElement('base'); base.href = 'http://localhost/eleckoi/frontends/synthetic/files/pages/main.html'
    window.document.head.append(base)
    const input = { url: '../audio/synthetic.wav', name: 'Synthetic audio', metadata: { value: 1 } }
    await api.audio.play({ track: input })
    expect(request).toHaveBeenLastCalledWith('audio.play', { track: { ...input, url: 'http://localhost/eleckoi/frontends/synthetic/files/audio/synthetic.wav' } }, expect.anything())
    await api.audio.setPlaylist('voice', [input, 'https://example.com/synthetic.wav'], { currentIndex: 1 })
    expect(request).toHaveBeenLastCalledWith('audio.setPlaylist', { channel: 'voice', items: [
      { ...input, url: 'http://localhost/eleckoi/frontends/synthetic/files/audio/synthetic.wav' }, 'https://example.com/synthetic.wav'
    ], currentIndex: 1 }, expect.anything())
    await api.call('audio.appendPlaylist', { channel: 'voice', items: ['../audio/synthetic.wav'] })
    expect(request).toHaveBeenLastCalledWith('audio.appendPlaylist', { channel: 'voice', items: ['http://localhost/eleckoi/frontends/synthetic/files/audio/synthetic.wav'] }, expect.anything())
    expect(input.url).toBe('../audio/synthetic.wav')
    await expect(api.audio.play({ track: 'http://[' })).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('declares no compatibility dependency in the native SDK package', () => {
    const manifest = JSON.parse(readFileSync(resolve('packages/sdk/author/package.json'), 'utf8'))
    expect(Object.keys(manifest.dependencies ?? {}).filter(name => name.startsWith('@eleckoi/compatibility-'))).toEqual([])
    expect(manifest.exports['./browser']).toBeDefined()
  })
})

describe('native author variable patch contract', () => {
  it('uses the declared add/replace/remove operations in the actual Host entry point', async () => {
    let current = { value: 2, items: ['first', 'last'] } as Record<string, unknown>
    let identityJson = JSON.stringify(createVariableIdentities(current, { versionId: '', objects: [], variables: [] }, 'runtime'))
    const save = vi.fn(async (_id, json, identities) => { current = JSON.parse(json); identityJson = identities; return json })
    const data = { readConversationDetails: () => ({}), readAuthorConversationState: () => ({ currentVariableStateJson: JSON.stringify(current), variableIdentityJson: identityJson, variableConfig: null }),
      replaceConversationVariableState: save }
    const ctx = new Context()
    ctx.provide('eleckoiProductData', data as any)
    ctx.provide('eleckoiVariableProcessing', new ElecKoiVariableProcessing(data as any))
    ctx.provide('eleckoiConversationChanges', { publish() {} } as any)
    const host = new ElecKoiAuthorVariablesApi(ctx)
    const patch = [{ op: 'add', path: '/items/1', value: 'middle' }, { op: 'replace', path: '/value', value: 5 }, { op: 'remove', path: '/items/0' }]
    expect(JSON.parse(await host.applyPatch('synthetic-chat', JSON.stringify(patch), new AbortController().signal)))
      .toEqual({ value: 5, items: ['middle', 'last'] })
    expect(save).toHaveBeenCalledTimes(1)
    await expect(host.applyPatch('synthetic-chat', JSON.stringify([
      { op: 'add', path: '/extra', value: true }, { op: 'replace', path: '/missing', value: 3 }
      ]), new AbortController().signal)).rejects.toThrow('变量补丁找不到路径')
    expect(save).toHaveBeenCalledTimes(1); expect(current).toEqual({ value: 5, items: ['middle', 'last'] })
  })

  it('handles escaped and empty field names and root replacement without changing the input', () => {
    const current = { 'a/b': { '~key': 2 }, '': 'Synthetic' }
    expect(applyAuthorVariablePatch(current, [{ op: 'replace', path: '/a~1b/~0key', value: 5 }, { op: 'remove', path: '/' }]))
      .toEqual({ 'a/b': { '~key': 5 } })
    expect(current).toEqual({ 'a/b': { '~key': 2 }, '': 'Synthetic' })
    expect(applyAuthorVariablePatch(current, [{ op: 'replace', path: '', value: { value: 8 } }])).toEqual({ value: 8 })
  })

  it('does not traverse inherited properties or invoke prototype setters', () => {
    expect(() => applyAuthorVariablePatch({}, [{ op: 'add', path: '/__proto__/synthetic', value: true }])).toThrow('变量补丁找不到路径')
    const result = applyAuthorVariablePatch({}, [{ op: 'add', path: '/__proto__', value: { synthetic: true } }])
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype); expect(Object.hasOwn(result, '__proto__')).toBe(true)
    const merged = mergeAuthorVariableState({}, JSON.parse('{"__proto__":{"synthetic":true}}'))
    expect(Object.hasOwn(merged, '__proto__')).toBe(true); expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
  })
})
