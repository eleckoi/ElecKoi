const fixedIds = new Set(['fixed-opening-assistant', 'built-in-roleplay-history-compaction'])

export function requiredSettingCache(library) {
  const groups = new Map((library?.groups || []).map((group) => [group.id, group]))
  const orderPath = (entry) => {
    const path = [Number(entry.treeViewOrder) || 0]
    const visited = new Set()
    let group = groups.get(entry.groupId)
    while (group && !visited.has(group.id)) {
      visited.add(group.id)
      path.unshift(Number(group.treeViewOrder) || 0)
      group = groups.get(group.parentId)
    }
    return path
  }
  const compare = (left, right) => {
    const a = orderPath(left), b = orderPath(right)
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      if (a[index] !== b[index]) return a[index] - b[index]
    }
    return a.length - b.length || String(left.id).localeCompare(String(right.id))
  }
  return (library?.entries || [])
    .filter((entry) => entry?.enabled && entry.triggerMode === 'agent_tool'
      && entry.agentReadStrategy === 'required' && entry.dynamicMode !== 'ejs_reference'
      && !['opening', 'history_compaction'].includes(entry.kind)
      && !fixedIds.has(entry.id) && String(entry.content || '').trim())
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id) === index)
    .sort(compare)
    .map((entry, index) => {
      const reference = `#S${String(index + 1).padStart(2, '0')}`
      const title = String(entry.title || '').trim() || '未命名设定'
      const content = String(entry.content)
      return {
        id: entry.id, title, content, reference,
        prompt: `[Setting ${reference}: ${title}]\n${content}`,
        receipt: `已读取：${reference}「${title}」；正文见本轮前置的 [Setting ${reference}: ${title}]。`
      }
    })
}
