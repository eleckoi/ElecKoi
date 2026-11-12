import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useEffect, useMemo, useRef, useState } from 'react';
import { decodeEditorVersionContent, editorLibraryVersionsSchema } from '@shared/contracts/editorVersions/schemas';
import { resolveFailure } from '../../utils/failureText.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Version drafts share the editor's save and discard boundary. */
export function useEditorLibraryVersions({ kind, scope, ownerId, service, capture, apply, editorDirty }) {
  const tUi = useProductTranslation();
  const [drafts, setDrafts] = useState({}), [baselines, setBaselines] = useState({}), [error, setError] = useState('');
  const refs = useRef({ drafts: {}, baselines: {}, generation: 0, request: 0, pending: null });
  const callbacks = useRef({ capture, apply, editorDirty });
  callbacks.current = { capture, apply, editorDirty };
  const addresses = [{ scope: 'global', ownerId: '' }, { scope, ownerId }];
  const ready = addresses.every(address => Boolean(drafts[address.scope]));
  const dirty = useMemo(() => !same(drafts, baselines), [drafts, baselines]);
  const normalize = value => { const parsed = editorLibraryVersionsSchema.parse(value); return { ...parsed,
    versions: parsed.versions.map(version => ({ ...version, content: JSON.stringify(decodeEditorVersionContent(kind, version.content)) })) }; };
  function adopt(next) { refs.current.drafts = next; setDrafts(next); }
  function reload() {
    const generation = refs.current.generation, request = ++refs.current.request;
    return Promise.all(addresses.map(address => service.read(address.scope, address.ownerId))).then(values => {
      if (generation !== refs.current.generation || request !== refs.current.request) return;
      const next = Object.fromEntries(values.map(value => {
        const parsed = normalize(value);
        if (parsed.kind !== kind || parsed.ownerId !== (parsed.scope === 'global' ? '' : ownerId)
          || !['global', scope].includes(parsed.scope)) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '配置版本归属不匹配。', { what: '配置版本归属' });
        return [parsed.scope, parsed];
      }));
      if (Object.values(next).some(value => value.revision < (refs.current.baselines[value.scope]?.revision ?? 0))) return;
      const changed = !same(next, refs.current.baselines);
      const conflicting = Object.keys(next).some(key => {
        const baseline = refs.current.baselines[key], draft = refs.current.drafts[key];
        if (!baseline || same(next[key], baseline)) return false;
        if (!same(draft, baseline)) return true;
        try {
          const local = sync(draft).versions.find(version => version.id === draft.activeVersionId)?.content;
          const old = baseline.versions.find(version => version.id === baseline.activeVersionId)?.content;
          const incoming = next[key].versions.find(version => version.id === next[key].activeVersionId)?.content;
          return local !== old && local !== incoming;
        } catch { return true; }
      });
      if (conflicting) {
        refs.current.pending = next; setError(tUi("配置版本已在其他窗口更新，请退出并放弃未保存修改后重新载入。")); return;
      }
      if (changed) {
        refs.current.drafts = next; refs.current.baselines = next;
        setDrafts(next); setBaselines(next); setError('');
      }
    }).catch(cause => { if (generation === refs.current.generation) setError(resolveFailure(cause, { fallback: tUi("读取配置版本失败") }).text); });
  }
  useEffect(() => {
    ++refs.current.generation;
    refs.current.drafts = {}; refs.current.baselines = {}; refs.current.pending = null;
    setDrafts({}); setBaselines({}); setError('');
    if (!service) { setError(tUi("配置版本服务尚未就绪。")); return; }
    void reload();
    const stop = service.subscribe(() => void reload());
    return () => { refs.current.generation++; stop(); };
  }, [kind, scope, ownerId, service]);

  function sync(library) {
    const active = library.versions.find(version => version.id === library.activeVersionId);
    const original = decodeEditorVersionContent(kind, active.content);
    const content = JSON.stringify(decodeEditorVersionContent(kind, JSON.stringify(callbacks.current.capture(library.scope, original))));
    return { ...library, versions: library.versions.map(version => version.id === library.activeVersionId ? { ...version, content } : version) };
  }
  function change(targetScope, operation) {
    const current = refs.current.drafts[targetScope];
    if (!current) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, '配置版本尚未载入。', { what: '配置版本' });
    setError('');
    const next = operation(sync(current));
    adopt({ ...refs.current.drafts, [targetScope]: editorLibraryVersionsSchema.parse(next) });
    return next;
  }
  function select(targetScope, id) {
    const next = change(targetScope, current => {
      if (!current.versions.some(version => version.id === id)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '指定的配置版本不存在。', { what: '配置版本' });
      return { ...current, activeVersionId: id };
    });
    callbacks.current.apply(targetScope, decodeEditorVersionContent(kind, next.versions.find(version => version.id === id).content));
  }
  function create(targetScope, name, copy = false, imported) {
    const blank = kind === 'scripts' ? { enabled: false, trees: [], variables: {}, files: [] }
      : { enabled: true, rules: [] };
    const next = change(targetScope, current => {
      const active = current.versions.find(version => version.id === current.activeVersionId);
      const content = imported ? JSON.stringify(imported) : copy ? active.content : JSON.stringify(blank);
      const id = crypto.randomUUID();
      return { ...current, activeVersionId: id, versions: [...current.versions, { id, name, content }] };
    });
    callbacks.current.apply(targetScope, decodeEditorVersionContent(kind, next.versions.find(version => version.id === next.activeVersionId).content));
  }
  function rename(targetScope, name) { change(targetScope, current => ({ ...current,
    versions: current.versions.map(version => version.id === current.activeVersionId ? { ...version, name } : version) })); }
  function remove(targetScope) {
    const current = refs.current.drafts[targetScope];
    const next = change(targetScope, current => {
      const index = current.versions.findIndex(version => version.id === current.activeVersionId);
      const versions = current.versions.filter(version => version.id !== current.activeVersionId);
      if (!versions.length) {
        const content = kind === 'scripts' ? { enabled: false, trees: [], variables: {}, files: [] }
          : { enabled: true, rules: [] };
        versions.push({ id: crypto.randomUUID(), name: '默认版本', content: JSON.stringify(content) });
      }
      return { ...current, versions, activeVersionId: versions[Math.min(index, versions.length - 1)].id };
    });
    callbacks.current.apply(targetScope, decodeEditorVersionContent(kind, next.versions.find(version => version.id === next.activeVersionId).content));
  }
  function prepare() {
    if (!ready || error) throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, error || '配置版本尚未载入。', { what: '载入配置版本' });
    return Object.values(refs.current.drafts).map(sync).filter(value => !same(value, refs.current.baselines[value.scope]));
  }
  function acceptSaved(values) {
    const next = { ...refs.current.baselines, ...Object.fromEntries(values.map(value => [value.scope, normalize(value)])) };
    refs.current.drafts = next; refs.current.baselines = next; refs.current.pending = null;
    setDrafts(next); setBaselines(next); setError('');
  }
  function discard() { const next = refs.current.pending || refs.current.baselines; refs.current.baselines = next; refs.current.pending = null;
    adopt(next); setBaselines(next); setError(''); void reload(); }
  function exportVersion(targetScope) {
    const current = sync(refs.current.drafts[targetScope]), active = current.versions.find(version => version.id === current.activeVersionId);
    return { fileName: `${active.name.replace(/[\\/:*?"<>|]/g, '-')}.json`, json: JSON.stringify({
      format: 'eleckoi.editor-library-version', version: 1, kind, name: active.name, content: active.content,
    }, null, 2) };
  }
  function importVersion(targetScope, json) {
    const document = JSON.parse(json);
    if (!document || document.format !== 'eleckoi.editor-library-version' || document.version !== 1 || document.kind !== kind
      || typeof document.name !== 'string' || typeof document.content !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '配置版本文件的格式或类型不匹配。', { what: '配置版本文件' });
    const content = decodeEditorVersionContent(kind, document.content);
    if ('enabled' in content) content.enabled = false;
    const names = new Set(refs.current.drafts[targetScope].versions.map(version => version.name));
    const base = document.name.trim() || tUi("导入版本");
    let name = base, suffix = 1;
    while (names.has(name)) name = `${base} ${++suffix}`;
    create(targetScope, name, false, content);
  }
  return { drafts, dirty, ready, error, setError, prepare, acceptSaved, discard, select, create, rename, remove,
    exportVersion, importVersion, current: targetScope => drafts[targetScope] };
}
