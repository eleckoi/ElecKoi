import type { CompatibilityValue } from './types.js'

export type FrontendScope = 'character' | 'application'
export type FrontendJson = { [key: string]: CompatibilityValue }
export interface FrontendBinding {
  [key: string]: CompatibilityValue | undefined
  target: 'root' | 'page' | 'slot'
  entryFile: string
  view?: string
  pageId?: string
  slot?: string
  entryKey?: string
}
export interface FrontendManifest {
  [key: string]: CompatibilityValue | FrontendBinding[] | undefined
  manifestVersion: 1
  sdkVersion: string
  scope: FrontendScope
  entryFile: string
  globalStyles?: string[]
  bindings?: FrontendBinding[]
  config?: FrontendJson
  /** Archive metadata, including unknown project fields. IDs are replaced on ordinary import. */
  project?: FrontendJson
}
export interface FrontendProject {
  [key: string]: CompatibilityValue | FrontendManifest | undefined
  id: string
  scope?: FrontendScope
  characterId?: string
  name: string
  entryFile: string
  files: string[]
  importedAt: string
  updatedAt?: string
  manifest?: FrontendManifest
}
export interface FrontendWorkspace {
  scope: FrontendScope
  characterId?: string
  projects: FrontendProject[]
  selectedProjectId: string | null
  messageRendererEnabled: boolean
  activeBindings: FrontendBinding[]
  revision: number
}
export interface FrontendFileInput {
  path: string
  content: string
  encoding?: 'utf8' | 'base64'
}
export interface FrontendChange {
  scope: FrontendScope
  characterId?: string
  workspace: FrontendWorkspace
}
export const FRONTEND_MANIFEST_FILE = 'eleckoi.frontend.json'
