import { randomUUID } from 'node:crypto'
import { refreshTavernToolPrompt } from './tavern-tool-prompt-projection.js'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import { registerAuthorToolNames } from '@eleckoi/dsh-client-roleplay'
import type { TavernFunctionToolDefinition, TavernFunctionToolTask, TavernFunctionToolReply, TavernMainPromptContribution, TavernPromptText, TavernWorldbookEventName } from './types.js'

type Answer = Extract<TavernFunctionToolReply, { kind: 'prepared' | 'result' | 'prompts' | 'prompt-texts' | 'worldbook-event' | 'released-prompts' }>
type Work = Extract<TavernFunctionToolTask, { kind: 'prepare' | 'invoke' | 'prompts' | 'prompt-texts' | 'worldbook-event' | 'release-prompts' }>

/** One live Remote owns callbacks; only declarations and JSON values cross the wire. */
export class TavernFunctionToolChannel {
  private readonly queue: TavernFunctionToolTask[] = []
  private readonly pending = new Map<string, { kind: Work['kind']; resolve(value: Answer): void; reject(error: unknown): void; cleanup(): void }>()
  private wake: (() => void) | undefined
  private closed = false
  private error: unknown

  request(task: Work, signal: AbortSignal): Promise<Answer> {
    signal.throwIfAborted()
    if (this.closed) return Promise.reject(this.error)
    return new Promise((resolve, reject) => {
      const cancel = () => {
        if (!this.pending.delete(task.id)) return
        signal.removeEventListener('abort', cancel)
        this.push({ kind: 'cancel', id: task.id }); reject(signal.reason)
      }
      this.pending.set(task.id, { kind: task.kind, resolve, reject, cleanup: () => signal.removeEventListener('abort', cancel) })
      signal.addEventListener('abort', cancel, { once: true }); this.push(task)
    })
  }

  reply(reply: TavernFunctionToolReply): void {
    const pending = this.pending.get(reply.id)
    if (!pending) return
    this.pending.delete(reply.id); pending.cleanup()
    if (reply.kind === 'error') { pending.reject(new Error(reply.message)); return }
    const expected = { prepare: 'prepared', invoke: 'result', prompts: 'prompts', 'prompt-texts': 'prompt-texts', 'worldbook-event': 'worldbook-event', 'release-prompts': 'released-prompts' } as const
    if (reply.kind !== expected[pending.kind]) {
      pending.reject(new Error('Function tool callback returned the wrong response kind.')); return
    }
    pending.resolve(reply)
  }

  private push(task: TavernFunctionToolTask): void {
    if (this.closed) return
    this.queue.push(task); this.wake?.(); this.wake = undefined
  }
  async *tasks(): AsyncIterable<TavernFunctionToolTask> {
    while (!this.closed) {
      const task = this.queue.shift()
      if (task) yield task
      else await new Promise<void>(resolve => { this.wake = resolve })
    }
    if (this.error) throw this.error
  }
  close(error: unknown): void {
    if (this.closed) return
    this.closed = true; this.error = error; this.queue.length = 0
    for (const task of this.pending.values()) { task.cleanup(); task.reject(error) }
    this.pending.clear(); this.wake?.(); this.wake = undefined
  }
}

/** Tools are scoped to the existing Agent and recorded by its normal tools pipeline. */
export class NativeTavernFunctionTools {
  private readonly channels = new Map<string, { sessionId: string; channel: TavernFunctionToolChannel }>()
  private readonly installed = new Map<Agent, { channel: TavernFunctionToolChannel; names: Set<string>; disposers: Array<() => void> }>()

  constructor(private readonly owner: Context) {
    owner.on('system-prompt/assemble', async (assembly, context, next) => {
      const agent = context.agent
      if (!agent) return next()
      const previous = this.installed.get(agent)?.names ?? new Set<string>()
      await this.prepare(agent, context.signal ?? new AbortController().signal)
      const current = this.installed.get(agent)?.names ?? new Set<string>()
      refreshTavernToolPrompt(agent, assembly, previous, current)
      return next()
    }, { prepend: true })
    owner.on('session/disposed', session => {
      for (const [agent] of this.installed) if (agent.session.id === session.id) this.clear(agent)
    })
    owner.effect(() => () => {
      for (const { channel } of this.channels.values()) channel.close(new Error('Function tool Host closed.'))
      this.channels.clear()
      for (const agent of this.installed.keys()) this.clear(agent)
    })
  }

  open(conversationId: string): { channel: TavernFunctionToolChannel; close(error: unknown): void } {
    if (this.channels.has(conversationId)) throw new Error('This chat already has a function tool runtime.')
    const sessionId = this.owner.eleckoiProductData.runtimeSessionId(conversationId)
    const channel = new TavernFunctionToolChannel()
    const entry = { sessionId, channel }
    this.channels.set(conversationId, entry)
    return { channel, close: error => {
      channel.close(error)
      if (this.channels.get(conversationId) === entry) this.channels.delete(conversationId)
      for (const [agent, bucket] of this.installed) if (bucket.channel === channel) this.clear(agent)
    } }
  }

  async collectPrompts(conversationId: string, requestId: string, signal: AbortSignal, preview = false): Promise<TavernMainPromptContribution[]> {
    signal.throwIfAborted()
    const entry = this.channels.get(conversationId)
    if (!entry) return []
    const answer = await entry.channel.request({ kind: 'prompts', id: randomUUID(), requestId, preview }, signal)
    signal.throwIfAborted()
    if (answer.kind !== 'prompts') throw new Error('Prompt collector did not return prompt contributions.')
    return answer.contributions
  }

  /** Freeze native card text using the already connected browser macro runtime. */
  async resolvePromptTexts(conversationId: string, requestId: string, texts: TavernPromptText[], signal: AbortSignal,
    preview = false): Promise<string[] | undefined> {
    signal.throwIfAborted()
    const entry = this.channels.get(conversationId)
    if (!entry) return undefined
    const answer = await entry.channel.request({ kind: 'prompt-texts', id: randomUUID(), requestId, preview, texts }, signal)
    signal.throwIfAborted()
    if (answer.kind !== 'prompt-texts' || answer.texts.length !== texts.length) throw new Error('Group card macro batch returned a different shape.')
    return answer.texts
  }

  async worldbookEvent(conversationId: string, requestId: string, eventKey: string, eventName: TavernWorldbookEventName,
    payload: unknown, signal: AbortSignal, preview = false): Promise<unknown> {
    signal.throwIfAborted()
    const entry = this.channels.get(conversationId)
    if (!entry) return payload
    const answer = await entry.channel.request({ kind: 'worldbook-event', id: randomUUID(), requestId,
      eventKey, eventName, payloadJson: JSON.stringify(payload), preview }, signal)
    signal.throwIfAborted()
    if (answer.kind !== 'worldbook-event') throw new Error('Worldbook scan callback returned the wrong response.')
    return JSON.parse(answer.payloadJson)
  }

  async releasePrompts(conversationId: string, requestId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const entry = this.channels.get(conversationId)
    if (!entry) return
    const answer = await entry.channel.request({ kind: 'release-prompts', id: randomUUID(), requestId }, signal)
    if (answer.kind !== 'released-prompts') throw new Error('Prompt collector did not release the frozen request.')
  }

  private clear(agent: Agent): void {
    const bucket = this.installed.get(agent)
    this.installed.delete(agent)
    bucket?.disposers.forEach(dispose => dispose())
  }

  private async prepare(agent: Agent, signal: AbortSignal): Promise<void> {
    const entry = [...this.channels.values()].find(value => value.sessionId === agent.session.id)
    if (!entry) { this.clear(agent); return }
    const answer = await entry.channel.request({ kind: 'prepare', id: randomUUID() }, signal)
    signal.throwIfAborted()
    if (![...this.channels.values()].includes(entry)) throw new Error('Function tool callback page disconnected during preparation.')
    if (answer.kind !== 'prepared') throw new Error('Function tool declarations were not prepared.')
    this.clear(agent)
    const bucket = { channel: entry.channel, names: new Set(answer.tools.map(tool => tool.name)), disposers: [] as Array<() => void> }
    this.installed.set(agent, bucket)
    try {
      bucket.disposers.push(registerAuthorToolNames(agent.ctx, answer.tools.map(tool => tool.name)))
      for (const definition of answer.tools) bucket.disposers.push(this.register(agent, entry.channel, definition))
    } catch (error) { this.clear(agent); throw error }
  }

  private register(agent: Agent, channel: TavernFunctionToolChannel, definition: TavernFunctionToolDefinition): () => void {
    return agent.ctx.tools.register({
      name: definition.name, description: definition.description, parameters: definition.parameters,
      output: { schema: {}, render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] },
      execute: async (args, exec) => {
        const answer = await channel.request({ kind: 'invoke', id: randomUUID(), token: definition.token,
          argumentsJson: JSON.stringify(args), callId: String(exec.callId) }, exec.signal)
        exec.signal.throwIfAborted()
        if (answer.kind !== 'result') throw new Error('Function tool callback did not return a result.')
        const value: unknown = JSON.parse(answer.valueJson)
        if (definition.stealth) exec.concludeTurn()
        return value
      },
    })
  }
}
