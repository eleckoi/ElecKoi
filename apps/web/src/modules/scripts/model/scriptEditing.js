import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';

export const libraryKey = (scope, ownerId) => JSON.stringify([scope, ownerId]);
export const itemBufferKey = (key, id, field) => JSON.stringify([key, id, field]);

export function findScriptItem(library, id) {
  for (const tree of library.trees) {
    if (tree.id === id) return tree;
    if (tree.type === 'folder') {
      const script = tree.scripts.find(item => item.id === id);
      if (script) return script;
    }
  }
  return null;
}

export function updateScriptItem(library, id, change) {
  return { ...library, trees: library.trees.map(tree => tree.id === id ? { ...tree, ...change }
    : tree.type === 'folder' ? { ...tree, scripts: tree.scripts.map(item => item.id === id ? { ...item, ...change } : item) } : tree) };
}

export function setScriptLibraryEnabled(library, enabled) {
  return { ...library, enabled, trees: library.trees.map(tree => tree.type === 'folder'
    ? { ...tree, enabled, scripts: tree.scripts.map(script => ({ ...script, enabled })) }
    : { ...tree, enabled }) };
}

export function removeScriptItem(library, id) {
  return { ...library, trees: library.trees.filter(tree => tree.id !== id).map(tree => tree.type === 'folder'
    ? { ...tree, scripts: tree.scripts.filter(item => item.id !== id) } : tree) };
}

export function createScriptItem(type, id) {
  if (type === 'folder') return { type, id, name: '新文件夹', enabled: true, icon: '', color: '', scripts: [] };
  return { type: 'script', id, name: '新脚本', enabled: false,
    runtime: { kind: 'eleckoi-module', apiVersion: 1 },
    content: '', info: '', data: {},
    button: { enabled: true, buttons: [] }, export_with: { data: true, button: true } };
}

export function moveScriptItem(library, id, destinationId, direction = 0) {
  const item = findScriptItem(library, id);
  if (!item) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '脚本项目不存在。', { what: '脚本项目' });
  if (direction) {
    const parent = library.trees.find(tree => tree.type === 'folder' && tree.scripts.some(script => script.id === id));
    const source = parent ? parent.scripts : library.trees;
    const index = source.findIndex(candidate => candidate.id === id), target = index + direction;
    if (target < 0 || target >= source.length) return library;
    const next = [...source];
    [next[index], next[target]] = [next[target], next[index]];
    return parent ? updateScriptItem(library, parent.id, { scripts: next }) : { ...library, trees: next };
  }
  if (item.type !== 'script') throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '文件夹不能嵌套。', { what: '文件夹嵌套' });
  const destination = destinationId ? library.trees.find(tree => tree.id === destinationId && tree.type === 'folder') : null;
  if (destinationId && !destination) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '目标文件夹不存在。', { what: '目标文件夹' });
  const next = removeScriptItem(library, id);
  return destination ? updateScriptItem(next, destinationId, { scripts: [...destination.scripts.filter(script => script.id !== id), item] })
    : { ...next, trees: [...next.trees, item] };
}

export function reorderScriptItem(library, id, parentId, destinationIndex) {
  const item = findScriptItem(library, id);
  if (!item) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '脚本项目不存在。', { what: '脚本项目' });
  if (item.type === 'folder' && parentId) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '文件夹不能嵌套。', { what: '文件夹嵌套' });
  const next = removeScriptItem(library, id);
  const folder = parentId ? next.trees.find(tree => tree.id === parentId && tree.type === 'folder') : null;
  if (parentId && !folder) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '目标文件夹不存在。', { what: '目标文件夹' });
  const items = [...(folder ? folder.scripts : next.trees)];
  if (!Number.isInteger(destinationIndex) || destinationIndex < 0 || destinationIndex > items.length) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '脚本排序位置无效。', { field: 'destinationIndex' });
  items.splice(destinationIndex, 0, item);
  return folder ? updateScriptItem(next, parentId, { scripts: items }) : { ...next, trees: items };
}

function parseScriptObject(text, label) {
  let value;
  try { value = JSON.parse(text); } catch { throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `${label}不是有效的 JSON。`, { what: label }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `${label}必须是 JSON 对象。`, { what: label });
  return value;
}

export function materializeScriptBuffers(library, buffers) {
  const key = libraryKey(library.scope, library.ownerId);
  let next = library;
  for (const [address, text] of Object.entries(buffers)) {
    const [owner, id, field] = JSON.parse(address);
    if (owner !== key) continue;
    if (!id && field === 'variables') next = { ...next, variables: parseScriptObject(text, '脚本库变量') };
    else {
      const item = findScriptItem(next, id);
      if (item?.type !== 'script' || !['data', 'button', 'export_with'].includes(field)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '编辑的脚本设置不再存在。', { what: '脚本设置' });
      next = updateScriptItem(next, id, { [field]: parseScriptObject(text, item.name || '脚本设置') });
    }
  }
  return next;
}
