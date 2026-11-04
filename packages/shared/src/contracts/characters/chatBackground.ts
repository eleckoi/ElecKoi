export const APP_DEFAULT_CHAT_BACKGROUND = 'eleckoi://chat-background/app-default'
export const GLOBAL_CHAT_BACKGROUND = 'eleckoi://chat-background/global'
export const CUSTOM_CHAT_BACKGROUND = 'eleckoi://chat-background/custom'
export const DEFAULT_NEW_CHARACTER_BACKGROUND = 'app'

export const CHAT_WALLPAPER_DEFAULTS = Object.freeze({ opacity: 0.72, blur: 2, scrim: 0.5 })

export interface CustomChatBackground {
  image: string
  opacity: number
  blur: number
  scrim: number
}

export function isCustomChatBackground(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && ![APP_DEFAULT_CHAT_BACKGROUND, GLOBAL_CHAT_BACKGROUND, CUSTOM_CHAT_BACKGROUND].includes(value)
}

export function normalizeCustomChatBackground(value: unknown): CustomChatBackground {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const number = (key: 'opacity' | 'blur' | 'scrim', min: number, max: number): number => {
    const raw = source[key]
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : CHAT_WALLPAPER_DEFAULTS[key]
  }
  return { image: isCustomChatBackground(source.image) ? source.image : '',
    opacity: number('opacity', .12, 1), blur: number('blur', 0, 24), scrim: number('scrim', 0, 1) }
}

/** Old cards kept the active custom image directly in chatBackground. */
export function customChatBackgroundFromCharacter(character: Record<string, unknown> = {}): CustomChatBackground {
  return normalizeCustomChatBackground(isCustomChatBackground(character.chatBackground)
    ? { image: character.chatBackground, opacity: character.chatBackgroundOpacity,
      blur: character.chatBackgroundBlur, scrim: character.chatBackgroundScrim }
    : character.chatBackgroundCustom)
}

export function normalizeNewCharacterBackground(value: unknown): 'app' | 'character' {
  return value === 'character' ? 'character' : DEFAULT_NEW_CHARACTER_BACKGROUND
}
