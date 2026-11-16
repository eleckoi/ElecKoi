import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Button, IconPlusOutlineMedium, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { CaretRight, CaretUp, NotePencil } from '../../../ui/icons/interfaceIcons.jsx';
import { TrashIcon } from '../../../ui/icons/index.jsx';
import { UnsavedChangesDialog } from '../../../ui/ui/UnsavedChangesDialog.jsx';
import { useEditorPresentation, useEditorSubpage } from '../../../ui/ui/EditorPresentationContext.jsx';
import { EditorContextMenu, useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { createTimelineDraft, createUsageDraft, introductionDraftPatch, isIntroductionDraftDirty, visibleTimelineRecords } from '../model/presetIntroductionDraft.js';
import { PresetReadableText } from './PresetReadableText.jsx';
import { PresetContentComposer } from './PresetContentComposer.jsx';
import '../../../ui/styles/editor-library-workspace.css';
import '../styles/preset-usage.css';
import '../../../ui/styles/product-dialogs.css';

function ContentDialog({ title, children, onClose, busy }) {
  const tUi = useProductTranslation();
  return <Modal open title={title} closeLabel={tUi('关闭')} onClose={() => { if (!busy) onClose(); }}
    className="product-dialog preset-content-modal" contentClassName="product-dialog-content">{children}</Modal>;
}

export function PresetIntroductionEditor({ preset, editorRef, saving, error, onClearError, onSaveProfile, readOnly = false, onDirtyChange, autoEditEmpty = true }) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const profile = preset.profile;
  const [draft, setDraft] = useState(() => readOnly || profile.usageInstructions || !autoEditEmpty ? null : createUsageDraft(profile));
  const [validation, setValidation] = useState('');
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef(null);
  const context = useEditorContextMenu();
  const timelineId = useId();
  const usageEditRef = useRef(null);
  const addRef = useRef(null);
  const timelineEditRefs = useRef(new Map());
  const busyRef = useRef(false);
  const focusComposer = useRef(false);
  const dirty = isIntroductionDraftDirty(draft);
  useEffect(() => { onDirtyChange?.(dirty || Boolean(draft?.isNew)); }, [dirty, draft?.isNew, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEditorSubpage(Boolean(draft) && !readOnly, draft?.kind === 'timeline' ? tUi('编辑更新记录') : tUi('编辑使用说明'), () => requestLeave(() => {}));
  const { records, hiddenCount } = visibleTimelineRecords(profile.timeline, expanded, Boolean(draft?.isNew));

  function toggleEarlier() {
    if (saving || busyRef.current) return;
    const wouldHideDraft = expanded && draft?.kind === 'timeline' && !draft.isNew
      && !visibleTimelineRecords(profile.timeline, false).records.some((item) => item.id === draft.value.id);
    if (wouldHideDraft) requestLeave(() => setExpanded(false));
    else setExpanded((value) => !value);
  }

  function requestLeave(action) {
    if (saving || busyRef.current) return;
    if (dirty) { setPending({ action }); return; }
    setDraft(null);
    action();
  }
  function openDraft(next) {
    requestLeave(() => {
      setDraft(next); setValidation(''); onClearError(); setNotice('');
      focusComposer.current = true;
    });
  }
  function finish() {
    const trigger = draft?.kind === 'usage' ? usageEditRef : addRef;
    const recordId = draft?.kind === 'timeline' && !draft.isNew ? draft.value.id : null;
    setDraft(null); setValidation('');
    requestAnimationFrame(() => (timelineEditRefs.current.get(recordId) ?? trigger.current)?.focus());
  }
  async function saveDraft() {
    if (!draft || saving || busyRef.current) return false;
    if (!dirty && !draft.isNew) { finish(); return true; }
    let patch;
    try { patch = introductionDraftPatch(profile, draft); } catch (cause) { setValidation(cause.message); return false; }
    busyRef.current = true;
    try {
      if (!await onSaveProfile(patch)) return false;
      finish(); setNotice("saved"); return true;
    } finally { busyRef.current = false; }
  }
  useImperativeHandle(editorRef, () => ({ requestLeave, save: saveDraft, hasDraft: Boolean(draft), dirty: dirty || Boolean(draft?.isNew) }));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const composer = draft ? <PresetContentComposer onReady={() => { if (focusComposer.current) { focusComposer.current = false; formRef.current?.querySelector('input, textarea, .cm-content')?.focus({ preventScroll: true }); } }} draft={draft} formRef={formRef} saving={saving} error={validation || error} onChange={(value) => { setDraft((current) => ({ ...current, value })); setValidation(''); }} onCancel={() => { if (!saving) { finish(); onClearError(); } }} onSave={saveDraft} /> : null;
  return <div className="preset-usage-content">
    <section className="preset-content-section preset-usage-section" aria-label={tUi("使用说明")}>
      <div className="preset-content-section-heading">
        <h2>{tUi("使用说明")}</h2>
        {!readOnly && draft?.kind !== 'usage' ? <Button data-dsh-control variant="outline" ref={usageEditRef} type="button" className="preset-content-button is-section-action" disabled={saving} onClick={() => openDraft(createUsageDraft(profile))}>{tUi("编辑")}</Button> : null}
      </div>
      {draft?.kind === 'usage' ? composer : <div className="preset-usage-reading-surface">
        <PresetReadableText className={`preset-usage-copy${profile.usageInstructions ? '' : ' is-empty'}`} label={tUi('使用说明')} value={profile.usageInstructions} emptyText={tUi('暂无使用说明')} />
      </div>}
    </section>
    <section className="preset-content-section preset-updates" aria-label={tUi("更新记录")}>
      <div className="preset-content-section-heading"><h2>{tUi("更新记录")}</h2>{!readOnly && <Button data-dsh-control variant="primary" icon={<IconPlusOutlineMedium size={16} />} ref={addRef} type="button" className="preset-content-button is-section-action" disabled={saving || Boolean(draft?.isNew)} onClick={() => openDraft(createTimelineDraft())}>{tUi("添加更新")}</Button>}</div>
      <ol id={timelineId} className="preset-update-list" aria-label={tUi("更新时间线，最新记录在前")}>
        {draft?.kind === 'timeline' && draft.isNew ? <li className="preset-update-step is-editing"><i className="preset-update-node" aria-hidden="true" />{composer}</li> : null}
        {records.map((item, index) => <li className={`preset-update-step${index === 0 ? ' is-latest' : ''}${draft?.kind === 'timeline' && draft.value.id === item.id ? ' is-editing' : ''}`} key={item.id}>
        <i className="preset-update-node" aria-hidden="true" />
        {draft?.kind === 'timeline' && !draft.isNew && draft.value.id === item.id ? composer : <article className="preset-update-record" tabIndex={0}
          aria-label={tUi("更新记录：{value0}", {value0: item.title || item.dateLabel || tUi("未命名更新")})}
          onContextMenu={event => { if (!readOnly) context.open(event, item); }} onKeyDown={event => {
            if (!readOnly && (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) context.open(event, item);
          }}>
          <div className="preset-update-record-heading">
            <div className="preset-update-record-summary">
              {item.title ? <h3>{item.title}</h3> : null}
              {item.dateLabel ? <span className="preset-update-record-date">{item.dateLabel}</span> : null}
            </div>
            {!readOnly && <div className="preset-update-record-actions">
              <button ref={element => { if (element) timelineEditRefs.current.set(item.id, element); else timelineEditRefs.current.delete(item.id); }}
                type="button" className="preset-update-action preset-update-edit" title={tUi("编辑更新")} aria-label={tUi("编辑更新：{value0}", {value0: item.title || item.dateLabel || tUi("未命名更新")})}
                disabled={saving} onClick={() => openDraft(createTimelineDraft(item))}><NotePencil size={16} aria-hidden="true" /></button>
              <button type="button" className="preset-update-action is-delete" title={tUi("删除更新")} aria-label={tUi("删除更新：{value0}", {value0: item.title || item.dateLabel || tUi("未命名更新")})}
                disabled={saving} onClick={() => requestLeave(() => { onClearError(); setDeleting(item); })}><TrashIcon size={16} aria-hidden="true" /></button>
            </div>}
          </div>
          {item.note ? <PresetReadableText className="preset-update-note" label={tUi('更新内容')} value={item.note} /> : null}
        </article>}
      </li>)}</ol>
      {hiddenCount > 0 || expanded && profile.timeline.length > (draft?.isNew ? 2 : 3) ? <button type="button" className={`preset-updates-expand${expanded ? ' is-expanded' : ''}`} aria-expanded={expanded} aria-controls={timelineId} disabled={saving} onClick={toggleEarlier}><span>{expanded ? tUi("收起更早记录") : tUi("展开更早 {value0} 条记录", {value0: hiddenCount})}</span>{expanded ? <CaretUp size={17} /> : <CaretRight size={17} />}</button> : null}
      {!profile.timeline.length && !draft?.isNew ? <div className="preset-updates-empty">{tUi("暂无更新记录")}</div> : null}
    </section>
    {context.menu && <EditorContextMenu menu={context.menu} label={tUi("更新记录操作")} onClose={context.close} actions={[
      { label: tUi("编辑"), icon: NotePencil, disabled: saving, run: () => openDraft(createTimelineDraft(context.menu.target)) },
      { label: tUi("删除"), icon: TrashIcon, danger: true, disabled: saving, run: () => requestLeave(() => { onClearError(); setDeleting(context.menu.target); }) },
    ]} />}
    {!draft && error && !deleting ? <p className="preset-content-error" role="alert">{error}</p> : null}
    {(!compact || notice !== "saved") && <span className="preset-content-sr-only" role="status">{notice === "saved" ? tUi("已保存") : notice}</span>}
    <UnsavedChangesDialog
      open={Boolean(pending)}
      title={tUi("保存修改？")}
      description={tUi("离开前是否保存当前内容的修改？")}
      error={validation || error}
      saving={saving}
      onCancel={() => setPending(null)}
      onDiscard={() => {
        const action = pending?.action;
        setPending(null); setDraft(null); setValidation(''); onClearError(); action?.();
      }}
      onSave={async () => {
        const action = pending?.action;
        if (await saveDraft()) { setPending(null); action?.(); }
      }}
    />
    {deleting ? <ContentDialog title={tUi("删除这条更新？")} busy={saving} onClose={() => { setDeleting(null); onClearError(); }}>
      {error ? <p className="preset-content-error" role="alert">{error}</p> : null}
      <div className="preset-content-actions"><Button data-dsh-control variant="outline" type="button" className="preset-content-button" disabled={saving} onClick={() => { setDeleting(null); onClearError(); }}>{tUi("取消")}</Button><Button data-dsh-control variant="outline" type="button" className="preset-content-button is-danger" disabled={saving} onClick={async () => { if (await onSaveProfile({ timeline: profile.timeline.filter((item) => item.id !== deleting.id) })) { setDeleting(null); setNotice(tUi("已删除更新")); } }}>{tUi("删除")}</Button></div>
    </ContentDialog> : null}
  </div>;
}
