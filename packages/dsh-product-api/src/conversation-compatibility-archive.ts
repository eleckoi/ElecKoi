import type { CompatibilityStoreContract, CompatibilityValue } from './types.js'

type ObjectValue = Record<string, CompatibilityValue>
interface ArchiveMessage {
  id: string
  runtimeSessionId?: string
  dshMessageId?: string
  sessionEventSeq?: number
}
interface ArchiveDocument { scope: string; key: string; value: CompatibilityValue }
export interface ConversationCompatibilityArchive {
  version: 1
  conversationId: string
  messages: ArchiveMessage[]
  documents: ArchiveDocument[]
  group?: ObjectValue
}
const scoped = ['metadata', 'swipes', 'message-extensions', 'message-presentation', 'migration:android:message-bindings']
const keyed = ['temporary-chats', 'chat-import-headers', 'worldbook-timing', 'conversation-personas']
const selected = ['bindings', 'persona-selection']
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function owns(scope: string, key: string, chat: string): boolean {
  return scoped.some(prefix => scope === `${prefix}:${chat}`)
    || scope.startsWith(`variables:message:${chat}:`)
    || keyed.includes(scope) && key === chat
    || selected.includes(scope) && key === `chat:${chat}`
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Conversation compatibility archive requires an object')
  return value as Record<string, unknown>
}

/** Companion documents remain in the existing registry, next to the original Session archive. */
export function exportConversationCompatibility(store: CompatibilityStoreContract, conversationId: string, messages: ObjectValue[]): ConversationCompatibilityArchive {
  const documents: ArchiveDocument[] = []
  for (const scope of store.scopes('')) for (const [key, value] of Object.entries(store.list(scope))) {
    if (owns(scope, key, conversationId)) documents.push({ scope, key, value })
  }
  const groupId = store.get('group-bindings', conversationId), group = typeof groupId === 'string' ? store.get('groups', groupId) : null
  return copy({ version: 1, conversationId, documents, messages: messages.map(message => ({
    id: String(message.id), ...(typeof message.runtimeSessionId === 'string' ? { runtimeSessionId: message.runtimeSessionId } : {}),
    ...(typeof message.dshMessageId === 'string' ? { dshMessageId: message.dshMessageId } : {}),
    ...(typeof message.sessionEventSeq === 'number' ? { sessionEventSeq: message.sessionEventSeq } : {})
  })), ...(group && typeof group === 'object' && !Array.isArray(group) ? { group } : {}) })
}

/** Older native archives without companion data continue to import unchanged. */
export function parseConversationCompatibility(value: unknown, conversationId: string): ConversationCompatibilityArchive | undefined {
  if (value === undefined) return undefined
  const input = record(value)
  if (input.version !== 1 || input.conversationId !== conversationId || !Array.isArray(input.documents) || !Array.isArray(input.messages)) {
    throw new TypeError('Conversation compatibility archive identity or version does not match')
  }
  const identities = new Set<string>(), documents = input.documents.map(value => {
    const document = record(value)
    if (typeof document.scope !== 'string' || typeof document.key !== 'string' || !Object.hasOwn(document, 'value')
      || !owns(document.scope, document.key, conversationId)) throw new TypeError('Companion document is not owned by the archived conversation')
    const identity = JSON.stringify([document.scope, document.key])
    if (identities.has(identity)) throw new TypeError('Duplicate conversation companion document')
    identities.add(identity)
    return document as unknown as ArchiveDocument
  })
  const messageIds = new Set<string>(), messages = input.messages.map(value => {
    const message = record(value)
    if (typeof message.id !== 'string' || !message.id || messageIds.has(message.id)
      || message.runtimeSessionId !== undefined && typeof message.runtimeSessionId !== 'string'
      || message.dshMessageId !== undefined && typeof message.dshMessageId !== 'string'
      || message.sessionEventSeq !== undefined && !Number.isSafeInteger(message.sessionEventSeq)) throw new TypeError('Invalid archived message identity')
    messageIds.add(message.id)
    return message as unknown as ArchiveMessage
  })
  const group = input.group === undefined ? undefined : record(input.group)
  if (group && (typeof group.id !== 'string' || !group.id || !Array.isArray(group.members) || group.members.some(member => typeof member !== 'string'))) {
    throw new TypeError('Invalid archived group identity or members')
  }
  return copy({ version: 1, conversationId, documents, messages, ...(group ? { group: group as ObjectValue } : {}) })
}

export function restoreConversationCompatibility(store: CompatibilityStoreContract, archive: ConversationCompatibilityArchive,
  conversationId: string, runtimeIds: ReadonlyMap<string, string>, targetMessages: ObjectValue[]): void {
  const source = archive.conversationId, ids = new Map<string, string>()
  for (const message of archive.messages) {
    const target = targetMessages.find(target => message.id === 'opening' ? target.id === 'opening'
      : message.dshMessageId ? target.dshMessageId === message.dshMessageId
        : message.sessionEventSeq !== undefined && target.sessionEventSeq === message.sessionEventSeq
          && target.runtimeSessionId === runtimeIds.get(message.runtimeSessionId || ''))
    if (!target) throw new Error(`Archived message is absent from the restored Session: ${message.id}`)
    ids.set(message.id, String(target.id))
  }
  const remap = (value: CompatibilityValue): CompatibilityValue => typeof value === 'string' ? ids.get(value) ?? value : value
  store.atomic(() => {
    for (const entry of archive.documents) {
      let scope = entry.scope, key = entry.key, value = copy(entry.value)
      for (const prefix of scoped) if (scope === `${prefix}:${source}`) {
        scope = `${prefix}:${conversationId}`
        if (prefix === 'metadata' && key === 'chat') {
          if (value && typeof value === 'object' && !Array.isArray(value) && value.eleckoi_parent_chat_id === source) value.eleckoi_parent_chat_id = conversationId
        } else if (prefix === 'message-presentation' && value && typeof value === 'object' && !Array.isArray(value)) {
          for (const field of ['order', 'deleted']) if (Array.isArray(value[field])) value[field] = value[field].map(remap)
        } else if (prefix === 'migration:android:message-bindings') {
          const split = key.lastIndexOf(':'); key = `${runtimeIds.get(key.slice(0, split)) ?? key.slice(0, split)}${key.slice(split)}`
          if (value && typeof value === 'object' && !Array.isArray(value) && value.id !== undefined) value.id = remap(value.id)
        } else key = String(remap(key))
      }
      if (scope.startsWith(`variables:message:${source}:`)) scope = `variables:message:${conversationId}:${ids.get(scope.slice(`variables:message:${source}:`.length)) ?? scope.slice(`variables:message:${source}:`.length)}`
      if (keyed.includes(scope)) key = conversationId
      if (selected.includes(scope)) key = `chat:${conversationId}`
      store.put(scope, key, value)
    }
  })
}

export function clearConversationCompatibility(store: CompatibilityStoreContract, conversationId: string): void {
  store.atomic(() => {
    for (const scope of store.scopes('')) for (const key of Object.keys(store.list(scope))) {
      if (owns(scope, key, conversationId)) store.delete(scope, key)
    }
  })
}
