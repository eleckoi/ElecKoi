import { randomUUID } from 'node:crypto'
import type { CompatibilityValue, CompatibilityChange, ElecKoiProductDataStore, ConversationCreateInput, ConversationDetailsMetadata } from './types.js'
import { object, text, requiredText, json, type CompatibilityHandler, type CompatibilityCatalogOperations } from './compatibility-catalog.js'
import type { CompatibilityMessageOperations } from './compatibility-messages.js'

type Document = { [key: string]: CompatibilityValue }
export const CHAT_COMPATIBILITY_METHODS = ['chats.list', 'chats.history', 'chats.create', 'chats.import', 'chats.export',
  'chats.rename', 'chats.branch', 'chats.deleteStored', 'chats.temporary', 'groups.list', 'groups.get', 'groups.put',
  'groups.delete', 'groups.createChat', 'groups.bind'] as const
export interface CompatibilityChatServices {
  create(input: ConversationCreateInput): Promise<ConversationDetailsMetadata>
  delete(id: string): Promise<void>
  rename(id: string, title: string): Promise<ConversationDetailsMetadata>
  fork(sourceId: string, atSeq: number | undefined, retainedTurnIds: string[], title: string): Promise<string>
  exportArchive(id: string): Promise<string>
  importArchive(characterId: string, content: string): Promise<string>
  callback(method: string, payload: Document, conversationId: string, clientId?: string): Promise<CompatibilityValue>
}

/** Chats stay in the product repository and official Session. Groups only add ownership/round selection. */
export class CompatibilityChatOperations {
  readonly handlers: ReadonlyMap<string, CompatibilityHandler>
  constructor(private readonly data: ElecKoiProductDataStore, private readonly catalog: CompatibilityCatalogOperations,
    private readonly messages: CompatibilityMessageOperations, private readonly services: CompatibilityChatServices,
    private readonly publish: (change: CompatibilityChange) => void) {
    this.handlers = new Map(CHAT_COMPATIBILITY_METHODS.map(method => [method, p => this.invoke(method, p)]))
  }
  private get store() { return this.data.compatibilityStore() }
  group(id: string): Document { const group = this.store.get('groups', id); if (!group) throw new Error(`Group does not exist: ${id}`); return object(group) }
  current(chat: string): string { return text(this.store.get('group-bindings', chat)) }
  speaker(chat: string): string { return text(object(this.store.get('group-rounds', chat)).characterId) }
  private change(event: string, payload: CompatibilityValue) { this.publish({ event, payload }) }
  private chat(p: Document) { const id = text(p.conversationId) || requiredText(p, 'id'); this.data.readConversationDetails(id); return id }
  bind(chat: string, id: string) {
    this.data.readConversationDetails(chat)
    const group = this.group(id)
    this.store.atomic(() => {
      const old = this.current(chat)
      if (old && old !== id) this.unbind(chat)
      this.store.put('group-bindings', chat, id)
      this.store.put('groups', id, { ...group, chats: [...new Set([...array(group.chats ?? []), chat])], chat_id: chat })
    })
  }
  unbind(chat: string) {
    const id = this.current(chat)
    if (id) {
      const group = this.group(id), chats = array(group.chats ?? []).filter(value => value !== chat)
      this.store.put('groups', id, { ...group, chats, chat_id: chats.at(-1) ?? null })
    }
    this.store.delete('group-bindings', chat); this.store.delete('group-rounds', chat)
  }
  select(chat: string, characterId: string) {
    const id = this.current(chat), card = this.catalog.raw(characterId)
    if (!array(this.group(id).members).includes(card.avatar!)) throw new Error(`Character is not a member of group ${id}: ${characterId}`)
    this.store.put('group-rounds', chat, { ...object(this.store.get('group-rounds', chat)), characterId })
    this.change('groups.speakerChanged', { conversationId: chat, groupId: id, characterId })
  }
  async beginRound(chat: string, input: string) {
    if (!this.current(chat)) return
    const selected = await this.services.callback('__ElecKoiGroupRound', { conversationId: chat, input }, chat)
    const ids = array(selected).map(value => { if (typeof value !== 'string') throw new TypeError('Group speaker must be a character id'); this.catalog.raw(value); return value })
    this.store.put('group-rounds', chat, { input, remaining: ids.slice(1), characterId: ids[0] ?? '', started: true })
    this.change('groups.roundStarted', { conversationId: chat, groupId: this.current(chat) })
    if (ids[0]) this.select(chat, ids[0])
    return ids
  }
  next(chat: string): { characterId: string; input: string } | null {
    const round = object(this.store.get('group-rounds', chat)), remaining = array(round.remaining ?? [])
    if (!remaining.length) return null
    const characterId = text(remaining[0]); this.select(chat, characterId)
    this.store.put('group-rounds', chat, { ...object(this.store.get('group-rounds', chat)), remaining: remaining.slice(1) })
    return { characterId, input: text(round.input) }
  }
  finish(chat: string) {
    if (this.store.get('group-rounds', chat) === null) return
    this.store.delete('group-rounds', chat)
    this.change('groups.roundFinished', { conversationId: chat, groupId: this.current(chat) })
  }
  async annotateReply(chat: string) {
    const characterId = this.speaker(chat)
    if (!characterId) return
    const card = this.catalog.raw(characterId), last = (await this.messages.read(chat)).findLast(message => message.role === 'assistant')
    if (!last) return
    this.store.put(`metadata:${chat}`, text(last.id), { ...object(last.metadata), name: card.name!, speakerId: characterId,
      original_avatar: card.avatar!, avatar: card.avatar_path! })
    this.change('messages.changed', { conversationId: chat, ids: [last.id!], refresh: 'affected', operation: 'speaker' })
  }
  async groupPrompts(chat: string): Promise<Document | null> {
    if (!this.current(chat) || !this.speaker(chat)) return null
    return object(await this.services.callback('__ElecKoiGroupPrompts', { conversationId: chat }, chat))
  }
  async create(characterId: string, title = '', groupId = '') {
    const card = characterId ? this.catalog.raw(characterId) : null
    const created = await this.services.create({ title, ...(card ? { metadata: { characterId: text(card.native_id) } } : {}) })
    const id = created.conversation.id
    if (groupId) this.bind(id, groupId)
    this.change('chats.created', { id, conversationId: id, characterId: characterId || null, groupId: groupId || null })
    return id
  }
  async invoke(method: string, p: Document): Promise<CompatibilityValue> {
    switch (method) {
      case 'chats.list': return json(this.data.readConversationCatalog())
      case 'chats.history': {
        const entries = this.data.readConversationCatalog().filter(item => p.isGroupChat === true ? !!this.current(item.id) : !this.current(item.id))
        const files = Array.isArray(p.files) ? p.files.map(value => typeof value === 'string' ? value : text(object(value).file_name)) : null
        const result: Document = {}
        for (const item of entries) {
          if (files && !files.includes(item.id) && !files.includes(`${item.id}.jsonl`)) continue
          const messages = await this.messages.read(item.id), last = messages.at(-1)
          result[item.id] = { file_name: item.id, chat_items: messages.length, mes: text(last?.content), last_mes: last?.createdAt ?? item.updatedAt,
            chat_size: Buffer.byteLength(messages.map(message => text(message.content)).join('\n')), name: item.title }
        }
        return result
      }
      case 'chats.create': return this.create(requiredText(p, 'characterId'), text(p.title))
      case 'chats.temporary': { const id = await this.create('', text(p.title) || '临时对话'); this.store.put('temporary-chats', id, true); return id }
      case 'chats.deleteStored': { const id = this.chat(p), groupId = this.current(id); await this.services.delete(id); this.unbind(id); this.removeCompanions(id); this.change('chats.deleted', { id, groupId: groupId || null }); return true }
      case 'chats.rename': {
        const id = this.chat(p), details = this.data.readConversationDetails(id), name = requiredText(p, 'name')
        await this.services.rename(id, name)
        this.change('chats.renamed', { id, name, oldName: details.conversation.title, oldTitle: details.conversation.title, newTitle: name, groupId: this.current(id) || null,
          avatarId: details.metadata.characterId ? this.catalog.raw(details.metadata.characterId).avatar ?? null : null }); return true
      }
      case 'chats.import': return this.importChat(requiredText(p, 'characterId'), text(p.filename), requiredText(p, 'content'))
      case 'chats.export': {
        const id = this.chat(p)
        if (p.format === 'eleckoi') return this.services.exportArchive(id)
        const details = this.data.readConversationDetails(id)
        const header = { ...object(this.store.get('chat-import-headers', id)), user_name: details.metadata.characterPersona.user_name,
          character_name: details.metadata.characterName, create_date: details.conversation.createdAt, chat_metadata: object(this.store.get(`metadata:${id}`, 'chat')) }
        const entries = (await this.messages.read(id)).map(message => ({ ...object(message.metadata), mes: message.content, name: message.name,
          role: message.role, is_user: message.role === 'user', is_system: object(message.metadata).is_hidden === true || message.role === 'system',
          swipes: message.swipes, swipe_id: message.swipe_id, swipes_info: message.swipes_info, reasoning: message.reasoning, variables: message.variables }))
        return [header, ...entries].map(value => JSON.stringify(value)).join('\n') + '\n'
      }
      case 'chats.branch': {
        const source = this.chat(p), history = await this.messages.read(source), index = Number(p.index)
        if (!Number.isSafeInteger(index) || index < 0 || index >= history.length) throw new RangeError(`Branch message index does not exist: ${index}`)
        const target = history[index]!, retained = history.slice(0, index + 1), before = this.data.readConversationDetails(source)
        const title = text(p.title) || `${before.conversation.title} - ${p.checkpoint ? 'Checkpoint' : 'Branch'} ${new Date().toISOString()}`
        const id = await this.services.fork(source, typeof target.sessionEventSeq === 'number' ? target.sessionEventSeq : undefined,
          retained.map(message => text(message.turnId) || text(message.id)), title)
        this.store.atomic(() => {
          const sourcePresentation = object(this.store.get(`message-presentation:${source}`, 'timeline'))
          this.store.put(`message-presentation:${id}`, 'timeline', { ...sourcePresentation,
            order: retained.map(message => message.id!), deleted: array(sourcePresentation.deleted ?? []).filter(value => !retained.some(message => message.id === value)) })
          this.store.put(`metadata:${id}`, 'chat', { ...object(this.store.get(`metadata:${source}`, 'chat')), main_chat: before.conversation.title, eleckoi_parent_chat_id: source })
          for (const scope of ['chat-import-headers', 'worldbook-timing', 'worldbook-scans', 'conversation-personas']) {
            const value = this.store.get(scope, source); if (value !== null) this.store.put(scope, id, value)
          }
          for (const key of [`chat:${source}`]) { const value = this.store.get('bindings', key); if (value !== null) this.store.put('bindings', `chat:${id}`, value) }
          for (const message of retained) {
            const messageId = text(message.id)
            for (const scope of ['metadata', 'swipes', 'message-extensions']) {
              const value = this.store.get(`${scope}:${source}`, messageId); if (value !== null) this.store.put(`${scope}:${id}`, messageId, value)
            }
            for (const [key, value] of Object.entries(this.store.list(`variables:message:${source}:${messageId}`))) this.store.put(`variables:message:${id}:${messageId}`, key, value)
          }
          if (p.checkpoint) {
            const metadata = object(this.store.get(`metadata:${source}`, text(target.id)))
            this.store.put(`metadata:${source}`, text(target.id), { ...metadata, extra: { ...object(metadata.extra), bookmark_link: title, eleckoi_checkpoint_chat_id: id } })
          }
        })
        if (this.current(source)) this.bind(id, this.current(source))
        this.change('chats.created', { id, conversationId: id, groupId: this.current(id) || null }); return { id, conversationId: id, title }
      }
      case 'groups.list': return Object.values(this.store.list('groups'))
      case 'groups.get': return this.group(requiredText(p, 'id'))
      case 'groups.put': {
        const input = object(p.group), id = text(input.id) || randomUUID(), previous = object(this.store.get('groups', id)), group = { ...previous, ...input }
        const members = array(group.members); for (const member of members) this.catalog.raw(text(member))
        const result = { name: 'Group', chats: [], disabled_members: [], activation_strategy: 0, generation_mode: 0, ...group, id }
        this.store.put('groups', id, result); this.change('groups.changed', result); return result
      }
      case 'groups.delete': {
        const id = requiredText(p, 'id'); if (this.store.get('groups', id) === null) return false
        for (const [chat, groupId] of Object.entries(this.store.list('group-bindings'))) if (groupId === id) this.unbind(chat)
        this.store.delete('groups', id); this.change('groups.deleted', { id }); return true
      }
      case 'groups.bind': this.bind(this.chat(p), requiredText(p, 'id')); return null
      case 'groups.createChat': {
        const groupId = requiredText(p, 'id'), group = this.group(groupId), members = array(group.members)
        if (!members.length) throw new Error('An empty group cannot create a conversation')
        const cards = members.map(value => this.catalog.raw(text(value))), id = await this.create(text(cards[0]!.native_id), text(p.title) || text(group.name), groupId)
        try {
          const openings = []
          for (const card of cards) {
            const content = await this.services.callback('__ElecKoiGroupOpening', { conversationId: id, character: card }, id, text(p.clientId) || undefined)
            if (text(content)) openings.push({ role: 'assistant', content, name: card.name!, speakerId: card.native_id!, metadata: { original_avatar: card.avatar! } })
          }
          await this.messages.invoke({ method: 'messages.replace', params: { conversationId: id, messages: openings } })
          return id
        } catch (error) { await this.services.delete(id); this.unbind(id); throw error }
      }
      default: throw new Error(`Unknown chat compatibility method: ${method}`)
    }
  }
  private async importChat(characterId: string, filename: string, content: string): Promise<Document> {
    if (/^\s*\{/.test(content)) {
      try {
        const value = JSON.parse(content)
        if (value.format === 'eleckoi.desktop-chat-history') return { conversationId: await this.services.importArchive(characterId, content) }
      } catch (error) { if (!(error instanceof SyntaxError)) throw error }
    }
    const parsed = content.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line) as CompatibilityValue)
    const values = parsed.length === 1 && Array.isArray(parsed[0]) ? parsed[0] : parsed
    const first = object(values[0]), hasHeader = !('mes' in first || 'message' in first || 'content' in first), header = hasHeader ? first : {}
    const entries = (hasHeader ? values.slice(1) : values).map(object), id = await this.create(characterId, filename.replace(/\.jsonl?$/i, ''))
    try {
      const supplied = entries.map(value => ({ ...value, role: value.role ?? (value.is_user ? 'user' : object(value.extra).type === 'narrator' ? 'system' : 'assistant'),
        content: value.mes ?? value.message ?? value.content ?? '', reasoning: value.reasoning ?? object(value.extra).reasoning ?? '',
        metadata: { ...value, is_hidden: value.is_hidden ?? value.is_system ?? false } }))
      const messages = await this.messages.invoke({ method: 'messages.replace', params: { conversationId: id, messages: supplied } })
      this.store.put('chat-import-headers', id, header)
      this.store.put(`metadata:${id}`, 'chat', object(header.chat_metadata))
      entries.forEach((entry, index) => {
        const message = object(array(messages)[index]), vars = entry.variables
        if (vars !== undefined) (Array.isArray(vars) ? vars : [vars]).forEach((value, swipe) => this.store.put(`variables:message:${id}:${message.id}`, `state:${swipe}`, value))
      })
      return { conversationId: id, messageCount: array(messages).length }
    } catch (error) { await this.services.delete(id); this.removeCompanions(id); throw error }
  }
  private removeCompanions(id: string) {
    for (const prefix of [`metadata:${id}`, `swipes:${id}`, `message-extensions:${id}`, `message-presentation:${id}`, `variables:message:${id}:`]) {
      for (const scope of this.store.scopes(prefix)) if (scope === prefix || scope.startsWith(prefix.endsWith(':') ? prefix : prefix + ':')) this.store.deleteScope(scope)
    }
    for (const scope of ['temporary-chats', 'chat-import-headers', 'worldbook-timing', 'worldbook-scans', 'conversation-personas', 'itemized-prompts']) this.store.delete(scope, id)
    this.store.delete('bindings', `chat:${id}`)
  }
}
function array(value: CompatibilityValue | undefined): CompatibilityValue[] { if (!Array.isArray(value)) throw new TypeError('Expected a chat/group array'); return value }
