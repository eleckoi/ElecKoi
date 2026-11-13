/** Portable IDs are scoped by the owning character at display time, never by a disk path. */
export function characterAssetReference(id: string): string { return `asset://${id}` }
export function characterAssetBaseUrl(characterId: string): string { return `/eleckoi/character-assets/${encodeURIComponent(characterId)}/` }
export function resolveCharacterAssetReferences(source: string, baseUrl: string): string {
  return source.replace(/asset:\/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?![a-z0-9-])/gi,
    (_, id: string) => baseUrl + id.toLowerCase())
}
