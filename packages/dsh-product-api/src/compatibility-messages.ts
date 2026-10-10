import { randomUUID } from 'node:crypto'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { CompatibilityCommand, CompatibilityChange, CompatibilityValue, ElecKoiProductDataStore } from './types.js'
import { json, object, requiredText, requiredValue, text, type CompatibilityHandler } from './compatibility-catalog.js'

type ObjectValue = { [key: string]: CompatibilityValue }
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    CONTEXT_UNAVAILABLE: { conversationId: string }
  }
}
export interface CompatibilityTimelineInput {
  id: string; role: 'user' | 'assistant' | 'system'; content: string; sessionEventSeq?: number; reasoning?: string
}
export interface CompatibilityMessageServices {
  inspect(sessionId: string): Promise<{ events: readonly unknown[] }>
  mutate(sessionId: string, changes: { updates?: CompatibilityTimelineInput[]; inserts?: CompatibilityTimelineInput[] }): Promise<CompatibilityTimelineInput[]>
  updateOpening(conversationId: string, content: string): unknown
}
export const COMPATIBILITY_MESSAGE_METHODS = ['messages.read', 'messages.list', 'messages.get', 'messages.current',
  'messages.update', 'messages.refresh', 'messages.insert', 'messages.delete', 'messages.replace', 'messages.rotate', 'messages.swipes'] as const

/** Message bodies stay in DSH; companion rows retain presentation/extension/candidate state. */
export class CompatibilityMessageOperations {
  readonly handlers: ReadonlyMap<string, CompatibilityHandler>
  constructor(private readonly data: ElecKoiProductDataStore, private readonly services: CompatibilityMessageServices,
    private readonly publish: (change: CompatibilityChange) => void) {
    this.handlers = new Map(COMPATIBILITY_MESSAGE_METHODS.map(method => [method, params => this.invoke({ method, params })]))
  }
  private get store() { return this.data.compatibilityStore() }
  private chat(p: ObjectValue): string { const id = requiredText(p, 'conversationId'); this.data.readConversationDetails(id); return id }
  private metadata(chat: string, id: string): ObjectValue { return object(this.store.get(`metadata:${chat}`, id)) }
  private extensions(chat: string, id: string): ObjectValue { return object(this.store.get(`message-extensions:${chat}`, id)) }
  private state(chat: string): ObjectValue { return object(this.store.get(`message-presentation:${chat}`, 'timeline')) }
  /** Shared request ordering seam: caller must retain non-chat Agent/tool messages. */
  async requestHistory(conversationId: string): Promise<ObjectValue[]> {
    return (await this.read(conversationId)).filter(message => object(message.metadata).is_hidden !== true)
      .map(message => ({ ...message, sessionEventSeq: message.sessionEventSeq ?? null }))
  }
  async read(chat: string, includeDeleted = false): Promise<ObjectValue[]> {
    const details = this.data.readConversationDetails(chat), sessionId = this.data.runtimeSessionId(chat)
    const { events } = await this.services.inspect(sessionId)
    const finalByTurn = new Map<number, number>()
    for (const candidate of events) {
      const event = object(candidate), data = object(event.data)
      if (event.type === 'assistant/message' && event.surfaceOp === 'append') finalByTurn.set(Number(data.turn), Number(event.seq))
    }
    const messages: ObjectValue[] = details.messages.filter(message => message.id === 'opening').map(message => ({
      ...json(message) as ObjectValue, ...this.extensions(chat, message.id), id: message.id, role: message.role, content: message.content ?? '', createdAt: message.createdAt,
      name: details.metadata.characterName, metadata: this.metadata(chat, message.id), conversationId: chat }))
    for (const candidate of events) {
      const event = object(candidate), data = object(event.data)
      if (event.surfaceOp !== 'append') continue
      const message = object(event.type === 'user/message' ? data : data.message), marker = object(message.eleckoiCompatibility)
      if (event.type === 'user/message' && object(data.source).kind !== 'user' && marker.pluginInserted !== true) continue
      if (event.type === 'assistant/message' && finalByTurn.get(Number(data.turn)) !== Number(event.seq) && marker.pluginInserted !== true) continue
      if (event.type !== 'user/message' && event.type !== 'assistant/message' && !(event.type === 'system/message' && marker.pluginInserted === true)) continue
      const role = text(marker.role) || text(message.role)
      const importedBinding = object(this.store.get(`migration:android:message-bindings:${chat}`, `${sessionId}:${event.seq}`))
      const native = details.messages.find(item => item.sessionEventSeq === event.seq || (item.dshMessageId && item.dshMessageId === message.id) || item.id === importedBinding.id)
      const id = text(marker.id) || native?.id || text(importedBinding.id) || text(message.id) || `dsh-${sessionId}-${event.seq}-${role}`
      const metadata = this.metadata(chat, id)
      const content = Array.isArray(message.content) ? message.content.map(block => { const part = object(block); return part.type === 'text' ? text(part.text) : '' }).join('') : ''
      const time = Number(event.time)
      const attachments = object(marker.attachments), legacy = marker.androidTranscriptImport === true
      messages.push({ images: [], ...json(native ?? {}) as ObjectValue, ...this.extensions(chat, id), id, conversationId: chat, runtimeSessionId: sessionId, role, content, reasoning: text(marker.reasoning),
        ...(legacy ? { inputImageAttachments: attachments.images ?? [], inputFileAttachments: attachments.files ?? [] } : {}),
        name: text(metadata.name) || (role === 'user' ? this.data.readPersona().user_name : details.metadata.characterName),
        speakerId: text(metadata.speakerId), createdAt: legacy && text(marker.createdAt) ? text(marker.createdAt) : Number.isFinite(time) ? new Date(time).toISOString() : '',
        pending: false, sessionEventSeq: event.seq!, dshMessageId: message.id ?? '', metadata })
    }
    const state = this.state(chat), deleted = new Set(array(state.deleted ?? []).map(value => text(value)))
    const active = includeDeleted ? messages : messages.filter(message => !deleted.has(text(message.id)))
    const order = array(state.order ?? []).map(value => text(value)), orderIndex = new Map(order.map((id, index) => [id, index]))
    active.sort((left, right) => (orderIndex.get(text(left.id)) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(text(right.id)) ?? Number.MAX_SAFE_INTEGER))
    return active.map((message, index) => {
      const choices = this.choices(chat, message, {}), selected = Number(choices.swipe_id), infos = array(choices.swipes_info)
      const extra = { ...object(object(message.metadata).extra), ...object(object(infos[selected]).extra) }
      const count = array(choices.swipes).length
      return { ...message, messageIndex: index, sequence: message.sessionEventSeq ?? index, ...choices,
        metadata: { ...object(message.metadata), extra }, reasoning: text(extra.reasoning) || text(message.reasoning),
        variables: Array.from({ length: count }, (_, swipe) => this.store.get(`variables:message:${chat}:${message.id}`, `state:${swipe}`)
          ?? (swipe === 0 ? this.store.get(`variables:message:${chat}:${message.id}`, 'state') : null) ?? {}) }
    })
  }
  private choices(chat: string, current: ObjectValue, input: ObjectValue): ObjectValue {
    const old = object(this.store.get(`swipes:${chat}`, text(current.id)))
    const swipes = [...array(input.swipes ?? old.swipes ?? [current.content ?? ''])]
    if (!swipes.length || swipes.some(value => typeof value !== 'string')) throw new TypeError('Message candidates must be a nonempty string array')
    const selected = Number(input.swipe_id ?? old.swipe_id ?? 0)
    if (!Number.isInteger(selected) || selected < 0 || selected >= swipes.length) throw new RangeError(`Message candidate out of range: ${selected}`)
    if (input.content !== undefined) swipes[selected] = input.content
    const oldInfos = array(old.swipes_info ?? []), supplied = array(input.swipes_info ?? object(input.metadata).swipes_info ?? [])
    const infos = swipes.map((_, index) => supplied[index] ?? oldInfos[index] ?? { extra: { reasoning: index === Number(old.swipe_id ?? 0) ? current.reasoning ?? '' : '' } })
    const info = object(infos[selected]), extra = { ...object(info.extra), ...object(object(input.metadata).extra) }
    if (input.reasoning !== undefined) extra.reasoning = input.reasoning
    infos[selected] = { ...info, extra }
    return { swipes, swipe_id: selected, swipes_info: infos }
  }
  private saveState(chat: string, current: ObjectValue, input: ObjectValue, choices: ObjectValue): void {
    const id = text(current.id), previous = object(this.store.get(`swipes:${chat}`, id)), before = array(previous.swipes ?? [])
    if (typeof current.sessionEventSeq === 'number') this.store.put(`message-bindings:${chat}`,
      `${this.data.runtimeSessionId(chat)}:${current.sessionEventSeq}`, { id, role: role(input.role ?? current.role) })
    const after = array(choices.swipes), oldInfos = array(previous.swipes_info ?? []), newInfos = array(choices.swipes_info)
    const scope = `variables:message:${chat}:${id}`
    if (before.length && JSON.stringify(before) !== JSON.stringify(after)) {
      const states = this.store.list(scope), available = new Set(before.map((_, index) => index))
      const mappings = after.map((content, index) => {
        const matches = [...available].filter(prior => before[prior] === content)
        const source = matches.find(prior => JSON.stringify(oldInfos[prior]) === JSON.stringify(newInfos[index])) ?? (matches.length === 1 ? matches[0] : undefined)
        if (source !== undefined) available.delete(source)
        return source
      })
      for (const key of Object.keys(states).filter(key => key.startsWith('state:'))) this.store.delete(scope, key)
      mappings.forEach((prior, index) => { if (prior !== undefined && states[`state:${prior}`] !== undefined) this.store.put(scope, `state:${index}`, states[`state:${prior}`]!) })
    }
    const selected = Number(choices.swipe_id), metadata = { ...this.metadata(chat, id), ...object(input.metadata),
      ...input.name !== undefined ? { name: input.name } : {}, ...input.speakerId !== undefined ? { speakerId: input.speakerId } : {},
      extra: object(newInfos[selected]).extra ?? {} }
    this.store.put(`metadata:${chat}`, id, metadata); this.store.put(`swipes:${chat}`, id, choices)
    const extension = Object.fromEntries(Object.entries(input).filter(([key]) => !MESSAGE_OWNED_FIELDS.has(key))) as ObjectValue
    this.store.put(`message-extensions:${chat}`, id, { ...this.extensions(chat, id), ...extension })
    const supplied = input.swipes_data ?? object(input.metadata).swipes_data
    if (supplied !== undefined) array(supplied).forEach((value, index) => { if (index < after.length) this.store.put(scope, `state:${index}`, value) })
    if (object(input.metadata).data !== undefined) this.store.put(scope, `state:${selected}`, object(input.metadata).data!)
    for (const key of Object.keys(this.store.list(scope))) if (key.startsWith('state:') && Number(key.slice(6)) >= after.length) this.store.delete(scope, key)
  }
  private changed(chat: string, operation: string, ids: string[], p: ObjectValue): void {
    const refresh = text(p.refresh) || 'affected'
    if (!['none', 'affected', 'all'].includes(refresh)) throw new Error(`Unknown message refresh mode: ${refresh}`)
    this.publish({ event: 'messages.changed', payload: { conversationId: chat, operation, ids, messageIds: ids, refresh,
      sessionRewritten: p.sessionRewritten === true,
      ...(p.beforeMessages !== undefined ? { beforeMessages: p.beforeMessages } : {}),
      presentationOwner: text(p.presentationOwner) || text(p.pluginId) || 'frontend' } })
  }
  private async update(chat: string, inputs: ObjectValue[], p: ObjectValue, includeDeleted = false): Promise<ObjectValue[]> {
    const current = await this.read(chat, includeDeleted), changes: Array<{ current: ObjectValue; input: ObjectValue; choices: ObjectValue; mutation: CompatibilityTimelineInput }> = []
    for (const input of inputs) {
      const target = current.find(message => message.id === input.id)
      if (!target) throw new Error(`Message does not exist in this conversation: ${text(input.id)}`)
      if (input.expectedContent !== undefined && input.expectedContent !== target.content) throw new Error(`Message changed during update: ${input.id}`)
      const choices = this.choices(chat, target, input), selected = Number(choices.swipe_id)
      changes.push({ current: target, input, choices, mutation: { id: text(target.id), role: role(input.role ?? target.role),
        content: text(array(choices.swipes)[selected]), reasoning: text(object(object(array(choices.swipes_info)[selected]).extra).reasoning),
        ...typeof target.sessionEventSeq === 'number' ? { sessionEventSeq: target.sessionEventSeq } : {} } })
    }
    const opening = changes.find(change => change.current.id === 'opening')
    if (opening) this.services.updateOpening(chat, opening.mutation.content)
    // Candidate/metadata registration can describe the reply already committed
    // by the native Agent. Retiring that Session for an identical body would
    // close its official binding before the sidecar can be persisted.
    const ordinary = changes.filter(change => change.current.id !== 'opening'
      && (change.mutation.content !== text(change.current.content)
        || change.mutation.reasoning !== text(change.current.reasoning)
        || change.mutation.role !== role(change.current.role)))
    if (ordinary.length) await this.services.mutate(this.data.runtimeSessionId(chat), { updates: ordinary.map(change => change.mutation) })
    this.store.atomic(() => {
      for (const change of changes) this.saveState(chat, change.current, change.input, change.choices)
      const last = current.at(-1), selectedLast = changes.find(change => change.current.id === last?.id && change.input.swipe_id !== undefined)
      if (selectedLast) {
        const scope = `variables:message:${chat}:${text(last!.id)}`, variables = this.store.get(scope, `state:${selectedLast.choices.swipe_id}`)
        if (variables !== null) this.data.replaceConversationVariableState(chat, JSON.stringify(variables))
      }
    })
    this.changed(chat, 'edit', inputs.map(input => text(input.id)), { ...p, sessionRewritten: ordinary.length > 0,
      beforeMessages: changes.map(change => change.current) })
    return this.read(chat)
  }
  async invoke({ method, params: p }: CompatibilityCommand): Promise<CompatibilityValue> {
    const chat = this.chat(p)
    if (p.refresh !== undefined && !['none', 'affected', 'all'].includes(text(p.refresh))) throw new Error(`Unknown message refresh mode: ${text(p.refresh)}`)
    switch (method) {
      case 'messages.read': case 'messages.list': return this.read(chat)
      case 'messages.get': { const id = requiredText(p, 'id'), message = (await this.read(chat)).find(item => item.id === id); if (!message) throw new Error(`Message does not exist: ${id}`); return message }
      case 'messages.current': {
        const message = (await this.read(chat)).at(-1)
        if (!message) throw new RemoteError('CONTEXT_UNAVAILABLE', 'Conversation has no messages', { conversationId: chat })
        return message
      }
      case 'messages.update': return this.update(chat, array(requiredValue(p, 'messages')).map(object), p)
      case 'messages.refresh': this.changed(chat, 'refresh', array(p.ids ?? []).map(value => text(value)), p); return null
      case 'messages.swipes': {
        const id = requiredText(p, 'id'), current = (await this.read(chat)).find(item => item.id === id)
        if (!current) throw new Error(`Message does not exist: ${id}`)
        const choices = this.choices(chat, current, p)
        if (['swipes', 'swipe_id', 'swipes_data', 'swipes_info'].some(key => p[key] !== undefined)) await this.update(chat, [{ ...p, id }], p)
        return choices
      }
      case 'messages.rotate': {
        const current = await this.read(chat), begin = integer(p.begin), middle = integer(p.middle), end = integer(p.end)
        if (begin < 0 || begin > middle || middle > end || end > current.length) throw new RangeError('Message rotation range is invalid')
        const reordered = [...current.slice(0, begin), ...current.slice(middle, end), ...current.slice(begin, middle), ...current.slice(end)]
        this.store.put(`message-presentation:${chat}`, 'timeline', { ...this.state(chat), order: reordered.map(message => message.id!) })
        this.changed(chat, 'rotate', current.slice(begin, end).map(message => text(message.id)), p); return this.read(chat)
      }
      case 'messages.delete': {
        const current = await this.read(chat), ids = array(requiredValue(p, 'ids')).map(value => text(value))
        if (ids.some(id => !current.some(message => message.id === id))) throw new Error('A message selected for deletion does not exist in this conversation')
        this.store.atomic(() => {
          const state = this.state(chat)
          this.store.put(`message-presentation:${chat}`, 'timeline', { ...state, deleted: [...new Set([...array(state.deleted ?? []), ...ids])],
            order: current.filter(message => !ids.includes(text(message.id))).map(message => message.id!) })
          for (const id of ids) this.deleteState(chat, id)
        })
        this.changed(chat, 'delete', ids, p); return this.read(chat)
      }
      case 'messages.insert': case 'messages.replace': {
        const persisted = await this.read(chat, true), deleted = new Set(array(this.state(chat).deleted ?? []).map(text))
        const current = persisted.filter(message => !deleted.has(text(message.id))), inputs = array(requiredValue(p, 'messages')).map(object)
        const expected = p.expected
        if (expected !== undefined && JSON.stringify(array(expected).map(value => { const item = object(value); return [item.id, item.content] }))
          !== JSON.stringify(current.map(message => [message.id, message.content]))) throw new Error('Conversation changed since the supplied snapshot')
        const newInputs: ObjectValue[] = inputs.map(input => ({ ...input, id: text(input.id) || randomUUID() }))
        const unique = new Set(newInputs.map(input => text(input.id)))
        if (unique.size !== newInputs.length) throw new Error('Duplicate message identities')
        const updates = newInputs.filter(input => persisted.some(message => message.id === input.id))
        if (method === 'messages.insert' && updates.length) throw new Error('Inserted message identity already exists')
        const additions = newInputs.filter(input => !persisted.some(message => message.id === input.id))
        const inserts = additions.map(input => ({ id: text(input.id), role: role(input.role), content: text(input.content), reasoning: text(input.reasoning) }))
        const staged = additions.map(input => ({ current: { ...input, role: role(input.role), content: text(input.content) } as ObjectValue, input,
          choices: this.choices(chat, input, input) }))
        for (const candidate of staged) { const selected = Number(candidate.choices.swipe_id); const insert = inserts.find(item => item.id === candidate.input.id)!; insert.content = text(array(candidate.choices.swipes)[selected]) }
        const index = p.index === undefined ? current.length : integer(p.index)
        if (index < 0 || index > current.length) throw new RangeError('Message insertion index is invalid')
        if (updates.length) await this.update(chat, updates, { ...p, refresh: 'none' }, true)
        if (inserts.length) {
          const inserted = await this.services.mutate(this.data.runtimeSessionId(chat), { inserts })
          for (const candidate of staged) {
            const saved = inserted.find(message => message.id === candidate.input.id)
            if (!saved || typeof saved.sessionEventSeq !== 'number') throw new Error(`Inserted native message has no event sequence: ${candidate.input.id}`)
            candidate.current.sessionEventSeq = saved.sessionEventSeq
          }
        }
        this.store.atomic(() => {
          for (const candidate of staged) this.saveState(chat, candidate.current, candidate.input, candidate.choices)
          const state = this.state(chat)
          const order = method === 'messages.replace' ? newInputs.map(item => text(item.id))
            : [...current.slice(0, index).map(item => item.id!), ...additions.map(item => text(item.id)), ...current.slice(index).map(item => item.id!)]
          const removed = method === 'messages.replace' ? current.filter(message => !unique.has(text(message.id))).map(message => text(message.id)) : []
          this.store.put(`message-presentation:${chat}`, 'timeline', { ...state, order,
            deleted: [...new Set([...array(state.deleted ?? []).filter(id => !unique.has(text(id))), ...removed])] })
          removed.forEach(id => this.deleteState(chat, id))
        })
        this.changed(chat, method === 'messages.replace' ? 'replace' : 'insert', newInputs.map(input => text(input.id)), { ...p, sessionRewritten: inserts.length > 0 || updates.some(input => input.id !== 'opening') })
        return this.read(chat)
      }
      default: throw new Error(`Unknown message compatibility method: ${method}`)
    }
  }
  private deleteState(chat: string, id: string): void {
    this.store.delete(`metadata:${chat}`, id); this.store.delete(`swipes:${chat}`, id)
    this.store.delete(`message-extensions:${chat}`, id)
    this.store.deleteScope(`variables:message:${chat}:${id}`)
  }
}
const MESSAGE_OWNED_FIELDS = new Set(['id', 'conversationId', 'runtimeSessionId', 'role', 'content', 'reasoning', 'name', 'speakerId',
  'createdAt', 'pending', 'sessionEventSeq', 'dshMessageId', 'metadata', 'messageIndex', 'sequence', 'swipes', 'swipe_id',
  'swipes_info', 'swipes_data', 'variables', 'expectedContent', 'refresh', 'presentationOwner', 'pluginId'])
function array(value: CompatibilityValue | undefined): CompatibilityValue[] { if (!Array.isArray(value)) throw new TypeError('Expected a compatibility array'); return value }
function role(value: CompatibilityValue | undefined): 'user' | 'assistant' | 'system' {
  if (value !== 'user' && value !== 'assistant' && value !== 'system') throw new TypeError(`Invalid message role: ${text(value)}`)
  return value
}
function integer(value: CompatibilityValue | undefined): number { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError('Expected an integer'); return value }
