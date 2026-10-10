import type { CompatibilityValue } from './types.js'

type ObjectValue = Record<string, CompatibilityValue>

/** SDK request history shares immutable values and never enters product storage. */
export class EphemeralPromptHistory {
  private readonly chats = new Map<string, { records: Map<CompatibilityValue, ObjectValue[]>; values: Map<string, CompatibilityValue>; identities: WeakMap<object, number>; sequence: number }>()

  save(chatId: string, input: ObjectValue): CompatibilityValue[] {
    const messageId = input.mesId
    if (typeof messageId !== 'string' && typeof messageId !== 'number') throw new TypeError('Prompt history requires a message identity')
    let chat = this.chats.get(chatId)
    if (!chat) {
      chat = { records: new Map(), values: new Map(), identities: new WeakMap(), sequence: 0 }
      this.chats.set(chatId, chat)
    }
    const intern = (value: CompatibilityValue): CompatibilityValue => {
      if (value === null || typeof value !== 'object') {
        const key = JSON.stringify(value)
        if (!chat.values.has(key)) chat.values.set(key, value)
        return chat.values.get(key)!
      }
      const children = Object.entries(value).map(([key, child]) => [key, intern(child)] as const)
      const identity = (child: CompatibilityValue) => child !== null && typeof child === 'object'
        ? `object:${chat.identities.get(child)}` : JSON.stringify(child)
      const key = `${Array.isArray(value) ? 'array' : 'object'}:${JSON.stringify(children.map(([key, child]) => [key, identity(child)]))}`
      if (chat.values.has(key)) return chat.values.get(key)!
      const result = Object.freeze(Array.isArray(value) ? children.map(([, child]) => child) : Object.fromEntries(children)) as CompatibilityValue
      chat.identities.set(result as object, ++chat.sequence)
      chat.values.set(key, result)
      return result
    }
    const entry = { ...input }
    // The complete readable prompt is materialized only when the caller reads it.
    if (entry.request && entry.rawPrompt === JSON.stringify(entry.request)) delete entry.rawPrompt
    const frozen = intern(entry) as ObjectValue
    const requests = chat.records.get(messageId) ?? []
    requests.push(frozen)
    chat.records.set(messageId, requests)
    return this.read(chatId)
  }

  read(chatId: string): CompatibilityValue[] {
    const expand = (entry: ObjectValue): ObjectValue => ({ ...entry,
      ...(entry.rawPrompt === undefined && entry.request ? { rawPrompt: JSON.stringify(entry.request) } : {}) })
    return [...(this.chats.get(chatId)?.records.values() ?? [])].map(requests => ({
      ...expand(requests.at(-1)!), requests: requests.map(expand)
    }))
  }

  retainedValueCount(chatId: string): number { return this.chats.get(chatId)?.values.size ?? 0 }
  forget(chatId: string): void { this.chats.delete(chatId) }
  close(): void { this.chats.clear() }
}
