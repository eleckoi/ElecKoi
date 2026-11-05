import { z } from 'zod'

export const characterOpeningMessageSchema = z.object({
  id: z.string().min(1), title: z.string(), content: z.string(),
  variableVersionId: z.string().optional()
}).strict()

export const characterOpeningsSchema = z.object({
  characterId: z.string().min(1), enabled: z.boolean(),
  openingMessages: z.array(characterOpeningMessageSchema).min(1),
  defaultOpeningMessageId: z.string().min(1)
}).strict().superRefine((value, ctx) => {
  if (new Set(value.openingMessages.map(message => message.id)).size !== value.openingMessages.length) {
    ctx.addIssue({ code: 'custom', message: '开场白编号不能重复。', path: ['openingMessages'] })
  }
  if (!value.openingMessages.some(message => message.id === value.defaultOpeningMessageId)) {
    ctx.addIssue({ code: 'custom', message: '主开场白编号必须存在。', path: ['defaultOpeningMessageId'] })
  }
})

export type CharacterOpeningMessage = z.output<typeof characterOpeningMessageSchema>
export type CharacterOpenings = z.output<typeof characterOpeningsSchema>

export function createCharacterOpenings(characterId: string, content = '', enabled = true): CharacterOpenings {
  return { characterId, enabled,
    openingMessages: [{ id: 'opening-default', title: '默认开场', content }],
    defaultOpeningMessageId: 'opening-default' }
}
