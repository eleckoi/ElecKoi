import { z } from 'zod'
import { characterCastCropSchema } from '../characters/cast'

const segmentFields = { id: z.string().min(1), text: z.string() }
const openingSegmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...segmentFields, kind: z.literal('cover') }),
  z.strictObject({ ...segmentFields, kind: z.literal('speech'), speakerId: z.string().min(1) })
])

export const openingSceneSegmentSchema = z.object({
  ...segmentFields,
  kind: z.enum(['cover', 'speech']),
  speakerId: z.string().optional(),
  speakerName: z.string().optional(),
  speakerAvatar: z.string().optional(),
  speakerCrop: characterCastCropSchema.optional(),
  displayContent: z.string().optional()
})

export const characterOpeningMessageSchema = z.object({
  id: z.string().min(1), title: z.string(), content: z.string(),
  variableVersionId: z.string().optional(),
  segments: z.array(openingSegmentSchema).min(1)
    .refine(segments => new Set(segments.map(segment => segment.id)).size === segments.length, '开场段落编号不能重复。')
    .optional()
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
export type OpeningSegment = z.output<typeof openingSegmentSchema>
export type OpeningSceneSegment = z.output<typeof openingSceneSegmentSchema>
export type CharacterOpenings = z.output<typeof characterOpeningsSchema>

export function createCharacterOpenings(characterId: string, content = '', enabled = true): CharacterOpenings {
  return { characterId, enabled,
    openingMessages: [{ id: 'opening-default', title: '默认开场', content }],
    defaultOpeningMessageId: 'opening-default' }
}
