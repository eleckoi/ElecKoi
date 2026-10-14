/** Group only the items already eligible for this request; never activate another entry. */
export function settingSendBatches(library, items, { entryId = item => item.id, boundary = () => '' } = {}) {
  const entries = new Map((library?.entries || []).map(entry => [entry.id, entry]))
  const groups = new Map((library?.groups || []).map(group => [group.id, group]))
  const roots = items.map((_, index) => index)
  const owners = new Map()
  const labels = new Map()
  const root = index => {
    while (roots[index] !== index) { roots[index] = roots[roots[index]]; index = roots[index] }
    return index
  }
  items.forEach((item, index) => {
    const entry = entries.get(entryId(item))
    if (!entry || entry.kind !== 'normal') return
    const keys = []
    if (entry.sendGroupId) keys.push(`selection:${entry.sendGroupId}`)
    let group = groups.get(entry.groupId)
    while (group) {
      if (group.mergeSend) {
        const key = `folder:${group.id}`
        keys.push(key)
        labels.set(key, group.name)
      }
      group = groups.get(group.parentId)
    }
    const location = boundary(item)
    for (const key of keys) {
      const scoped = JSON.stringify([location, key])
      if (owners.has(scoped)) roots[root(index)] = root(owners.get(scoped))
      else owners.set(scoped, index)
    }
    labels.set(index, keys)
  })
  const batches = new Map()
  items.forEach((item, index) => {
    const key = root(index)
    if (!batches.has(key)) batches.set(key, { items: [], keys: new Set() })
    const batch = batches.get(key)
    batch.items.push(item)
    for (const owner of labels.get(index) || []) batch.keys.add(owner)
  })
  return [...batches.values()].map(batch => {
    const folderNames = [...batch.keys].filter(key => key.startsWith('folder:')).map(key => labels.get(key))
    return {
      items: batch.items,
      title: folderNames.length ? folderNames.at(-1) : '组合设定',
      merged: batch.items.length > 1
    }
  })
}

export function settingEntryPaths(library) {
  const groups = new Map((library?.groups || []).map(group => [group.id, group]))
  return new Map((library?.entries || []).map(entry => {
    const parts = [entry.title || '未命名设定']
    let group = groups.get(entry.groupId)
    while (group) { parts.unshift(group.name || '未命名文件夹'); group = groups.get(group.parentId) }
    return [entry.id, parts.join('/')]
  }))
}

export function mergedSettingText(items, title, content) {
  return items.map(item => `【${title(item)}】\n${content(item)}`).join('\n\n')
}

export function compareSettingOrder(library) {
  const groups = new Map((library?.groups || []).map(group => [group.id, group]))
  const path = entry => {
    const order = [Number(entry.treeViewOrder) || 0]
    let group = groups.get(entry.groupId)
    while (group) { order.unshift(Number(group.treeViewOrder) || 0); group = groups.get(group.parentId) }
    return order
  }
  return (left, right) => {
    const a = path(left), b = path(right)
    for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index] - b[index]
    return a.length - b.length || String(left.id).localeCompare(String(right.id))
  }
}
