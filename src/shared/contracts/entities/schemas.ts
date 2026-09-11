import { z } from 'zod'

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
  characterPersona: recordSchema,
  modelSettings: recordSchema
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
  displayContent: z.string().optional(),
  initialVariableStateJson: z.string()
})

export const chatImageMediaTypeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export const chatUserImageAttachmentSchema = z.object({
  attachmentId: z.string().min(1),
  mediaType: chatImageMediaTypeSchema,
  bytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().max(255).optional(),
  originalDimensions: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }).optional()
})

export const encodedChatImageAttachmentSchema = z.object({
  mediaType: chatImageMediaTypeSchema,
  data: z.string().min(1).max(28 * 1024 * 1024),
  name: z.string().max(255).optional()
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
  responseIndex: z.number().int().nonnegative().optional(),
  process: z.array(agentProcessItemSchema).optional(),
  inputImageAttachments: z.array(chatUserImageAttachmentSchema).optional(),
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

export const characterRecordSchema = z.object({ id: z.string() }).loose()

export const characterCollectionSchema = z.object({
  active_character_id: z.string(),
  groups: z.array(z.string()),
  items: z.array(characterRecordSchema)
})

export const modelApiFormatSchema = z.enum(['chat_completions', 'responses', 'anthropic_messages', 'google_gemini'])
export const modelProviderIdSchema = z.enum(['custom', 'deepseek', 'zhipu', 'zai', 'moonshot', 'openai_image', 'novelai_image'])

export const modelOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isUserAdded: z.boolean().optional(),
  contextWindowTokens: z.number().int().min(4096).max(4_000_000).nullable().optional(),
  autoCompactTokenLimit: z.number().int().min(1024).max(4_000_000).nullable().optional(),
  maxOutputTokens: z.number().int().min(1).max(4_000_000).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  reasoningEffort: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).nullable().optional(),
  supportsImageInput: z.boolean().optional()
}).strict().superRefine((option, context) => {
  const capacity = option.contextWindowTokens
  if (capacity !== null && capacity !== undefined) {
    if (option.autoCompactTokenLimit !== null && option.autoCompactTokenLimit !== undefined && option.autoCompactTokenLimit > capacity) {
      context.addIssue({ code: 'custom', path: ['autoCompactTokenLimit'], message: '自动压缩阈值不能超过上下文窗口。' })
    }
    if (option.maxOutputTokens !== null && option.maxOutputTokens !== undefined && option.maxOutputTokens > capacity) {
      context.addIssue({ code: 'custom', path: ['maxOutputTokens'], message: '单次最大输出不能超过上下文窗口。' })
    }
  }
})

const headerNamePattern = /^[A-Za-z0-9!#$%&'*+._`|~^-]+$/

export const modelConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: modelProviderIdSchema,
  api_key: z.string(),
  base_url: z.string(),
  proxy_url: z.string(),
  model: z.string(),
  model_options: z.array(modelOptionSchema),
  custom_headers: z.record(z.string().regex(headerNamePattern, '请求头名称包含无效字符。'), z.string()),
  supports_tools: z.boolean().nullable(),
  enabled: z.boolean(),
  image_settings: recordSchema,
  api_format: modelApiFormatSchema
}).strict()
