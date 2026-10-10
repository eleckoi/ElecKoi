export const FRONTEND_VIEWS = ['main', 'chat', 'character-editor', 'character-manager', 'preset-manager', 'creator-studio'];
const registrant = '@eleckoi/application-frontend';

/** The live DSH declaration tree is authoritative, including plugin-created slots. */
export function collectFrontendTargets(slots) {
  const result = FRONTEND_VIEWS.map(view => ({ target: 'root', view }));
  const visit = node => {
    if (node.type === 'slot' && node.name !== 'root') {
      const entries = slots.entries(node.name).filter(entry => entry.registrant !== registrant);
      result.push({ target: 'slot', slot: node.name, kind: node.kind, scope: node.scope,
        entryKeys: entries.map(entry => entry.options.key ?? entry.options.id).filter(Boolean) });
      if (node.name === 'main') for (const pageId of new Set(entries.map(entry => entry.options.key).filter(Boolean))) {
        result.push({ target: 'page', pageId, view: 'main', slot: 'main' });
      }
    }
    node.children?.forEach(visit);
  };
  slots.snapshot().forEach(visit);
  return result;
}

export function validateFrontendBindings(project, targets, view) {
  if (!project) return [];
  const manifest = project.manifest;
  if (!manifest || manifest.manifestVersion !== 1) throw new Error(`${project.name}: 不支持的前端 manifest 版本`);
  // 0.1 projects use the compatibility SDK; 1.x adds the application facade.
  if (!/^(0\.1\.|1\.)/.test(manifest.sdkVersion)) throw new Error(`${project.name}: 不支持 SDK ${manifest.sdkVersion}`);
  for (const binding of manifest.bindings || []) if (binding.view && !FRONTEND_VIEWS.includes(binding.view)) throw new Error(`${project.name}: 未注册的窗口 ${binding.view}`);
  for (const binding of manifest.bindings || []) if (binding.target === 'page' && binding.view && binding.view !== 'main') throw new Error(`${project.name}: main 页面 ${binding.pageId} 不属于窗口 ${binding.view}`);
  const bindings = (manifest.bindings || []).filter(binding => (!binding.view || binding.view === view) && (binding.target !== 'page' || view === 'main'));
  for (const binding of bindings) {
    if (binding.target === 'root') continue;
    const target = targets.find(item => binding.target === 'page' ? item.target === 'page' && item.pageId === binding.pageId
      : item.target === 'slot' && item.slot === binding.slot);
    if (!target) throw new Error(`${project.name} · ${binding.entryFile}: 未注册的 ${binding.target} ${binding.pageId || binding.slot}`);
    if (['keyed', 'list'].includes(target.kind) && !binding.entryKey) throw new Error(`${binding.slot}: 必须指定 entryKey`);
  }
  if (bindings.filter(binding => binding.target === 'root').length > 1) throw new Error(`${project.name}: 当前窗口存在多个 root 绑定`);
  const identities = new Set();
  for (const binding of bindings) {
    const identity = binding.target === 'page' ? `main:${binding.pageId}` : `${binding.slot || 'root'}:${binding.entryKey || ''}`;
    if (identities.has(identity)) throw new Error(`${project.name}: 重复绑定 ${identity}`);
    identities.add(identity);
  }
  return bindings;
}

/** Lower DSH priorities win. Root remains owned by the original shell. */
export function installFrontendBindings(slots, bindings, component) {
  const stops = [];
  try {
    for (const binding of bindings.filter(binding => binding.target !== 'root')) {
      const name = binding.target === 'page' ? 'main' : binding.slot;
      const kind = slots.spec(name)?.kind;
      const entries = slots.entries(name);
      const priority = Math.min(0, ...entries.map(entry => entry.options.priority ?? 0)) - 1;
      const options = { name, priority, registrant,
        ...(kind === 'keyed' ? { key: binding.target === 'page' ? binding.pageId : binding.entryKey } : {}),
        ...(kind === 'list' ? { id: binding.entryKey } : {}),
        ...(kind === 'chain' ? { select: () => true } : {}) };
      stops.push(slots.register(options, props => component(binding, props)));
    }
  } catch (error) { stops.reverse().forEach(stop => stop()); throw error; }
  return () => stops.reverse().forEach(stop => stop());
}

export function frontendAssetUrl(project, path, revision) {
  return `/eleckoi/frontends/${encodeURIComponent(project.id)}/${path.split('/').map(encodeURIComponent).join('/')}?revision=${encodeURIComponent(revision ?? project.updatedAt ?? '')}`;
}
