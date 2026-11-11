import { useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Button, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, Tag, Toast, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { MainPageContext } from '../../../app/windows/MainPageContext.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ModelIdentityIcon } from './ModelIdentityIcon.jsx';
import { ModelParametersSection } from './ModelParametersSection.jsx';
import { modelParameterState } from '../model/modelConfigDraft.js';
import { useModelCapabilities } from '../hooks/useModelCapabilities.js';
import { UnsavedChangesDialog } from '../../../ui/ui/UnsavedChangesDialog.jsx';

// Unsaved drafts follow the catalog lifetime until explicitly saved or cancelled.
const parameterEdits = new WeakMap();

export function ModelLabel({ provider, model, placement, catalog, resolveText }) {
  const snapshot = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);
  const config = snapshot.configs.find(item => item.id === provider.id);
  const iconProvider = ['deepseek-account', 'deepseek-official'].includes(provider.id) ? 'deepseek' : config?.builtin ? provider.id : config?.provider || provider.id;
  const badge = model.badge && <Tag className="model-selection-badge" tone={model.badge.tone}>{resolveText(model.badge.text)}</Tag>;
  return <span className="model-selection-label">
    {placement === 'trigger' && <ModelIdentityIcon modelName={model.id} providerId={iconProvider} className="model-trigger-identity" />}
    {placement === 'trigger' && badge}
    <span className="model-selection-name">{model.name}</span>
    {placement !== 'trigger' && badge}
  </span>;
}

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

function ParameterEditor({ provider, model, itemRef, cellClassName, labelClassName, valueClassName, registerLeaveGuard, catalog }) {
  const tUi = useProductTranslation();
  const view = useContext(MainPageContext);
  const snapshot = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);
  const config = snapshot.configs.find(item => item.id === provider.id);
  const key = JSON.stringify([provider.id, model.id]);
  if (!parameterEdits.has(catalog)) parameterEdits.set(catalog, new Map());
  const drafts = parameterEdits.get(catalog);
  const [open, setOpen] = useState(false), [, refresh] = useState(0), [failure, setFailure] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const pendingLeave = useRef(null), leaving = useRef(false);
  const savedEdit = drafts.get(key);
  const edit = useRef(savedEdit || { patch: {}, generation: 0, error: null });
  const mounted = useRef(true), id = useId();
  const fieldsRef = useRef(null);
  const focusFields = () => window.requestAnimationFrame(() => fieldsRef.current?.querySelector('input:not([disabled])')?.focus());
  const callbacks = useRef({ catalog, notify: view?.chat?.notify });
  callbacks.current = { catalog, notify: view?.chat?.notify };
  const option = config?.model_options?.find(item => item.id === model.id);
  const form = { ...config, model: model.id, model_options: (config?.model_options || []).map(item => item.id === model.id ? { ...item, ...edit.current.patch } : item) };
  const state = modelParameterState(form, config?.provider);
  const capabilities = useModelCapabilities(form);
  function finish() {
    setOpen(false);
    fieldsRef.current?.previousElementSibling?.focus();
  }
  async function save(proceed) {
    const draft = edit.current;
    if (!Object.keys(draft.patch).length || draft.pending != null || state.parameterError) return;
    const generation = draft.generation, patch = { ...draft.patch };
    draft.pending = generation;
    const task = Promise.resolve().then(() => callbacks.current.catalog.saveModelParameters(provider.id, model.id, patch));
    draft.task = task;
    refresh(value => value + 1);
    try {
      await task;
      if (draft.generation === generation) {
        draft.patch = {}; draft.error = null;
        drafts.delete(key);
        if (mounted.current) {
          pendingLeave.current = null; leaving.current = false; setConfirmLeave(false);
          finish();
          proceed?.();
        }
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
    return () => { mounted.current = false; };
  }, []);
  function requestLeave(action) {
    if (leaving.current || edit.current.pending != null) return;
    if (!Object.keys(edit.current.patch).length) { action(); return; }
    leaving.current = true; pendingLeave.current = action; setConfirmLeave(true);
  }
  const requestLeaveRef = useRef(requestLeave);
  requestLeaveRef.current = requestLeave;
  useEffect(() => registerLeaveGuard?.(action => requestLeaveRef.current(action)), [registerLeaveGuard]);
  useEffect(() => {
    if (!open) return;
    const scroll = fieldsRef.current?.closest('.scrollable');
    if (!scroll) return;
    let idle;
    const show = () => {
      scroll.setAttribute('data-parameters-scrolling', '');
      window.clearTimeout(idle);
      idle = window.setTimeout(() => scroll.removeAttribute('data-parameters-scrolling'), 600);
    };
    scroll.addEventListener('scroll', show, { passive: true });
    return () => { scroll.removeEventListener('scroll', show); window.clearTimeout(idle); scroll.removeAttribute('data-parameters-scrolling'); };
  }, [open]);
  function change(patch) {
    if (edit.current.pending != null) return;
    const overrides = new Set(state.activeModelOption?.overrideFields || []);
    for (const [field, key] of [['contextWindowTokens', 'contextWindow'], ['maxOutputTokens', 'maxTokens']]) {
      if (!Object.hasOwn(patch, field)) continue;
      if (patch[field] == null) overrides.delete(key); else overrides.add(key);
      patch = { ...patch, overrideFields: [...overrides] };
    }
    const nextPatch = { ...edit.current.patch, ...patch };
    for (const field of Object.keys(nextPatch)) {
      const baseline = field === 'inputModalities' ? option?.inputModalities || (option?.supportsImageInput ? ['text', 'image'] : ['text'])
        : field === 'supportsImageInput' ? option?.supportsImageInput ?? option?.inputModalities?.includes('image') ?? false : option?.[field];
      if (JSON.stringify(nextPatch[field]) === JSON.stringify(baseline)) delete nextPatch[field];
    }
    edit.current.patch = nextPatch;
    edit.current.generation += 1;
    edit.current.error = null;
    if (Object.keys(nextPatch).length) drafts.set(key, edit.current); else drafts.delete(key);
    setFailure(null); refresh(value => value + 1);
  }
  function cancel() {
    if (edit.current.pending != null) return;
    edit.current.patch = {}; edit.current.error = null;
    drafts.delete(key);
    setFailure(null); refresh(value => value + 1);
    finish();
  }
  function discardAndLeave() {
    const action = pendingLeave.current;
    pendingLeave.current = null; leaving.current = false; setConfirmLeave(false);
    cancel(); action?.();
  }
  if (!option) return null;
  const error = edit.current.error;
  return <>
    <button ref={itemRef} type="button" role="menuitem" className={cellClassName} aria-expanded={open} aria-controls={id}
      onKeyDown={event => { if (event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); setOpen(true); focusFields(); } }}
      onClick={event => { if (open) requestLeave(finish); else { setOpen(true); if (event.detail === 0) focusFields(); } }}>
      <span className={labelClassName}>{tUi('参数')}</span><span className={valueClassName} />
      {open ? <IconChevronDownOutlineRegular size={12} /> : <IconChevronRightOutlineRegular size={12} />}
    </button>
    <div ref={fieldsRef} id={id} className="model-menu-parameters" data-model-parameters-fields="" hidden={!open}>
      <fieldset className="model-menu-draft" disabled={edit.current.pending != null}>
        <ModelParametersSection form={form} {...state} modelCapabilities={capabilities} picker menu showReasoningProfileEditor onChange={change} />
        {error && <div className="model-menu-error" role="alert">{error.message}</div>}
        <footer className="model-menu-actions">
          <Button variant="outline" onClick={cancel}>{tUi('取消')}</Button>
          <Button variant="primary" disabled={!Object.keys(edit.current.patch).length || state.parameterError} aria-busy={edit.current.pending != null} onClick={() => void save()}>{tUi('保存')}</Button>
        </footer>
      </fieldset>
    </div>
    <UnsavedChangesDialog open={confirmLeave} title={tUi('保存修改？')} description={tUi('离开前是否保存当前模型配置的修改？')}
      saving={edit.current.pending != null} saveDisabled={Boolean(state.parameterError)} error={error?.message || (state.parameterError ? tUi('模型参数超出有效范围。') : '')}
      onCancel={() => { pendingLeave.current = null; leaving.current = false; setConfirmLeave(false); focusFields(); }}
      onDiscard={discardAndLeave} onSave={() => void save(pendingLeave.current)} />
    {failure && <Toast text={failure.message} icon={<IconWarningOutlineRegular />} onDone={() => setFailure(null)} />}
  </>;
}
