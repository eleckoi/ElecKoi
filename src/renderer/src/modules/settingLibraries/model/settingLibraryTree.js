import { PINNED_ENTRY_IDS } from "./settingLibraryEditing.js";

export function nodeKey(kind, id) {
  return `${kind}:${id}`;
}

export function parseNodeKey(key) {
  const separator = key.indexOf(":");
  return separator < 0 ? { kind: "", id: "" } : { kind: key.slice(0, separator), id: key.slice(separator + 1) };
}

function searchableEntryText(entry) {
  return [
    entry.title,
    entry.content,
    ...(entry.openingMessages || []).flatMap((message) => [message.title, message.content]),
  ].join("\n").toLocaleLowerCase();
}

export function treeNodes(library) {
  if (!library) return [];
  const groupsByParent = new Map();
  const entriesByGroup = new Map();
  for (const group of library.groups) {
    const siblings = groupsByParent.get(group.parentId) || [];
    siblings.push(group);
    groupsByParent.set(group.parentId, siblings);
  }
  for (const entry of library.entries.filter((item) => !PINNED_ENTRY_IDS.has(item.id))) {
    const siblings = entriesByGroup.get(entry.groupId) || [];
    siblings.push(entry);
    entriesByGroup.set(entry.groupId, siblings);
  }

  const build = (parentId) => {
    const nodes = [
      ...(groupsByParent.get(parentId) || []).map((group) => ({ kind: "group", value: group, order: group.treeViewOrder })),
      ...(entriesByGroup.get(parentId) || []).map((entry) => ({ kind: "entry", value: entry, order: entry.treeViewOrder })),
    ].sort((left, right) => left.order - right.order || left.value.id.localeCompare(right.value.id));
    return nodes.map((item) => {
      if (item.kind === "entry") {
        return {
          id: nodeKey("entry", item.value.id),
          key: nodeKey("entry", item.value.id),
          value: nodeKey("entry", item.value.id),
          name: item.value.title || "未命名设定",
          label: item.value.title || "未命名设定",
          searchText: searchableEntryText(item.value),
          nodeKind: "entry",
          recordId: item.value.id,
          enabled: item.value.enabled,
          iconId: item.value.iconId,
          dynamicMode: item.value.dynamicMode,
          entryKind: item.value.kind,
          fixed: false,
          isLeaf: true,
        };
      }
      const children = build(item.value.id);
      return {
        id: nodeKey("group", item.value.id),
        key: nodeKey("group", item.value.id),
        value: nodeKey("group", item.value.id),
        name: item.value.name || "未命名文件夹",
        label: item.value.name || "未命名文件夹",
        searchText: item.value.name.toLocaleLowerCase(),
        nodeKind: "group",
        recordId: item.value.id,
        childCount: (groupsByParent.get(item.value.id)?.length || 0) + (entriesByGroup.get(item.value.id)?.length || 0),
        fixed: false,
        children,
      };
    });
  };

  const fixed = library.entries.filter((entry) => PINNED_ENTRY_IDS.has(entry.id)).map((entry) => ({
    id: nodeKey("entry", entry.id),
    key: nodeKey("entry", entry.id),
    value: nodeKey("entry", entry.id),
    name: entry.title,
    label: entry.title,
    searchText: searchableEntryText(entry),
    nodeKind: "entry",
    recordId: entry.id,
    enabled: entry.enabled,
    entryKind: entry.kind,
    dynamicMode: entry.dynamicMode,
    fixed: true,
    isLeaf: true,
  }));
  return [...fixed, ...build("")];
}

export function findSelected(library, selectedKey) {
  const { kind, id } = parseNodeKey(selectedKey);
  if (kind === "group") return { kind, value: library?.groups.find((group) => group.id === id) || null };
  if (kind === "entry") return { kind, value: library?.entries.find((entry) => entry.id === id) || null };
  return { kind: "", value: null };
}

export function descendants(groups, groupId) {
  const ids = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (ids.has(group.parentId) && !ids.has(group.id)) {
        ids.add(group.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function hasSearchResults(library, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return library.groups.some((group) => group.name.toLocaleLowerCase().includes(needle))
    || library.entries.some((entry) => searchableEntryText(entry).includes(needle));
}
