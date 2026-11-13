import { characterAssetFolderSchema, type CharacterAsset, type CharacterAssetFolder } from '@shared/contracts/characterAssets'
import { DesktopError } from '@shared/foundation/DesktopError'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'

/** Folders are catalog identities; they never become filesystem paths. */
export function validateAssetFolders(items: CharacterAsset[], input: CharacterAssetFolder[]): CharacterAssetFolder[] {
  const folders = input.map(folder => characterAssetFolderSchema.parse(folder))
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  const invalid = () => { throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '资产文件夹包含重复编号、无效归属或循环。', { field: 'folders' }) }
  if (byId.size !== folders.length || new Set(items.map(item => item.id)).size !== items.length || items.some(item => byId.has(item.id))) invalid()
  const checked = new Set<string>()
  for (const folder of folders) {
    const visiting = new Set<string>()
    let id: string | null = folder.id
    while (id !== null && !checked.has(id)) {
      const current = byId.get(id)
      if (!current || visiting.has(id)) invalid()
      visiting.add(id); id = current!.parentId
    }
    for (const value of visiting) checked.add(value)
  }
  if (items.some(item => item.folderId != null && !byId.has(item.folderId))) invalid()
  return folders
}

export function folderDescendants(folders: CharacterAssetFolder[], ids: string[]): Set<string> {
  const children = new Map<string, string[]>()
  for (const folder of folders) if (folder.parentId) {
    const list = children.get(folder.parentId) ?? []; list.push(folder.id); children.set(folder.parentId, list)
  }
  const descendants = new Set(ids), queue = [...ids]
  for (let index = 0; index < queue.length; index++) for (const id of children.get(queue[index]!) ?? []) {
    if (!descendants.has(id)) { descendants.add(id); queue.push(id) }
  }
  return descendants
}
