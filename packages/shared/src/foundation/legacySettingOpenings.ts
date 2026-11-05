import { characterOpeningsSchema, type CharacterOpenings } from '../contracts/characterOpenings/schemas'

// RETIRE WHEN: 停止支持 schema v12 及更早旧库及含开场白的 v1 角色卡导入后，删除本解码器与两个调用入口的旧条目分支。
export function decodeLegacySettingOpening(entry: Record<string, unknown> | undefined, fallback: CharacterOpenings): CharacterOpenings {
  if (!entry) return fallback
  const messages = entry.opening_messages
  return characterOpeningsSchema.parse({ characterId: fallback.characterId, enabled: entry.enabled,
    openingMessages: Array.isArray(messages) && messages.length ? messages.map(value => {
      const message = value as Record<string, unknown>
      return { id: message.id, title: message.title, content: message.content,
        ...(message.variable_version_id === undefined ? {} : { variableVersionId: message.variable_version_id }) }
    }) : [{ ...fallback.openingMessages[0]!, content: entry.content }],
    defaultOpeningMessageId: Array.isArray(messages) && messages.length ? entry.default_opening_message_id : fallback.defaultOpeningMessageId })
}
