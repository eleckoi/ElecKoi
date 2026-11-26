import { z } from 'zod'
import { openingSceneSegmentSchema } from '../characterOpenings/schemas'
import { characterCastSchema } from '../characters/cast'

export const recordSchema = z.record(z.string(), z.unknown())

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const conversationMetadataSchema = z.object({
  characterId: z.string(),
  characterName: z.string(),
  characterAvatar: z.string(),
  characterPersona: recordSchema
})

export const agentProcessItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['tool', 'command', 'file_change', 'compaction', 'subagent', 'action', 'narrative', 'reasoning']),
  status: z.enum(['running', 'complete', 'error', 'cancelled']),
  toolName: z.string(),
  arguments: z.string(),
  summary: z.string(),
  detail: z.string(),
  startedAtMillis: z.number().nonnegative(),
  completedAtMillis: z.number().nonnegative().optional(),
  parentId: z.string().optional(),
  delegatedModel: z.string().optional()
})

export const openingMessageOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  variableVersionId: z.string().optional(),
  displayContent: z.string().optional(),
  segments: z.array(openingSceneSegmentSchema).optional(),
  initialVariableStateJson: z.string()
})

export const chatImageMediaTypeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export const chatUserImageAttachmentSchema = z.object({
  attachmentId: z.string().min(1),
  mediaType: chatImageMediaTypeSchema,
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().optional(),
  originalDimensions: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }).optional()
})

export const chatUserFileAttachmentSchema = z.object({
  attachmentId: z.string().min(1),
  name: z.string().min(1),
  bytes: z.number().int().nonnegative()
})

export const encodedChatImageAttachmentSchema = z.object({
  mediaType: chatImageMediaTypeSchema,
  data: z.string().min(1),
  name: z.string().optional()
})

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  displayContent: z.string().optional(),
  variableStateJson: z.string(),
  status: z.enum(['complete', 'streaming', 'error', 'cancelled']),
  createdAt: z.string(),
  turnId: z.string().optional(),
  speakerId: z.string().optional(),
  speakerName: z.string().optional(),
  speakerAvatar: z.string().optional(),
  sequence: z.number().int().optional(),
  messageIndex: z.number().int().nonnegative().optional(),
  responseIndex: z.number().int().nonnegative().optional(),
  runtimeSessionId: z.string().optional(),
  dshMessageId: z.string().optional(),
  process: z.array(agentProcessItemSchema).optional(),
  turnUsage: z.object({
    uncachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
    reasoningTokens: z.number().int().nonnegative().optional(),
    routes: z.array(z.object({ provider: z.string(), model: z.string() })).readonly().optional()
  }).optional(),
  inputImageAttachments: z.array(chatUserImageAttachmentSchema).optional(),
  generatedImageAttachments: z.array(chatUserImageAttachmentSchema.partial().extend({
    id: z.string().min(1), batchId: z.string().min(1), frameId: z.number().int().positive(),
    status: z.enum(['ready', 'failed', 'generating']), error: z.string().optional()
  })).optional(),
  inputFileAttachments: z.array(chatUserFileAttachmentSchema).optional(),
  openingOptions: z.array(openingMessageOptionSchema).optional(),
  selectedOpeningId: z.string().optional()
})

export const personaSchema = z.object({
  assistant_name: z.string(),
  assistant_avatar: z.string(),
  assistant_square: z.string(),
  assistant_cover: z.string(),
  opening: z.string(),
  show_opening: z.boolean(),
  user_name: z.string(),
  user_avatar: z.string(),
  user_square: z.string(),
  user_portrait: z.string()
}).loose()

export const characterRecordSchema = z.object({ id: z.string(), cast: characterCastSchema.optional() }).loose()

export const characterCollectionSchema = z.object({
  active_character_id: z.string(),
  groups: z.array(z.string()),
  items: z.array(characterRecordSchema)
})
