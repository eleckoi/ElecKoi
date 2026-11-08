import { ELECKOI_FAILURE_CODES, runtimePluginFailure } from './runtime-plugin-failure.mjs'

export function catalogOf(library) {
  const groups = Array.isArray(library?.groups) ? library.groups : []
  const entries = Array.isArray(library?.entries) ? library.entries : []
  const byGroup = new Map(groups.map((group) => [group.id, group]))
  const groupPath = (id) => {
    const parts = [], visited = new Set(); let current = byGroup.get(id)
    while (current && !visited.has(current.id)) { visited.add(current.id); parts.unshift(safeSegment(current.name)); current = byGroup.get(current.parentId) }
    return parts.filter(Boolean).join('/')
  }
  const readable = entries.filter((entry) => !isFixedEntry(entry) && entry.enabled && entry.triggerMode === 'agent_tool' && (String(entry.content || '').trim() || entry.dynamicMode === 'ejs_reference')).map((raw) => {
    const path = [groupPath(raw.groupId), safeSegment(raw.title || '未命名设定')].filter(Boolean).join('/')
    return { raw, path, groupPath: groupPath(raw.groupId), content: String(raw.content || ''),
      selectionHint: raw.agentReadStrategy === 'normal' && raw.contentMode === 'plain_text' ? String(raw.agentSelectionHint || '') : '',
      readStrategy: raw.agentReadStrategy || 'normal' }
  })
  const byPath = new Map(), directories = new Map()
  for (const group of groups) {
    const path = groupPath(group.id)
    if (directories.has(path)) throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, `设定文件夹路径不唯一：${path}。请修改冲突的文件夹名称。`, { what: '设定文件夹路径', path })
    directories.set(path, group.id)
  }
  for (const entry of readable) {
    if (byPath.has(entry.path) || directories.has(entry.path)) {
      throw runtimePluginFailure(ELECKOI_FAILURE_CODES.lookupDuplicate, `设定路径不唯一：${entry.path}。请修改冲突的条目或文件夹名称。`, { what: '设定路径', path: entry.path })
    }
    byPath.set(entry.path, entry)
  }
  return { entries: readable, groups, byGroup, byPath, groupPath }
}


export function directoryExists(catalog, path) { return !path || catalog.groups.some((group) => catalog.groupPath(group.id) === path) }

export function inScope(path, scope) { return !scope || path.startsWith(`${scope}/`) }

export function relative(path, scope) { return scope ? path.slice(scope.length + 1) : path }

export function normalizePath(value, allowRoot) {
  const segments = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!segments.length) return allowRoot ? '' : null
  if (segments.some((part) => part === '.' || part === '..' || safeSegment(part) !== part)) return null
  return segments.join('/')
}

export function safeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/^[. ]+|[. ]+$/g, '') || '未命名'
}

export function globRegex(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '*' && pattern[index + 1] === '*') { source += '.*'; index += 1 }
    else if (character === '*') source += '[^/]*'
    else if (character === '?') source += '[^/]'
    else source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }
  return new RegExp(`${source}$`)
}

function isFixedEntry(entry) {
  return ['fixed-opening-assistant', 'built-in-roleplay-history-compaction'].includes(entry.id)
    || ['opening', 'history_compaction'].includes(entry.kind)
}
