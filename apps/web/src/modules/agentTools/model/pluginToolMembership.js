/** Membership and provider identity are independent; one plugin opens one complete tool list. */
export function pluginToolSections(presetGroups, extraGroups = []) {
  const plugins = new Map();
  const seen = new Map();
  for (const tool of [...presetGroups.filter(group => group.included && group.source === 'extension'), ...extraGroups]) {
    const source = tool.plugin || { id: 'unattributed', name: '未标注来源的工具' };
    let plugin = plugins.get(source.id);
    if (!plugin) {
      plugin = { id: `plugin:${source.id}`, name: source.name, source: 'extension', tools: [], isPlugin: true };
      plugins.set(source.id, plugin);
      seen.set(source.id, new Set());
    }
    if (!seen.get(source.id).has(tool.id)) { plugin.tools.push(tool); seen.get(source.id).add(tool.id); }
  }
  const groups = [...plugins.values()].map(plugin => ({ ...plugin,
    members: plugin.tools.flatMap(tool => tool.members),
    included: plugin.tools.some(tool => tool.included),
    includedCount: plugin.tools.filter(tool => tool.included).length,
    enabled: plugin.tools.some(tool => tool.enabled),
    available: plugin.tools.some(tool => tool.available !== false),
    description: '',
  }));
  return {
    preset: [...presetGroups.filter(group => group.included && group.source !== 'extension'), ...groups.filter(group => group.included)],
    extra: groups.filter(group => !group.included),
  };
}
