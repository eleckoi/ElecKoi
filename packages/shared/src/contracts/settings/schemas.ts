import { z } from 'zod'

export const chatSelectionSchema = z.object({
  active_conversation_id: z.string(),
  preferred_sessions: z.record(z.string(), z.string())
})

export const sidebarCharacterArtworkSchema = z.enum(['avatar', 'cover'])
export const newCharacterBackgroundSchema = z.enum(['app', 'character'])
export const collapsedGroupMapSchema = z.record(z.string(), z.boolean())
export const conversationEntryIdsSchema = z.array(z.string().trim().min(1))
export const listCollapseStateSchema = z.object({
  characters: collapsedGroupMapSchema.optional(),
  presets: collapsedGroupMapSchema.optional(),
  models: collapsedGroupMapSchema.optional(),
  plugins: collapsedGroupMapSchema.optional()
})
export const appearanceUiPreferencesSchema = z.object({
  desktop_character_sort: z.enum(['default', 'newest', 'oldest', 'edited', 'name']).optional(),
  desktop_character_sidebar_sort: z.enum(['default', 'newest', 'oldest', 'edited', 'name']).optional(),
  desktop_character_sidebar_order: z.array(z.string().min(1)).optional(),
  desktop_preset_sort: z.enum(['default', 'name']).optional(),
  desktop_preset_sidebar_sort: z.enum(['default', 'name']).optional(),
  mobile_character_sort: z.enum(['default', 'newest', 'oldest', 'edited', 'name']).optional(),
  sidebar_character_artwork: sidebarCharacterArtworkSchema.optional(),
  new_character_background: newCharacterBackgroundSchema.optional(),
  conversation_content_width: z.number().finite().positive().optional(),
  pinned_chat_ids: conversationEntryIdsSchema.optional(),
  favorite_character_ids: z.array(z.string().min(1)).optional(),
  hidden_chat_ids: conversationEntryIdsSchema.optional(),
  list_collapse_state: listCollapseStateSchema.optional()
}).catchall(z.unknown())

export const chatLayoutModeSchema = z.enum(['social', 'agent', 'roleplay'])
export const chatAvatarShapeSchema = z.enum(['circle', 'rounded_square', 'portrait'])
export const chatReasoningDisplayModeSchema = z.enum(['collapsed', 'expanded'])
const cssHexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const DEFAULT_CHAT_TEXT_COLORS = {
  italics: '#919191',
  underline: '#bce7cf',
  quote: '#4176e6'
} as const

export const chatTextColorsSchema = z.object({
  italics: cssHexColorSchema,
  underline: cssHexColorSchema,
  quote: cssHexColorSchema
})

/** A null tint follows the active theme; authored tints remain explicit. */
export const DEFAULT_ROLEPLAY_STYLE = {
  backdrop_enabled: false,
  backdrop_blur: 20,
  backdrop_opacity: 100,
  backdrop_tint: null,
  bubbles_enabled: true,
  bubble_spacing: 5,
  bubble_blur: 0,
  user_bubble_tint: null,
  assistant_bubble_tint: null,
  user_bubble_opacity: 100,
  assistant_bubble_opacity: 100,
} as const

export const roleplayStyleSchema = z.object({
  backdrop_enabled: z.boolean().default(DEFAULT_ROLEPLAY_STYLE.backdrop_enabled),
  backdrop_blur: z.number().min(0).max(40).default(DEFAULT_ROLEPLAY_STYLE.backdrop_blur),
  backdrop_opacity: z.number().min(0).max(100).default(DEFAULT_ROLEPLAY_STYLE.backdrop_opacity),
  backdrop_tint: cssHexColorSchema.nullable().default(null),
  bubbles_enabled: z.boolean().default(DEFAULT_ROLEPLAY_STYLE.bubbles_enabled),
  bubble_spacing: z.number().min(0).max(32).default(DEFAULT_ROLEPLAY_STYLE.bubble_spacing),
  bubble_blur: z.number().min(0).max(40).default(DEFAULT_ROLEPLAY_STYLE.bubble_blur),
  user_bubble_tint: cssHexColorSchema.nullable().default(null),
  assistant_bubble_tint: cssHexColorSchema.nullable().default(null),
  user_bubble_opacity: z.number().min(0).max(100).default(DEFAULT_ROLEPLAY_STYLE.user_bubble_opacity),
  assistant_bubble_opacity: z.number().min(0).max(100).default(DEFAULT_ROLEPLAY_STYLE.assistant_bubble_opacity),
})
export type RoleplayStyle = z.output<typeof roleplayStyleSchema>

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
  line_height_multiplier: z.number().min(0.8).max(1.6),
  letter_spacing: z.number().min(-1).max(4),
  paragraph_spacing: z.number().min(0).max(24)
})

export const RICH_MESSAGE_FLOOR_RANGE = { min: 1, defaultValue: 10 } as const

export const chatDisplayPreferencesSchema = z.object({
  layout: chatLayoutModeSchema,
  agent_size_defaults_revision: z.literal(1).optional(),
  roleplay_style: roleplayStyleSchema.default({ ...DEFAULT_ROLEPLAY_STYLE }),
  reasoning_display_mode: chatReasoningDisplayModeSchema,
  generation_stats_enabled: z.boolean(),
  conversation_view_tabs_enabled: z.boolean().default(true),
  roleplay_timestamps_enabled: z.boolean().default(true),
  roleplay_message_floors_enabled: z.boolean().default(true),
  rich_message_limit_enabled: z.boolean().default(false),
  rich_message_floor_limit: z.number().int().min(RICH_MESSAGE_FLOOR_RANGE.min).default(RICH_MESSAGE_FLOOR_RANGE.defaultValue),
  text_colors: chatTextColorsSchema,
  profiles: z.object({
    social: chatLayoutProfileSchema,
    agent: chatLayoutProfileSchema,
    roleplay: chatLayoutProfileSchema
  })
})

export type ChatLayoutMode = z.output<typeof chatLayoutModeSchema>
export type ChatAvatarShape = z.output<typeof chatAvatarShapeSchema>
export type ChatReasoningDisplayMode = z.output<typeof chatReasoningDisplayModeSchema>
export type ChatTextColors = z.output<typeof chatTextColorsSchema>
export type ChatLayoutProfile = z.output<typeof chatLayoutProfileSchema>
export type ChatDisplayPreferences = z.output<typeof chatDisplayPreferencesSchema>

export const DEFAULT_CHAT_DISPLAY_PREFERENCES: ChatDisplayPreferences = {
  layout: 'roleplay',
  agent_size_defaults_revision: 1,
  roleplay_style: { ...DEFAULT_ROLEPLAY_STYLE },
  reasoning_display_mode: 'collapsed',
  generation_stats_enabled: true,
  conversation_view_tabs_enabled: true,
  roleplay_timestamps_enabled: true,
  roleplay_message_floors_enabled: true,
  rich_message_limit_enabled: false,
  rich_message_floor_limit: RICH_MESSAGE_FLOOR_RANGE.defaultValue,
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
      line_height_multiplier: 1,
      letter_spacing: 0,
      paragraph_spacing: 6
    },
    agent: {
      assistant_bubble_enabled: false,
      bubble_corner_radius: 12,
      avatar_size: 40,
      avatar_shape: 'circle',
      name_font_size: 14,
      name_avatar_spacing: 8,
      horizontal_padding: 16,
      reply_spacing: 15,
      turn_spacing: 15,
      line_height_multiplier: 1.1,
      letter_spacing: 0,
      paragraph_spacing: 6
    },
    roleplay: {
      assistant_bubble_enabled: false,
      bubble_corner_radius: 12,
      avatar_size: 65,
      avatar_shape: 'portrait',
      name_font_size: 15,
      name_avatar_spacing: 10,
      horizontal_padding: 10,
      reply_spacing: 4,
      turn_spacing: 12,
      line_height_multiplier: 1,
      letter_spacing: 0,
      paragraph_spacing: 10
    }
  }
}

// RETIRE WHEN: Supported installations and settings backups no longer contain Agent profiles
// saved before the 48px avatar / 16px name defaults changed. The read normalizer upgrades only
// those old default profiles (including profiles with the bubble toggle changed). Remove this
// profile, the normalization branch, the revision marker and the legacy-default regression together.
const legacyAgentSizeProfile = { ...DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.agent, avatar_size: 48, name_font_size: 16 }

export type ChatSelection = z.output<typeof chatSelectionSchema>
/** Unconfigured display documents use the same canonical defaults as the native renderer. */
export function normalizeChatDisplaySettings(value: unknown): ChatDisplayPreferences {
  if (value == null || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)) {
    return structuredClone(DEFAULT_CHAT_DISPLAY_PREFERENCES)
  }
  // A nonempty malformed document is a real configuration error, not an alternate profile.
  const parsed = chatDisplayPreferencesSchema.parse(value)
  const original = value as Record<string, unknown>
  const profiles = original.profiles as Record<string, Record<string, unknown>>
  const agent = parsed.profiles.agent
  const inheritsLegacySizes = parsed.agent_size_defaults_revision === undefined
    && Object.entries(legacyAgentSizeProfile).every(([key, previous]) =>
      key === 'assistant_bubble_enabled' || agent[key as keyof ChatLayoutProfile] === previous)
  const { avatar_size, name_font_size } = DEFAULT_CHAT_DISPLAY_PREFERENCES.profiles.agent
  return { ...original, ...parsed, agent_size_defaults_revision: 1, roleplay_style: { ...(original.roleplay_style as object), ...parsed.roleplay_style }, profiles: {
    ...profiles,
    social: { ...profiles.social, ...parsed.profiles.social },
    agent: { ...profiles.agent, ...agent, ...(inheritsLegacySizes ? { avatar_size, name_font_size } : {}) },
    roleplay: { ...profiles.roleplay, ...parsed.profiles.roleplay }
  } }
}
export type SidebarCharacterArtwork = z.output<typeof sidebarCharacterArtworkSchema>
export type NewCharacterBackground = z.output<typeof newCharacterBackgroundSchema>
