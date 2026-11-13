import type { CharacterOpenings } from '@shared/contracts/characterOpenings/schemas'
import type { RegexRule } from '@shared/contracts/regex/schemas'
import type { SettingLibrary } from '@shared/contracts/settingLibrary/schemas'
import type { VariableConfig } from '@shared/contracts/variables/schemas'
import type { PortableScriptLibrary } from '@product-data/domain/scripts'
import type { PortableCharacterAsset, CharacterAssetFolder } from '@shared/contracts/characterAssets'
import type { PortableFrontendWorkspace } from '@product-data/domain/frontends'

export interface PortableCharacter {
  name: string
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
  characterOpeningsJson?: string
  settingLibraryJson: string
  variableConfigJson: string
  regexRules: RegexRule[]
  scriptLibrary?: PortableScriptLibrary
  libraryAssets?: PortableCharacterAsset[]
  libraryFolders?: CharacterAssetFolder[]
  frontends?: PortableFrontendWorkspace | undefined
}

export interface DecodedCharacterCard {
  packageData: PortableCharacterPackage
  sourceImage?: Uint8Array
  complete: boolean
  summary: string
  warnings?: string[]
  openings?: CharacterOpenings
  settingLibrary?: SettingLibrary
  variableConfig?: VariableConfig
  regexRules: RegexRule[]
}
