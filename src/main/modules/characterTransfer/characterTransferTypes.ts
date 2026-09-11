import type { RegexRule } from '@shared/contracts/regex/schemas'
import type { SettingLibrary } from '@shared/contracts/settingLibrary/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'

export interface PortableCharacter {
  name: string
  group: string
  characterMode: 'story' | 'agent'
  frontendBeautyEnabled: boolean
  profileAge: string
  profileSex: string
  profileHeight: string
  profileBirthday: string
  profileLike: string
  imagePrompt: string
  opening: string
  showOpening: boolean
}

export interface PortableAsset {
  key: string
  mediaType: string
  bytes: Uint8Array
}

export interface PortableCharacterPackage {
  character: PortableCharacter
  assets: PortableAsset[]
  settingLibraryJson: string
  variableConfigJson: string
}

export interface DecodedCharacterCard {
  packageData: PortableCharacterPackage
  sourceImage?: Uint8Array
  complete: boolean
  summary: string
  settingLibrary?: SettingLibrary
  variableConfig?: VariableConfig
  regexRules: RegexRule[]
}
