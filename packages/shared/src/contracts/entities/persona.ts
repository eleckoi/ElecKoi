import type { CharacterCastMember } from '../characters/cast'

export interface Persona {
  assistant_name: string
  assistant_avatar: string
  assistant_square: string
  assistant_cover: string
  opening: string
  show_opening: boolean
  user_name: string
  user_avatar: string
  user_square: string
  user_portrait: string
  [key: string]: unknown
}

export interface CharacterRecord {
  id: string
  cast?: CharacterCastMember[] | undefined
  /** Original card author, independent of the local player's profile. */
  authorName?: string
  authorAvatar?: string
  /** Local catalog activity; zero means unknown for an older installation. */
  addedAtEpochMs?: number
  editedAtEpochMs?: number
  [key: string]: unknown
}

export interface CharacterCollection {
  active_character_id: string
  groups: string[]
  items: CharacterRecord[]
}
