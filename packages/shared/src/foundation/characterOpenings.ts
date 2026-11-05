import { z } from 'zod'
import { characterOpeningsSchema, characterOpeningMessageSchema, type CharacterOpenings, type CharacterOpeningMessage } from '../contracts/characterOpenings/schemas'

/** 相同编号和内容只保留一条；编号冲突且内容不同时另设编号，完整保留正文和绑定。 */
export function appendCharacterOpeningMessages(current: CharacterOpenings, incoming: CharacterOpeningMessage[], createId: () => string): CharacterOpenings {
  const value = characterOpeningsSchema.parse(current)
  const fingerprint = (message: CharacterOpeningMessage) => JSON.stringify([message.title, message.content, message.variableVersionId ?? ''])
  const seen = new Map<string, Set<string>>()
  for (const message of value.openingMessages) seen.set(message.id, new Set([fingerprint(message)]))
  const ids = new Set(value.openingMessages.map(message => message.id))
  const messages = [...value.openingMessages]
  for (const input of incoming) {
    const message = characterOpeningMessageSchema.parse(input), content = fingerprint(message)
    if (seen.get(message.id)?.has(content)) continue
    let id = message.id
    if (ids.has(id)) { do { id = createId() } while (ids.has(id)) }
    ids.add(id)
    const contents = seen.get(message.id) ?? new Set<string>(); contents.add(content); seen.set(message.id, contents)
    messages.push({ ...message, id })
  }
  return characterOpeningsSchema.parse({ ...value, openingMessages: messages })
}

// RETIRE WHEN: 不再支持含 versions 的早期未发布 v2 角色卡后，
// 删除本段旧结构校验、解码、文件导入分支及专用回归。
const legacyVersionSchema = z.object({ id: z.string().min(1), name: z.string(), enabled: z.boolean(),
  openingMessages: z.array(characterOpeningMessageSchema.strip()).min(1), defaultOpeningMessageId: z.string().min(1), createdAt: z.string(), updatedAt: z.string() }).strict()
const legacyOpeningsSchema = z.object({ characterId: z.string().min(1), activeVersionId: z.string().min(1), name: z.string(),
  enabled: z.boolean(), openingMessages: z.array(characterOpeningMessageSchema.strip()).min(1), defaultOpeningMessageId: z.string().min(1),
  versions: z.array(legacyVersionSchema).min(1) }).strict().superRefine((value, ctx) => {
    if (!value.versions.some(item => item.id === value.activeVersionId)) ctx.addIssue({ code: 'custom', message: '旧开场白配置的活动项不存在。' })
    if (new Set(value.versions.map(item => item.id)).size !== value.versions.length) ctx.addIssue({ code: 'custom', message: '旧开场白配置编号重复。' })
  })
export function decodeLegacyCharacterOpeningVersions(input: unknown, createId: () => string): CharacterOpenings {
  const old = legacyOpeningsSchema.parse(input)
  const current = characterOpeningsSchema.parse({ characterId: old.characterId, enabled: old.enabled,
    openingMessages: old.openingMessages, defaultOpeningMessageId: old.defaultOpeningMessageId })
  const alternatives = old.versions.flatMap(item => characterOpeningsSchema.parse({ characterId: old.characterId,
    enabled: item.enabled, openingMessages: item.openingMessages, defaultOpeningMessageId: item.defaultOpeningMessageId }).openingMessages)
  return appendCharacterOpeningMessages(current, alternatives, createId)
}
