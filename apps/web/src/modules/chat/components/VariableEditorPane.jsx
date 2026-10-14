import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, FloppyDisk, ArrowClockwise } from '@phosphor-icons/react';

const noSubscribe = () => () => {}, noRevision = () => 0;
export function VariableEditorPane({ conversationId, runtime, onNotify, onDirtyChange }) {
  const [scopes, setScopes] = useState([]), [selected, setSelected] = useState('');
  const [draft, setDraft] = useState(''), [saved, setSaved] = useState(''), [value, setValue] = useState({});
  const [description, setDescription] = useState(null), [error, setError] = useState(''), [schemaError, setSchemaError] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [reload, setReload] = useState(0);
  const generation = useRef(0), textarea = useRef(null);
  const revision = useSyncExternalStore(runtime?.subscribeVariableSchemas || noSubscribe, runtime?.getVariableSchemaRevision || noRevision, noRevision);
  const target = scopes.find(scope => scope.key === selected);
  useEffect(() => {
    let active = true;
    if (!runtime) { setLoading(false); setError('原生变量服务尚未就绪。'); return; }
    runtime.listVariableEditorScopes(conversationId).then(items => {
      if (!active) return; setScopes(items); setSelected(current => items.some(item => item.key === current) ? current : items[0]?.key || '');
    }).catch(cause => { if (active) { setError(cause.message); setLoading(false); } });
    return () => { active = false; };
  }, [conversationId, runtime, revision]);
  useEffect(() => {
    if (!target || !runtime) return;
    let active = true; generation.current++; setLoading(true); setError('');
    runtime.readVariableEditorScope(conversationId, target).then(variables => {
      if (!active) return;
      const text = JSON.stringify(variables, null, 2); setValue(variables); setDraft(text); setSaved(text); setLoading(false);
    }).catch(cause => { if (active) { setError(cause.message); setLoading(false); } });
    return () => { active = false; generation.current++; };
  }, [conversationId, runtime, selected, reload]);
  useEffect(() => {
    if (!target || !runtime) return;
    let active = true; setSchemaError('');
    runtime.describeVariableEditorSchema(target, value).then(result => { if (active) setDescription(result); })
      .catch(cause => { if (active) { setDescription(null); setSchemaError(cause.message); } });
    return () => { active = false; };
  }, [runtime, selected, revision, value]);
  const dirty = draft !== saved;
  useEffect(() => { onDirtyChange?.(dirty || saving); return () => onDirtyChange?.(false); }, [dirty, saving, onDirtyChange]);
  async function save() {
    if (!target) return;
    const current = generation.current; setSaving(true); setError('');
    try {
      const variables = JSON.parse(draft);
      const result = await runtime.saveVariableEditorScope(conversationId, target, variables);
      if (current !== generation.current) return;
      const text = JSON.stringify(result, null, 2); setDraft(text); setSaved(text); setValue(result); onNotify?.('success', '变量已保存');
    } catch (cause) { if (current === generation.current) setError(cause.message); }
    finally { setSaving(false); }
  }
  function select(event) {
    if (dirty && !window.confirm('当前变量尚未保存，放弃修改并切换作用域？')) return;
    setSelected(event.target.value);
  }
  function refresh() {
    if (dirty && !window.confirm('重新读取会覆盖未保存的变量修改，继续？')) return;
    setReload(value => value + 1);
  }
  return <section className="variable-editor-pane" aria-label="变量编辑">
    <div className="variable-editor-toolbar">
      <label><span>作用域</span><select aria-label="变量作用域" value={selected} onChange={select} disabled={saving}>{scopes.map(scope => <option key={scope.key} value={scope.key}>{scope.label}</option>)}</select></label>
      <button type="button" className="variable-editor-icon" title="重新读取" aria-label="重新读取变量" onClick={refresh} disabled={loading || saving}><ArrowClockwise /></button>
      <button type="button" className="variable-editor-save" onClick={save} disabled={loading || saving || !target || !dirty}>
        {dirty ? <FloppyDisk /> : <Check />}<span>{saving ? '保存中' : dirty ? '保存' : '已保存'}</span>
      </button>
    </div>
    {description?.kind !== 'none' && description ? <details className="variable-editor-schema"><summary>{description.kind === 'zod' ? 'Zod' : 'JSON Schema'}{description.source ? ` · ${description.source}` : ''}</summary>
      {description.schema !== null ? <pre>{JSON.stringify(description.schema, null, 2)}</pre> : null}
      {description.note ? <p>{description.note}</p> : null}
    </details> : null}
    {schemaError ? <p className="variable-editor-error" role="alert">Schema：{schemaError}</p> : null}
    {error ? <p className="variable-editor-error" role="alert">{error}</p> : null}
    {loading ? <p className="variable-viewer-empty">正在读取变量</p> : <textarea ref={textarea} aria-label="变量 JSON" className="variable-editor-json" value={draft} onChange={event => setDraft(event.target.value)} spellCheck={false} disabled={saving || !target} />}
  </section>;
}
