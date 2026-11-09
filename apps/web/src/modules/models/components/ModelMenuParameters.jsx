import { useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, Toast, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { MainPageContext } from '../../../app/windows/MainPageContext.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ModelIdentityIcon } from './ModelIdentityIcon.jsx';
import { ModelParametersSection } from './ModelParametersSection.jsx';
import { modelParameterState } from '../model/modelConfigDraft.js';
import { useModelCapabilities } from '../hooks/useModelCapabilities.js';

// Unwritten editor state follows the catalog lifetime and is released after a successful write.
const parameterEdits = new WeakMap();

export function ModelProviderLabel({ provider, catalog }) {
  const snapshot = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);
  const config = snapshot.configs.find(item => item.id === provider.id);
  const iconProvider = ['deepseek-account', 'deepseek-official'].includes(provider.id) ? 'deepseek' : config?.builtin ? provider.id : config?.provider || provider.id;
  return <span className="model-provider-label">
    <ModelIdentityIcon providerId={iconProvider} className="model-provider-identity" />
    <span>{provider.name}</span>
  </span>;
}

export function ModelMenuParameters(props) {
  return <ParameterEditor key={JSON.stringify([props.provider.id, props.model.id])} {...props} />;
}

function ParameterEditor({ provider, model, itemRef, cellClassName, labelClassName, valueClassName, catalog }) {
  const tUi = useProductTranslation();
  const view = useContext(MainPageContext);
  const snapshot = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);
  const config = snapshot.configs.find(item => item.id === provider.id);
  const key = JSON.stringify([provider.id, model.id]);
  if (!parameterEdits.has(catalog)) parameterEdits.set(catalog, new Map());
  const drafts = parameterEdits.get(catalog);
  const [open, setOpen] = useState(false), [, refresh] = useState(0), [failure, setFailure] = useState(null);
  const savedEdit = drafts.get(key);
  const edit = useRef(savedEdit || { patch: {}, generation: 0, error: null });
  const timer = useRef(null), mounted = useRef(true), id = useId();
  const fieldsRef = useRef(null);
  const focusFields = () => window.requestAnimationFrame(() => fieldsRef.current?.querySelector('input:not([disabled])')?.focus());
  const callbacks = useRef({ catalog, notify: view?.chat?.notify });
  callbacks.current = { catalog, notify: view?.chat?.notify };
  const option = config?.model_options?.find(item => item.id === model.id);
  const form = { ...config, model: model.id, model_options: (config?.model_options || []).map(item => item.id === model.id ? { ...item, ...edit.current.patch } : item) };
  const state = modelParameterState(form);
  const capabilities = useModelCapabilities(form);
  async function flush() {
    clearTimeout(timer.current);
    const draft = edit.current;
    if (!Object.keys(draft.patch).length || draft.pending === draft.generation) return;
    const generation = draft.generation, patch = { ...draft.patch };
    draft.pending = generation;
    const task = callbacks.current.catalog.saveModelParameters(provider.id, model.id, patch);
    draft.task = task;
    try {
      await task;
      if (draft.generation === generation) {
        draft.patch = {}; draft.error = null;
        drafts.delete(key);
      }
    } catch (error) {
      if (draft.generation === generation) draft.error = error;
      callbacks.current.notify?.('error', error);
      if (mounted.current) setFailure(error);
    } finally {
      if (draft.pending === generation) draft.pending = null;
      if (mounted.current) refresh(value => value + 1);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const changed = () => { if (mounted.current) refresh(value => value + 1); };
    edit.current.task?.then(changed, changed);
    return () => { mounted.current = false; clearTimeout(timer.current); if (!edit.current.error) void flush(); };
  }, []);
  function change(patch) {
    const overrides = new Set(state.activeModelOption?.overrideFields || []);
    for (const [field, key] of [['contextWindowTokens', 'contextWindow'], ['maxOutputTokens', 'maxTokens']]) {
      if (!Object.hasOwn(patch, field)) continue;
      if (patch[field] == null) overrides.delete(key); else overrides.add(key);
      patch = { ...patch, overrideFields: [...overrides] };
    }
    edit.current.patch = { ...edit.current.patch, ...patch };
    edit.current.generation += 1;
    edit.current.error = null;
    drafts.set(key, edit.current);
    setFailure(null); refresh(value => value + 1);
    clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), 400);
  }
  if (!option) return null;
  const error = edit.current.error;
  return <>
    <button ref={itemRef} type="button" role="menuitem" className={cellClassName} aria-expanded={open} aria-controls={id}
      onKeyDown={event => { if (event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); setOpen(true); focusFields(); } }}
      onClick={event => { setOpen(value => !value); if (!open && event.detail === 0) focusFields(); }}>
      <span className={labelClassName}>{tUi('参数')}</span><span className={valueClassName} />
      {open ? <IconChevronDownOutlineRegular size={12} /> : <IconChevronRightOutlineRegular size={12} />}
    </button>
    <div ref={fieldsRef} id={id} className="model-menu-parameters" data-model-parameters-fields="" hidden={!open}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !edit.current.error) void flush(); }}>
      <ModelParametersSection form={form} {...state} modelCapabilities={capabilities} picker menu showReasoningProfileEditor onChange={change} />
      {error && <div className="model-menu-error" role="alert"><span>{error.message}</span><button type="button" onClick={() => void flush()}>{tUi('重试')}</button></div>}
    </div>
    {failure && <Toast text={failure.message} icon={<IconWarningOutlineRegular />} onDone={() => setFailure(null)} />}
  </>;
}
