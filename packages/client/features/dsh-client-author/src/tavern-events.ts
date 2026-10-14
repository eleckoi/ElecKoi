import type { AuthorEventMap, AuthorEventName } from '@eleckoi/author-sdk'

export interface TavernEventMessage {
  id: string; role?: string; content?: string; reasoning?: string; sessionEventSeq?: number
}
type Emit = (event: string, ...args: unknown[]) => void

/** Projects actual Session and product mutation notifications, without owning a transcript. */
export class NativeTavernEvents {
  private selected = ''
  private messages: TavernEventMessage[] = []
  private readonly sent = new Set<string>()
  private readonly received = new Map<string, string>()
  private readonly ended = new Set<string>()
  private readonly processEnded = new Set<string>()

  constructor(private readonly emit: Emit) {}

  observe(conversationId: string, messages: TavernEventMessage[]): void {
    if (this.selected !== conversationId) {
      this.selected = conversationId; this.messages = structuredClone(messages)
      this.sent.clear(); this.received.clear(); this.ended.clear(); this.processEnded.clear()
      for (const message of messages) {
        if (message.role === 'user') this.sent.add(message.id)
        else this.received.set(message.id, message.content ?? '')
      }
      this.emit('chat_id_changed', conversationId); this.emit('chatLoaded', conversationId)
      return
    }
    for (const [index, message] of messages.entries()) if (message.role === 'user' && !this.sent.has(message.id)) {
      this.sent.add(message.id); this.emit('message_sent', index)
    }
  }

  accept<TName extends AuthorEventName>(event: TName, payload: AuthorEventMap[TName], messages: TavernEventMessage[]): void {
    if (payload.conversationId !== this.selected) return
    const index = (id: string) => messages.findIndex(message => message.id === id
      || /^\d+$/.test(id) && message.sessionEventSeq === Number(id))
    const received = (id: string, type: string) => {
      const position = index(id), message = messages[position]
      if (!message || this.received.get(message.id) === (message.content ?? '')) return
      this.received.set(message.id, message.content ?? ''); this.emit('message_received', position, type)
    }
    this.emit(event, structuredClone(payload))
    if (event === 'messages.changed') {
      const changed = payload as AuthorEventMap['messages.changed']
      if (changed.reason === 'deleted') {
        const removed = new Set(changed.messageIds)
        for (const message of this.messages) if (removed.has(message.id)
          || removed.has(String(message.sessionEventSeq))) {
          this.sent.delete(message.id); this.received.delete(message.id)
        }
        // ST emits one deletion notification with the accepted remaining length, including batch deletions.
        this.emit('message_deleted', messages.length)
      } else for (const id of changed.messageIds) {
        const position = index(id), message = messages[position]
        if (!message) continue
        if (changed.reason === 'sent') {
          if (message.role === 'user') {
            if (!this.sent.has(message.id)) { this.sent.add(message.id); this.emit('message_sent', position) }
          } else received(id, 'normal')
        } else {
          this.emit(changed.reason === 'regenerated' ? 'message_swiped' : 'message_edited', position)
          const prior = this.messages.find(value => value.id === message.id)
          if (prior?.reasoning !== message.reasoning) this.emit(message.reasoning ? 'message_reasoning_edited' : 'message_reasoning_deleted', position)
        }
        this.emit('message_updated', position)
      }
      this.messages = structuredClone(messages)
    } else if (event === 'agent.state.changed') {
      const changed = payload as AuthorEventMap['agent.state.changed']
      if (changed.state === 'starting') this.emit('generation_started', 'normal', structuredClone(payload), false)
    } else if (event === 'agent.output.delta') {
      const output = payload as AuthorEventMap['agent.output.delta']
      this.emit('stream_token_received', output.accumulated)
    } else if (event === 'agent.process.updated') {
      const process = payload as AuthorEventMap['agent.process.updated'], item = process.item
      const key = `${process.generationId}:${item.id}`
      if (item.status !== 'complete' || this.processEnded.has(key)) return
      this.processEnded.add(key)
      if (item.kind === 'reasoning' && item.status === 'complete') this.emit('stream_reasoning_done', item.detail,
        item.completedAtMillis === undefined ? null : (item.completedAtMillis - item.startedAtMillis) / 1000, index(process.messageId), 'done')
      if (item.kind === 'tool' && item.status === 'complete') this.emit('tool_calls_performed', [{ id: item.id,
        name: item.toolName, parameters: item.arguments, result: item.detail }])
    } else if (event === 'agent.run.finished' || event === 'agent.run.cancelled' || event === 'agent.run.failed') {
      const finish = payload as AuthorEventMap['agent.run.finished'] | AuthorEventMap['agent.run.cancelled'] | AuthorEventMap['agent.run.failed']
      if (this.ended.has(finish.generationId)) return
      this.ended.add(finish.generationId)
      const messageId = 'message' in finish ? typeof finish.message === 'object' ? finish.message?.id ?? '' : '' : finish.messageId
      if (event === 'agent.run.finished' && 'message' in finish && finish.message) received(messageId, 'normal')
      if (event === 'agent.run.cancelled') this.emit('generation_stopped')
      this.emit('generation_ended', index(messageId)); this.messages = structuredClone(messages)
    }
  }
}

/** A message iframe identifies its own realm, and always reports start before end. */
export function observeMessageIframe(page: Window, ready: Promise<void>, emit: Emit, report: (error: unknown) => void): void {
  let active = true, rendered = false, started = false, ended = false
  const finish = () => {
    if (!active || !started || !rendered || ended) return
    ended = true; emit('message_iframe_render_ended', page.name)
  }
  const finished = () => { rendered = true; finish() }
  const closed = () => { active = false; page.removeEventListener('eleckoi:author-document-ready', finished) }
  page.addEventListener('eleckoi:author-document-ready', finished, { once: true })
  page.addEventListener('pagehide', closed, { once: true })
  void ready.then(() => {
    if (!active) return
    started = true; emit('message_iframe_render_started', page.name); finish()
  }).catch(error => { if (active) report(error) })
}
