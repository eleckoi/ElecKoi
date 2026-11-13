export type FrontendValue = null | boolean | number | string | FrontendValue[] | { [key: string]: FrontendValue }

export type FrontendScope = 'character' | 'application'
export type FrontendJson = { [key: string]: FrontendValue }
export interface FrontendBinding {
  target: 'root' | 'page' | 'slot'
  entryFile: string
  view?: string
  pageId?: string
  slot?: string
  entryKey?: string
}
export interface FrontendManifest {
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


export type FrontendOwner = { scope: 'application' } | { scope: 'character'; characterId: string }
export interface FrontendImport {
  name?: string; filename?: string; data?: string; html?: string; files?: FrontendFileInput[]
  entryFile?: string; manifest?: FrontendJson; project?: FrontendJson; select?: boolean
}
export interface FrontendReplaceFiles {
  files: FrontendFileInput[]; deletePaths?: string[]; entryFile?: string; manifest?: FrontendJson
}
export interface FrontendFile { path: string; content: string; mimeType: string }
export interface FrontendFileQuery { path?: string; encoding?: 'utf8' | 'base64' }
export interface FrontendExport { filename: string; data: string; project: FrontendProject }
export interface PortableFrontendWorkspace {
  projects: Array<{ id: string; files: FrontendFileInput[] }>
  selectedProjectId: string | null
  messageRendererEnabled: boolean
}
