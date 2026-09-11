import { randomUUID } from 'node:crypto'
import type {
  SettingLibrary,
  SettingLibraryEntry,
  SettingLibraryGroup,
  SettingLibraryVersion
} from '@shared/contracts/settingLibrary/schemas'

export const OPENING_ENTRY_ID = 'fixed-opening-assistant'
export const ROLEPLAY_PLAN_ENTRY_ID = 'fixed-roleplay-plan'

const now = (): string => new Date().toISOString()

function openingEntry(source: SettingLibraryEntry | undefined, timestamp: string): SettingLibraryEntry {
  const messages = source?.openingMessages.length ? source.openingMessages : [{
    id: 'opening-default', title: '默认开场', content: source?.content ?? '', initialVariableStateJson: ''
  }]
  const defaultId = messages.some((message) => message.id === source?.defaultOpeningMessageId)
    ? source!.defaultOpeningMessageId
    : messages[0]!.id
  const selected = messages.find((message) => message.id === defaultId)!
  return {
    ...emptyEntry(OPENING_ENTRY_ID, timestamp), ...source,
    id: OPENING_ENTRY_ID, title: 'AI角色开场白', iconId: 'chat', kind: 'opening', groupId: '',
    content: selected.content, openingMessages: messages, defaultOpeningMessageId: defaultId,
    agentReadStrategy: 'normal', agentReadCondition: '', dynamicMode: 'single_condition',
    keywords: [], conditionKeywords: [], keywordCondition: 'none', keywordUseRegex: false,
    keywordIgnoreCase: true, keywordWholeWord: false, keywordRecursionDepth: 0,
    triggerMode: 'always', position: null, promptPositionId: '', insertRole: 'assistant',
    order: 1, viewOrder: 0, groupViewOrder: 0, treeViewOrder: 0,
    createdAt: source?.createdAt || timestamp, updatedAt: timestamp
  }
}

export function isLegacyRoleplayPlanEntry(entry: Pick<SettingLibraryEntry, 'id' | 'kind'>): boolean {
  return entry.id === ROLEPLAY_PLAN_ENTRY_ID || entry.kind === 'roleplay_plan'
}

export function emptyEntry(id: string = randomUUID(), timestamp = now()): SettingLibraryEntry {
  return {
    id, title: '', iconId: '', kind: 'normal', groupId: '', content: '', openingMessages: [],
    defaultOpeningMessageId: '', agentSelectionHint: '', agentReadStrategy: 'normal', agentReadCondition: '',
    dynamicMode: 'single_condition', keywords: [], keywordScanDepth: 1, conditionKeywords: [],
    keywordCondition: 'none', keywordUseRegex: false, keywordIgnoreCase: true, keywordWholeWord: false,
    keywordRecursionDepth: 0, triggerMode: 'always', enabled: true, position: 'after_instructions',
    promptPositionId: '', insertRole: 'user', order: 1, viewOrder: 0, groupViewOrder: 0,
    treeViewOrder: 0, createdAt: timestamp, updatedAt: timestamp
  }
}

function validateTree(groups: SettingLibraryGroup[], entries: SettingLibraryEntry[]): void {
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  if (groupsById.size !== groups.length) throw new Error('设定库文件夹编号不能重复。')
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error('设定条目编号不能重复。')
  for (const group of groups) {
    if (group.parentId && !groupsById.has(group.parentId)) throw new Error(`文件夹“${group.name}”的上级不存在。`)
    const visited = new Set([group.id])
    let parentId = group.parentId
    while (parentId) {
      if (visited.has(parentId)) throw new Error('设定库文件夹不能形成循环。')
      visited.add(parentId)
      parentId = groupsById.get(parentId)?.parentId ?? ''
    }
  }
  for (const entry of entries) if (entry.groupId && !groupsById.has(entry.groupId)) throw new Error(`设定“${entry.title}”所在的文件夹不存在。`)
  const folderNames = new Set<string>()
  for (const group of groups) {
    const key = `${group.parentId}\u0000${group.name.trim().toLocaleLowerCase()}`
    if (folderNames.has(key)) throw new Error(`同一位置已存在文件夹“${group.name}”。`)
    folderNames.add(key)
  }
  const entryNames = new Set<string>()
  for (const entry of entries.filter((item) => item.kind === 'normal')) {
    const key = `${entry.groupId}\u0000${entry.title.trim().toLocaleLowerCase()}`
    if (entryNames.has(key)) throw new Error(`同一位置已存在设定“${entry.title}”。`)
    entryNames.add(key)
  }
}

function normalizedVersion(source: SettingLibraryVersion, active: boolean, timestamp: string): SettingLibraryVersion {
  const groups = source.groups.map((group, index) => ({
    ...group, name: group.name.trim().slice(0, 80), order: Math.max(1, group.order || index + 1),
    treeViewOrder: group.treeViewOrder || index + 1, createdAt: group.createdAt || timestamp,
    updatedAt: active ? timestamp : group.updatedAt || timestamp
  }))
  const opening = openingEntry(source.entries.find((entry) => entry.id === OPENING_ENTRY_ID || entry.kind === 'opening'), timestamp)
  const entries = [opening, ...source.entries.filter((entry) => entry.id !== OPENING_ENTRY_ID && entry.kind !== 'opening' && !isLegacyRoleplayPlanEntry(entry)).map((entry, index) => ({
    ...entry, title: entry.title.trim().slice(0, 120), groupId: entry.groupId.trim(),
    agentSelectionHint: entry.agentSelectionHint.replace(/\s+/g, ' ').trim().slice(0, 500),
    keywords: [...new Set(entry.keywords.map((item) => item.trim()).filter(Boolean))],
    conditionKeywords: [...new Set(entry.conditionKeywords.map((item) => item.trim()).filter(Boolean))],
    order: Math.max(1, entry.order), treeViewOrder: entry.treeViewOrder || index + 1,
    createdAt: entry.createdAt || timestamp, updatedAt: active ? timestamp : entry.updatedAt || timestamp
  }))]
  validateTree(groups, entries)
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
