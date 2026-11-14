export function rootProcessItems(items = []) {
  const byId = new Map(items.filter(Boolean).map((item) => [item.id, item]));
  const subagentIds = new Set(items
    .filter((item) => item?.kind === 'subagent' || item?.toolName === 'subagent' || item?.toolName === 'subagent_fork')
    .map((item) => item.id));
  return items.filter((item) => !hasAncestor(item, byId, subagentIds));
}

function hasAncestor(item, byId, ancestorIds) {
  let parentId = item?.parentId;
  const visited = new Set();
  while (parentId && !visited.has(parentId)) {
    if (ancestorIds.has(parentId)) return true;
    visited.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return false;
}
