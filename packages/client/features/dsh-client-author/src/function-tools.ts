import type { TavernFunctionToolTask, TavernFunctionToolReply, TavernFunctionToolDefinition, TavernMainPromptContribution } from '@eleckoi/dsh-product-api/types'

interface Tool { shouldRegister(): Promise<boolean>; toFunctionOpenAI(): { function: { name: string; description: string; parameters: Record<string, unknown> } }; invoke(args: unknown): Promise<unknown>; stealth?: boolean }
interface Owner { tool: Tool; conversationId: string; signal?: AbortSignal; alive(): boolean; invoke(args: unknown, context: { signal: AbortSignal; callId: string }): Promise<unknown> }
type Stream = AsyncIterable<TavernFunctionToolTask> & { send(reply: TavernFunctionToolReply): void | Promise<unknown>; dispose(): void | Promise<void> }
export interface FunctionToolRemote { connectTools(conversationId: string, signal: AbortSignal): Stream }
type Entry = { count: number; abort: AbortController; ready: Promise<void>; rejectReady(error: unknown): void; stream: Stream; jobs: Map<string, AbortController> }

function json(value: unknown): string {
  const serialized = JSON.stringify(value ?? null, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item) || ['function', 'symbol', 'bigint'].includes(typeof item)) throw new TypeError('Function tool results must be lossless JSON values.')
    return item
  })
  if (serialized === undefined) throw new TypeError('Function tool returned no JSON result.')
  return serialized
}

function callback<T>(work: () => T | Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    Promise.resolve().then(() => { signal.throwIfAborted(); return work() }).then(value => { signal.removeEventListener('abort', cancel); resolve(value) }, error => { signal.removeEventListener('abort', cancel); reject(error) })
  })
}

/** Application-owned callback connections, shared by every mounted document in one chat. */
export class NativeFunctionToolRuntime {
  private readonly entries = new Map<string, Entry>()
  private readonly closing = new Map<string, Promise<void>>()
  constructor(private readonly remote: FunctionToolRemote, private readonly shared: Record<string, any>,
    private readonly uuid: () => string, private readonly report: (error: unknown) => void) {}

  acquire(conversationId: string): { ready: Promise<void>; release(): void } {
    if (!conversationId) return { ready: Promise.resolve(), release() {} }
    let entry = this.entries.get(conversationId)
    if (!entry) {
      const abort = new AbortController()
      // A remounted document waits for its old Remote owner to release the chat.
      const pending = (this.closing.get(conversationId) ?? Promise.resolve()).then(() => {
        abort.signal.throwIfAborted()
        return this.remote.connectTools(conversationId, abort.signal)
      })
      const stream: Stream = {
        async *[Symbol.asyncIterator]() { yield* await pending },
        async send(reply) { return (await pending).send(reply) },
        async dispose() { const connected = await pending.catch(() => undefined); await connected?.dispose() },
      }
      let resolve!: () => void, reject!: (error: unknown) => void
      const ready = new Promise<void>((ok, fail) => { resolve = ok; reject = fail })
      entry = { count: 0, abort, stream, ready, rejectReady: reject, jobs: new Map() }
      this.entries.set(conversationId, entry)
      void this.consume(conversationId, entry, resolve).catch(error => {
        reject(error)
        if (!abort.signal.aborted) { this.report(error); this.close(conversationId, entry!, error) }
      })
    }
    entry.count++
    const owned = entry
    let released = false
    return { ready: owned.ready, release: () => {
      if (released) return
      released = true
      if (--owned.count === 0) this.close(conversationId, owned, new Error('Function tool documents closed.'))
    } }
  }

  private async consume(conversationId: string, entry: Entry, ready: () => void): Promise<void> {
    const definitions = new Map<string, Owner>()
    let acknowledged = false
    for await (const task of entry.stream) {
      if (entry.abort.signal.aborted) return
      if (task.kind === 'ready') {
        if (acknowledged) throw new Error('Duplicate function tool channel acknowledgement.')
        acknowledged = true; ready(); continue
      }
      if (!acknowledged) throw new Error('Function tool channel was not acknowledged.')
      if (task.kind === 'cancel') { entry.jobs.get(task.id)?.abort(new Error('Function tool call cancelled.')); continue }
      const controller = new AbortController()
      entry.jobs.set(task.id, controller)
      const signal = AbortSignal.any([controller.signal, entry.abort.signal])
      void (async () => {
        try {
          signal.throwIfAborted()
          if (task.kind === 'prompts') {
            const collector = this.shared.collectMainPromptContributions
            if (typeof collector !== 'function') throw new Error('The shared main Prompt collector is not initialized.')
            const contributions: TavernMainPromptContribution[] = JSON.parse(json(await callback(() => collector({
              conversationId, requestId: task.requestId, signal, preview: task.preview,
            }), signal)))
            if (!Array.isArray(contributions)) throw new TypeError('The shared main Prompt collector must return an array.')
            signal.throwIfAborted()
            await entry.stream.send({ kind: 'prompts', id: task.id, contributions })
          } else if (task.kind === 'prompt-texts') {
            const resolveTexts = this.shared.resolveMainPromptTexts
            if (typeof resolveTexts !== 'function') throw new Error('The shared card macro runtime is not initialized.')
            const texts: string[] = JSON.parse(json(await callback(() => resolveTexts({
              conversationId, requestId: task.requestId, signal, preview: task.preview, texts: task.texts,
            }), signal)))
            if (!Array.isArray(texts) || texts.length !== task.texts.length || texts.some(text => typeof text !== 'string'))
              throw new TypeError('The shared card macro runtime must preserve the text batch.')
            signal.throwIfAborted()
            await entry.stream.send({ kind: 'prompt-texts', id: task.id, texts })
          } else if (task.kind === 'worldbook-event') {
            const dispatch = this.shared.dispatchWorldbookEvent
            if (typeof dispatch !== 'function') throw new Error('The shared worldbook event runtime is not initialized.')
            const payload = await callback(() => dispatch({ conversationId, requestId: task.requestId,
              eventKey: task.eventKey, eventName: task.eventName, payload: JSON.parse(task.payloadJson),
              signal, preview: task.preview }), signal)
            signal.throwIfAborted()
            await entry.stream.send({ kind: 'worldbook-event', id: task.id, payloadJson: json(payload) })
          } else if (task.kind === 'release-prompts') {
            const release = this.shared.releaseMainPromptContributions
            if (typeof release !== 'function') throw new Error('The shared main Prompt collector release is not initialized.')
            release(conversationId, task.requestId)
            await entry.stream.send({ kind: 'released-prompts', id: task.id })
          } else if (task.kind === 'prepare') {
            const tools: TavernFunctionToolDefinition[] = []
            const next = new Map<string, Owner>()
            for (const [name, owner] of this.shared.functionToolOwners ?? []) {
              if (!owner.alive() || owner.conversationId && owner.conversationId !== conversationId) continue
              const ownerSignal = owner.signal ? AbortSignal.any([signal, owner.signal]) : signal
              try { if (!await callback(() => owner.tool.shouldRegister(), ownerSignal)) continue }
              catch (error) { if (owner.signal?.aborted && !signal.aborted) continue; throw error }
              signal.throwIfAborted()
              if (this.shared.functionToolOwners?.get(name) !== owner || !owner.alive()) continue
              const schema = owner.tool.toFunctionOpenAI().function
              const parameters: TavernFunctionToolDefinition['parameters'] = JSON.parse(json(schema.parameters))
              if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new TypeError('Function tool parameters must be a JSON Schema object.')
              const token = this.uuid()
              tools.push({ name: schema.name, description: schema.description, parameters, token, stealth: owner.tool.stealth === true })
              next.set(token, owner)
            }
            signal.throwIfAborted()
            definitions.clear(); for (const [token, owner] of next) definitions.set(token, owner)
            await entry.stream.send({ kind: 'prepared', id: task.id, tools })
          } else {
            const owner = definitions.get(task.token)
            if (!owner || !owner.alive() || this.shared.functionToolOwners?.get(owner.tool.toFunctionOpenAI().function.name) !== owner) throw new Error('Function tool was unregistered or its document closed.')
            const ownerSignal = owner.signal ? AbortSignal.any([signal, owner.signal]) : signal
            const value = await callback(() => owner.invoke(JSON.parse(task.argumentsJson), { signal: ownerSignal, callId: task.callId }), ownerSignal)
            ownerSignal.throwIfAborted()
            await entry.stream.send({ kind: 'result', id: task.id, valueJson: json(value) })
          }
        } catch (error) {
          if (!signal.aborted) await entry.stream.send({ kind: 'error', id: task.id, message: error instanceof Error ? error.message : String(error) })
        } finally { entry.jobs.delete(task.id) }
      })().catch(error => { if (!entry.abort.signal.aborted) this.report(error) })
    }
    if (!entry.abort.signal.aborted) throw new Error('Function tool callback stream ended.')
  }

  private close(conversationId: string, entry: Entry, reason: unknown): void {
    if (this.entries.get(conversationId) === entry) this.entries.delete(conversationId)
    entry.rejectReady(reason)
    entry.abort.abort(reason)
    for (const controller of entry.jobs.values()) controller.abort(reason)
    entry.jobs.clear()
    const retirement = Promise.resolve(entry.stream.dispose())
    this.closing.set(conversationId, retirement)
    const remove = () => { if (this.closing.get(conversationId) === retirement) this.closing.delete(conversationId) }
    void retirement.then(remove, error => { remove(); this.report(error) })
  }
  dispose(): void {
    for (const [conversationId, entry] of this.entries) this.close(conversationId, entry, new Error('Function tool runtime closed.'))
  }
}
