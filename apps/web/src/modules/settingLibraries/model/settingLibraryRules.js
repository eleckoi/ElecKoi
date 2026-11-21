import { tavernReferencedSettingTitles } from '@shared/foundation/tavernWorldBook';
import { FIXED_ENTRY_IDS } from './settingLibraryEditing.js';

export function settingRuleType(entry, creatorPreset = false) {
  if (entry.triggerMode === 'always' || entry.agentReadStrategy === 'required') return 'always';
  return !creatorPreset && entry.agentReadStrategy === 'keyword' ? 'keyword' : 'lookup';
}

export function referencedEjsTitles(body) {
  // Inspect code tags only. Computed names are resolved by getwi when the template runs.
  const code = [...body.matchAll(/<%(?![%#])([\s\S]*?)%>/g)].map(match => match[1]).join('\n');
  return tavernReferencedSettingTitles(code);
}

function pathSegment(value) {
  return value.trim().replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f]/g, '').replace(/^[. ]+|[. ]+$/g, '') || '未命名';
}

export function ejsRelatedEntryIds(library) {
  const ejs = library.entries.filter(entry => entry.contentMode === 'ejs');
  const related = new Set(ejs.map(entry => entry.id));
  const targets = new Set(ejs.flatMap(entry => [...referencedEjsTitles(entry.content)]));
  if (!targets.size) return related;

  const groups = new Map(library.groups.map(group => [group.id, group]));
  const byAlias = new Map();
  for (const entry of library.entries) {
    if (FIXED_ENTRY_IDS.has(entry.id) || entry.kind === 'opening' || entry.kind === 'history_compaction') continue;
    const segments = [pathSegment(entry.title || '未命名设定')];
    const visited = new Set();
    for (let group = groups.get(entry.groupId); group && !visited.has(group.id); group = groups.get(group.parentId)) {
      visited.add(group.id);
      segments.unshift(pathSegment(group.name));
    }
    for (const alias of new Set([entry.title, segments.join('/')])) {
      if (!targets.has(alias)) continue;
      const matches = byAlias.get(alias) ?? [];
      matches.push(entry.id);
      byAlias.set(alias, matches);
    }
  }
  for (const matches of byAlias.values()) {
    if (matches.length === 1) related.add(matches[0]);
  }
  return related;
}
