import { z } from 'zod'

export const characterAssetId = z.string().uuid()
export const characterAssetFolderSchema = z.strictObject({
  id: characterAssetId,
  name: z.string().min(1),
  parentId: characterAssetId.nullable(),
  createdAt: z.string().datetime(),
})
export type CharacterAssetFolder = z.infer<typeof characterAssetFolderSchema>
export const characterAssetSchema = z.strictObject({
  id: characterAssetId,
  name: z.string().min(1),
  type: z.enum(['image', 'video', 'audio', 'model']),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative().safe(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  folderId: characterAssetId.nullable().optional(),
})
export type CharacterAsset = z.infer<typeof characterAssetSchema>
export interface CharacterAssetCatalog { characterId: string; revision: number; items: CharacterAsset[]; folders: CharacterAssetFolder[] }
export interface CharacterAssetUpload { name: string; size: number; folderId?: string | null }
export interface CharacterAssetUploadTicket { id: string; offset: number }
export interface PortableCharacterAsset extends CharacterAsset { data: string }

const groups: Array<[CharacterAsset['type'], Record<string, string>]> = [
  ['image', { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon' }],
  ['video', { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', m4v: 'video/mp4', ogv: 'video/ogg' }],
  ['audio', { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', opus: 'audio/ogg' }],
  ['model', { glb: 'model/gltf-binary', gltf: 'model/gltf+json', vrm: 'model/gltf-binary', obj: 'model/obj', fbx: 'application/octet-stream', stl: 'model/stl', ply: 'application/octet-stream', zip: 'application/zip' }],
]
export function characterAssetFormat(name: string): { type: CharacterAsset['type']; mimeType: string } | undefined {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? ''
  for (const [type, formats] of groups) if (Object.hasOwn(formats, extension)) return { type, mimeType: formats[extension]! }
}
export const characterAssetAccept = groups.flatMap(([, formats]) => Object.keys(formats).map(value => `.${value}`)).join(',')
