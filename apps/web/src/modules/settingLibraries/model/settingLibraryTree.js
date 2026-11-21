import { PINNED_ENTRY_IDS } from "./settingLibraryEditing.js";
import { ejsRelatedEntryIds, settingRuleType } from './settingLibraryRules.js';

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

export function treeNodes(library, { creatorPreset = false } = {}) {
  if (!library) return [];
  const ejsRelated = creatorPreset ? new Set() : ejsRelatedEntryIds(library);
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
          ...(item.value.kind === 'normal' ? {
            rule: { enabled: item.value.enabled, type: settingRuleType(item.value, creatorPreset) },
            usesEjs: ejsRelated.has(item.value.id),
          } : {}),
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

  const fixed = library.entries
    .filter((entry) => PINNED_ENTRY_IDS.has(entry.id))
    .sort((left, right) => left.treeViewOrder - right.treeViewOrder || left.id.localeCompare(right.id))
    .map((entry) => ({
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
