import { randomUUID } from 'node:crypto';

export function scriptTreeKey(type, characterId, presetId) {
  if (type === 'global') return 'global';
  if (type === 'character' && characterId) return `character:${characterId}`;
  if (type === 'preset' && presetId) return `preset:${presetId}`;
  throw new Error(`脚本库作用域未就绪：${type}`);
}
export function normalizeScriptTrees(trees) {
  if (!Array.isArray(trees)) throw new TypeError('Script trees must be an array');
  const ids = new Set();
  function normalize(value, insideFolder = false) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid script tree item');
    const type = value.type || 'script';
    if (!['script', 'folder'].includes(type) || insideFolder && type !== 'script') throw new Error(`未知脚本类型：${type}`);
    const id = value.id || randomUUID();
    if (ids.has(id)) throw new Error(`脚本 id 重复：${id}`);
    ids.add(id);
    const base = { ...value, type, id, name: value.name ?? '', enabled: value.enabled ?? true };
    if (type === 'folder') return { ...base, icon: value.icon ?? '', color: value.color ?? '', scripts: (value.scripts || []).map(item => normalize(item, true)) };
    const button = value.button || {};
    if (typeof (value.content ?? '') !== 'string') throw new TypeError(`Script content must be text: ${id}`);
    return { ...base, content: value.content ?? '', info: value.info ?? '', data: value.data ?? {},
      button: { ...button, enabled: button.enabled ?? true, buttons: (button.buttons || []).map(item => ({ ...item, visible: item.visible ?? true })) },
      export_with: value.export_with ?? { data: true, button: true } };
  }
  return trees.map(item => normalize(item));
}
export function scriptTreesSnapshot(store, characterId, presetId) {
  return Object.fromEntries(['global', 'character', 'preset'].map(type => [type,
    type !== 'global' && !(type === 'character' ? characterId : presetId) ? [] : store.get('script-trees', scriptTreeKey(type, characterId, presetId)) ?? []]));
}
export function activeScriptManifests(store, characterId, presetId) {
  const active = Object.fromEntries(Object.entries(store.list('plugins')).filter(([, manifest]) => manifest.enabled !== false));
  for (const [scope, trees] of Object.entries(scriptTreesSnapshot(store, characterId, presetId))) {
    for (const tree of trees) {
      if (tree.enabled === false) continue;
      for (const script of tree.type === 'folder' ? tree.scripts : [tree]) {
        if (script.enabled === false) continue;
        if (Object.hasOwn(active, script.id) || store.get('plugins', script.id) !== null) throw new Error(`启用的脚本或插件 id 重复：${script.id}`);
        active[script.id] = { ...script, source: script.content, scriptScope: scope };
      }
    }
  }
  return active;
}

/** Script buttons use the existing UI registry; authored panels retain ownership. */
export function synchronizeScriptButtonUi(store, manifests, publish) {
  const source = 'eleckoi-script-buttons', changes = [];
  const owners = new Set([...store.scopes('ui:').map(scope => scope.slice(3)), ...Object.keys(manifests)]);
  store.atomic(() => {
    for (const owner of owners) {
      const existing = store.list(`ui:${owner}`), manifest = manifests[owner], desired = new Map();
      if (manifest && manifest.button?.enabled !== false) {
        for (const button of manifest.button?.buttons || []) {
          if (button.visible === false) continue;
          if (typeof button.name !== 'string') throw new TypeError(`Script button name must be text: ${owner}`);
          const id = button.name;
          if (existing[id] && existing[id].source !== source) {
            throw new Error(`脚本按钮与已注册界面的 id 冲突：${owner}/${id}`);
          }
          desired.set(id, { ...button, id, label: id, kind: 'script-button', source,
            scriptName: manifest.name || owner, event: `plugin:${owner}:button:${id}` });
        }
      }
      for (const [id, descriptor] of Object.entries(existing)) {
        if (descriptor.source === source && !desired.has(id)) {
          store.delete(`ui:${owner}`, id); changes.push({ event: 'ui.unregistered', payload: { pluginId: owner, id } });
        }
      }
      for (const [id, descriptor] of desired) {
        if (JSON.stringify(existing[id]) === JSON.stringify(descriptor)) continue;
        store.put(`ui:${owner}`, id, descriptor);
        changes.push({ event: 'ui.registered', payload: { pluginId: owner, descriptor } });
      }
    }
  });
  for (const change of changes) publish(change);
}
