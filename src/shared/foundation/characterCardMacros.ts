export interface CharacterCardMacroValues {
  userName: string
  characterName: string
}

export interface CharacterCardMacroIdentity {
  characterId: string
  characterName: string
  characterPersona: Record<string, unknown>
}

const CHARACTER_CARD_MACRO_PATTERN = /\{\{\s*(user|char)\s*\}\}/gi

export function characterCardMacroValues(
  identity: CharacterCardMacroIdentity,
  currentUserName: unknown
): CharacterCardMacroValues | undefined {
  if (!identity.characterId.trim()) return undefined
  return {
    userName: nonBlankString(currentUserName) || '用户',
    characterName: nonBlankString(identity.characterName)
      || nonBlankString(identity.characterPersona.assistant_name)
      || 'AI'
  }
}

export function resolveCharacterCardMacros(text: string, values: CharacterCardMacroValues): string {
  if (text.length === 0) return text
  const matches = [...text.matchAll(CHARACTER_CARD_MACRO_PATTERN)]
  if (matches.length === 0) return text

  let resolved = ''
  let sourceIndex = 0
  for (const match of matches) {
    const matchIndex = match.index
    resolved += text.slice(sourceIndex, matchIndex)
    const replacement = match[1]?.toLowerCase() === 'user'
      ? values.userName
      : values.characterName

    if (isCjkTextBoundary(replacement[0])) {
      resolved = trimCjkBoundarySpacing(resolved)
    }
    resolved += replacement
    sourceIndex = matchIndex + match[0].length

    if (isCjkTextBoundary(replacement.at(-1))) {
      const nextTextIndex = nextNonHorizontalSpace(text, sourceIndex)
      if (nextTextIndex > sourceIndex && isCjkTextBoundary(text[nextTextIndex])) {
        sourceIndex = nextTextIndex
      }
    }
  }
  return resolved + text.slice(sourceIndex)
}

function trimCjkBoundarySpacing(text: string): string {
  let boundary = text.length
  while (boundary > 0 && isHorizontalMacroSpacing(text[boundary - 1])) boundary -= 1
  return boundary < text.length && boundary > 0 && isCjkTextBoundary(text[boundary - 1])
    ? text.slice(0, boundary)
    : text
}

function nextNonHorizontalSpace(text: string, startIndex: number): number {
  let index = startIndex
  while (index < text.length && isHorizontalMacroSpacing(text[index])) index += 1
  return index
}

function isHorizontalMacroSpacing(value: string | undefined): boolean {
  return value === ' ' || value === '\t' || value === '\u00a0' || value === '\u3000'
}

function isCjkTextBoundary(value: string | undefined): boolean {
  if (value === undefined) return false
  const code = value.charCodeAt(0)
  return (
    (code >= 0x3000 && code <= 0x30ff)
    || (code >= 0x3400 && code <= 0x4dbf)
    || (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0xac00 && code <= 0xd7af)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xff01 && code <= 0xff65)
  )
}

function nonBlankString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : ''
}
