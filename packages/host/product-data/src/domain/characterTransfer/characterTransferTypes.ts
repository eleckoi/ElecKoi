import type { CharacterExpression } from '@shared/contracts/entities/persona'
import type { RegexRule } from '@shared/contracts/regex/schemas'
import type { SettingLibrary } from '@shared/contracts/settingLibrary/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'
import type { PortableScriptLibrary } from '@product-data/domain/scripts'

export interface PortableCharacter {
  name: string
  group: string
  frontendBeautyEnabled: boolean
  profileAge: string
  profileSex: string
  profileHeight: string
  profileBirthday: string
  profileLike: string
  imagePrompt: string
  opening: string
  showOpening: boolean
  expressions?: CharacterExpression[]
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
  regexRules: RegexRule[]
  scriptLibrary?: PortableScriptLibrary
}

export interface DecodedCharacterCard {
  packageData: PortableCharacterPackage
  sourceImage?: Uint8Array
  complete: boolean
  summary: string
  warnings?: string[]
  settingLibrary?: SettingLibrary
  variableConfig?: VariableConfig
  regexRules: RegexRule[]
}
