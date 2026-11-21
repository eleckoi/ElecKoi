import { randomUUID } from 'node:crypto'
import type {
  SettingLibrary,
  SettingLibraryEntry,
  SettingLibraryGroup,
  SettingLibraryVersion
} from '@shared/contracts/settingLibrary/schemas'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

const now = (): string => new Date().toISOString()

export function emptyEntry(id: string = randomUUID(), timestamp = now()): SettingLibraryEntry {
  return {
    id, title: '', iconId: '', kind: 'normal', groupId: '', content: '', openingMessages: [],
    defaultOpeningMessageId: '', agentSelectionHint: '', agentReadStrategy: 'normal',
    contentMode: 'plain_text', keywords: [], keywordScanDepth: 1, conditionKeywords: [],
    keywordCondition: 'none', keywordUseRegex: false, keywordIgnoreCase: true, keywordWholeWord: false,
    keywordRecursionDepth: 0, triggerMode: 'agent_tool', enabled: true, position: null,
    promptPositionId: '', insertRole: 'user', order: 1, viewOrder: 0, groupViewOrder: 0,
    treeViewOrder: 0, createdAt: timestamp, updatedAt: timestamp
  }
}

export function validateSettingLibraryTree(groups: SettingLibraryGroup[], entries: SettingLibraryEntry[]): void {
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  if (groupsById.size !== groups.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '设定库文件夹编号不能重复。', { field: 'groups' })
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '设定条目编号不能重复。', { field: 'entries' })
  for (const group of groups) {
    if (group.parentId && !groupsById.has(group.parentId)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `文件夹“${group.name}”的上级不存在。`, { what: '上级文件夹' })
    const visited = new Set([group.id])
    let parentId = group.parentId
    while (parentId) {
      if (visited.has(parentId)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '设定库文件夹不能形成循环。', { field: 'groups' })
      visited.add(parentId)
      parentId = groupsById.get(parentId)?.parentId ?? ''
    }
  }
  for (const entry of entries) if (entry.groupId && !groupsById.has(entry.groupId)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `设定“${entry.title}”所在的文件夹不存在。`, { what: '设定所在的文件夹' })
  const folderNames = new Set<string>()
  for (const group of groups) {
    const key = `${group.parentId}\u0000${group.name.trim().toLocaleLowerCase()}`
    if (folderNames.has(key)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, `同一位置已存在文件夹“${group.name}”。`, { what: '文件夹名称' })
    folderNames.add(key)
  }
  const entryNames = new Set<string>()
  for (const entry of entries.filter((item) => item.kind === 'normal')) {
    const key = `${entry.groupId}\u0000${entry.title.trim().toLocaleLowerCase()}`
    if (entryNames.has(key)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, `同一位置已存在设定“${entry.title}”。`, { what: '设定名称' })
    entryNames.add(key)
  }
}

function normalizedVersion(source: SettingLibraryVersion, active: boolean, timestamp: string): SettingLibraryVersion {
  const groups = source.groups.map((group, index) => ({
    ...group, name: group.name.trim(), order: Math.max(1, group.order || index + 1),
    treeViewOrder: group.treeViewOrder || index + 1, createdAt: group.createdAt || timestamp,
    updatedAt: active ? timestamp : group.updatedAt || timestamp
  }))
  if (source.entries.some(entry => entry.kind === 'opening' || entry.id === 'fixed-opening-assistant')) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '角色开场白须通过独立开场白配置保存。', { what: '设定库中的开场白', expected: '独立角色开场白配置' })
  }
  const entries = source.entries.map((entry, index) => ({
    ...entry, title: entry.title.trim(), groupId: entry.groupId.trim(),
    agentSelectionHint: entry.agentSelectionHint,
    keywords: [...new Set(entry.keywords.map((item) => item.trim()).filter(Boolean))],
    conditionKeywords: [...new Set(entry.conditionKeywords.map((item) => item.trim()).filter(Boolean))],
    order: Math.max(1, entry.order), treeViewOrder: entry.treeViewOrder || index + 1,
    createdAt: entry.createdAt || timestamp, updatedAt: active ? timestamp : entry.updatedAt || timestamp
  }))
  validateSettingLibraryTree(groups, entries)
  return {
    ...source, name: source.name.trim(), groups, entries,
    expandedGroupIds: [...new Set(source.expandedGroupIds)].filter((id) => groups.some((group) => group.id === id)),
    createdAt: source.createdAt || timestamp, updatedAt: active ? timestamp : source.updatedAt || timestamp
  }
}

export function normalizeSettingLibrary(characterId: string, source?: SettingLibrary): SettingLibrary {
  const timestamp = now()
  const versionId = source?.activeVersionId || source?.versions[0]?.id || `library-${randomUUID()}`
  const activeSource: SettingLibraryVersion = {
    id: versionId, name: source?.name ?? '', entries: source?.entries ?? [], groups: source?.groups ?? [],
    promptPositions: source?.promptPositions ?? [], listAllExpanded: source?.listAllExpanded ?? true,
    expandedGroupIds: source?.expandedGroupIds ?? [],
    createdAt: source?.versions.find((item) => item.id === versionId)?.createdAt ?? '', updatedAt: ''
  }
  const supplied = source?.versions ?? []
  const versions = (supplied.some((version) => version.id === versionId)
    ? supplied.map((version) => version.id === versionId ? activeSource : version)
    : [...supplied, activeSource])
    .filter((version, index, list) => version.id && list.findIndex((item) => item.id === version.id) === index)
    .map((version) => normalizedVersion(version, version.id === versionId, timestamp))
  const active = versions.find((version) => version.id === versionId)!
  return {
    characterId, name: active.name, entries: active.entries, groups: active.groups,
    promptPositions: active.promptPositions, activeVersionId: active.id, versions,
    listAllExpanded: active.listAllExpanded, expandedGroupIds: active.expandedGroupIds
  }
}
