import { z } from 'zod'

export const activeModelSelectionSchema = z.object({
  capability: z.literal('chat'),
  config_id: z.string(),
  model: z.string(),
  parameters: z.object({
    stream: z.boolean(),
    temperature: z.number().min(0).max(2),
    top_p: z.number().min(0).max(1)
  }).strict()
}).strict()

export const appearanceModeSchema = z.enum(['light', 'dark', 'system'])
export const resolvedAppearanceModeSchema = z.enum(['light', 'dark'])
export const sidebarCharacterArtworkSchema = z.enum(['avatar', 'cover'])
export const newCharacterBackgroundSchema = z.enum(['app', 'character'])
export const collapsedGroupMapSchema = z.record(z.string(), z.boolean())
export const listCollapseStateSchema = z.object({
  characters: collapsedGroupMapSchema.optional(),
  presets: collapsedGroupMapSchema.optional(),
  models: collapsedGroupMapSchema.optional()
}).strict()
export const appearanceUiPreferencesSchema = z.object({
  sidebar_character_artwork: sidebarCharacterArtworkSchema.optional(),
  new_character_background: newCharacterBackgroundSchema.optional(),
  list_collapse_state: listCollapseStateSchema.optional()
}).catchall(z.unknown())

export const chatLayoutModeSchema = z.enum(['social', 'agent', 'roleplay'])
export const chatAvatarShapeSchema = z.enum(['circle', 'rounded_square', 'portrait'])
export const chatReasoningDisplayModeSchema = z.enum(['collapsed', 'expanded'])
const cssHexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const DEFAULT_CHAT_TEXT_COLORS = {
  italics: '#919191',
  underline: '#bce7cf',
  quote: '#f2a65a'
} as const

export const chatTextColorsSchema = z.object({
  italics: cssHexColorSchema,
  underline: cssHexColorSchema,
  quote: cssHexColorSchema
}).strict()

export const chatLayoutProfileSchema = z.object({
  assistant_bubble_enabled: z.boolean(),
  bubble_corner_radius: z.number().min(0).max(24),
  avatar_size: z.number().min(24).max(96),
  avatar_shape: chatAvatarShapeSchema,
  name_font_size: z.number().min(10).max(18),
  name_avatar_spacing: z.number().min(0).max(20),
  horizontal_padding: z.number().min(0).max(32),
  reply_spacing: z.number().min(0).max(32),
  turn_spacing: z.number().min(0).max(32),
  message_font_size: z.number().min(9).max(20),
  line_height_multiplier: z.number().min(0.8).max(1.6),
  letter_spacing: z.number().min(-1).max(4),
  paragraph_spacing: z.number().min(0).max(24)
}).strict()

export const chatDisplayPreferencesSchema = z.object({
  layout: chatLayoutModeSchema,
  reasoning_display_mode: chatReasoningDisplayModeSchema,
  generation_stats_enabled: z.boolean(),
  text_colors: chatTextColorsSchema,
  profiles: z.object({
    social: chatLayoutProfileSchema,
    agent: chatLayoutProfileSchema,
    roleplay: chatLayoutProfileSchema
  }).strict()
}).strict()

export type ChatLayoutMode = z.output<typeof chatLayoutModeSchema>
export type ChatAvatarShape = z.output<typeof chatAvatarShapeSchema>
export type ChatReasoningDisplayMode = z.output<typeof chatReasoningDisplayModeSchema>
export type ChatTextColors = z.output<typeof chatTextColorsSchema>
export type ChatLayoutProfile = z.output<typeof chatLayoutProfileSchema>
export type ChatDisplayPreferences = z.output<typeof chatDisplayPreferencesSchema>

export const DEFAULT_CHAT_DISPLAY_PREFERENCES: ChatDisplayPreferences = {
  layout: 'roleplay',
  reasoning_display_mode: 'collapsed',
  generation_stats_enabled: true,
  text_colors: { ...DEFAULT_CHAT_TEXT_COLORS },
  profiles: {
    social: {
      assistant_bubble_enabled: true,
      bubble_corner_radius: 10,
      avatar_size: 40,
      avatar_shape: 'circle',
      name_font_size: 13,
      name_avatar_spacing: 8,
      horizontal_padding: 10,
      reply_spacing: 16,
      turn_spacing: 16,
      message_font_size: 16,
      line_height_multiplier: 1,
      letter_spacing: 0,
      paragraph_spacing: 6
    },
    agent: {
      assistant_bubble_enabled: false,
      bubble_corner_radius: 12,
      avatar_size: 34.5,
      avatar_shape: 'circle',
      name_font_size: 13,
      name_avatar_spacing: 8,
      horizontal_padding: 16,
      reply_spacing: 15,
      turn_spacing: 15,
      message_font_size: 14,
      line_height_multiplier: 1,
      letter_spacing: 0,
      paragraph_spacing: 6
    },
    roleplay: {
      assistant_bubble_enabled: false,
      bubble_corner_radius: 10,
      avatar_size: 55,
      avatar_shape: 'portrait',
      name_font_size: 15,
      name_avatar_spacing: 10,
      horizontal_padding: 10,
      reply_spacing: 4,
      turn_spacing: 10,
      message_font_size: 15,
      line_height_multiplier: 1,
      letter_spacing: 0,
      paragraph_spacing: 10
    }
  }
}

export const settingKeySchema = z.enum([
  'appearance.mode',
  'appearance.ui',
  'chat.display',
  'locale.current',
  'models.active'
])

export const settingSchemas = {
  'appearance.mode': appearanceModeSchema,
  'appearance.ui': appearanceUiPreferencesSchema,
  'chat.display': chatDisplayPreferencesSchema,
  'locale.current': z.string(),
  'models.active': activeModelSelectionSchema
} as const

export type SettingKey = keyof typeof settingSchemas
export type ActiveModelSelection = z.output<typeof activeModelSelectionSchema>
export type AppearanceMode = z.output<typeof appearanceModeSchema>
export type SidebarCharacterArtwork = z.output<typeof sidebarCharacterArtworkSchema>
export type NewCharacterBackground = z.output<typeof newCharacterBackgroundSchema>
export type ResolvedAppearanceMode = z.output<typeof resolvedAppearanceModeSchema>
