import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { CaretRight, CaretUp, NotePencil, Plus } from '../../../ui/icons/interfaceIcons.jsx';
import { TrashIcon } from '../../../ui/icons/index.jsx';
import { UnsavedChangesDialog } from '../../../ui/ui/UnsavedChangesDialog.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { EditorContextMenu, useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { calendarDateValue, createTimelineDraft, createUsageDraft, introductionDraftPatch, isIntroductionDraftDirty, visibleTimelineRecords } from '../model/presetIntroductionDraft.js';
import '../styles/preset-usage.css';

export function PresetContentComposer({ draft, formRef, saving, error, onChange, onCancel, onSave }) {
  const tUi = useProductTranslation();
  const timeline = draft.kind === 'timeline';
  return <form ref={formRef} className="preset-content-composer" aria-label={timeline ? tUi("编辑更新记录") : tUi("编辑使用说明")} onSubmit={(event) => { event.preventDefault(); void onSave(); }} onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void onSave(); }
  }}>
    <fieldset disabled={saving}>
      {timeline ? <div className="preset-content-composer-heading">
        <input className="preset-content-composer-title" aria-label={tUi("更新标题")} placeholder={tUi("更新标题")} value={draft.value.title} onChange={(event) => onChange({ ...draft.value, title: event.target.value })} />
        <input className="preset-content-composer-date" aria-label={tUi("更新日期")} type={!draft.value.dateLabel || calendarDateValue(draft.value.dateLabel) ? 'date' : 'text'} value={calendarDateValue(draft.value.dateLabel) || draft.value.dateLabel} onChange={(event) => onChange({ ...draft.value, dateLabel: event.target.value })} />
      </div> : null}
      <textarea aria-label={timeline ? tUi("更新内容") : tUi("使用说明")} placeholder={timeline ? tUi("写下这次更新…") : tUi("写下使用说明…")} rows={4} value={timeline ? draft.value.note : draft.value} onChange={(event) => onChange(timeline ? { ...draft.value, note: event.target.value } : event.target.value)} />
      <div className="preset-content-composer-footer">
        <span className="preset-content-error" role={error ? 'alert' : undefined}>{error}</span>
        <div className="preset-content-actions">
          <Button data-dsh-control variant="outline" type="button" className="preset-content-button" onClick={onCancel}>{tUi("取消")}</Button>
          <Button data-dsh-control variant="primary" type="submit" className="preset-content-button is-primary">{saving ? tUi("保存中…") : timeline ? tUi("保存更新") : tUi("保存")}</Button>
        </div>
      </div>
    </fieldset>
  </form>;
}

function ContentDialog({ title, children, onClose, busy }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="preset-content-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => {
    if (event.target !== event.currentTarget || busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}><h2 id={titleId}>{title}</h2>{children}</dialog>;
}

export function PresetIntroductionEditor({ preset, editorRef, saving, error, onClearError, onSaveProfile }) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const profile = preset.profile;
  const [draft, setDraft] = useState(() => profile.usageInstructions ? null : createUsageDraft(profile));
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
  const dirty = isIntroductionDraftDirty(draft);
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
      requestAnimationFrame(() => formRef.current?.querySelector('input, textarea')?.focus());
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
  useImperativeHandle(editorRef, () => ({ requestLeave, save: saveDraft, hasDraft: Boolean(draft) }));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const composer = draft ? <PresetContentComposer draft={draft} formRef={formRef} saving={saving} error={validation || error} onChange={(value) => { setDraft((current) => ({ ...current, value })); setValidation(''); }} onCancel={() => { if (!saving) { finish(); onClearError(); } }} onSave={saveDraft} /> : null;
  return <div className="preset-usage-content">
    <section className="preset-content-section preset-usage-section" aria-label={tUi("使用说明")}>
      <div className="preset-content-section-heading">
        <h2>{tUi("使用说明")}</h2>
        {draft?.kind !== 'usage' ? <Button data-dsh-control variant="outline" ref={usageEditRef} type="button" className="preset-content-button is-section-action" disabled={saving} onClick={() => openDraft(createUsageDraft(profile))}>{tUi("编辑")}</Button> : null}
      </div>
      {draft?.kind === 'usage' ? composer : <div className="preset-usage-reading-surface">
        <p className={`preset-usage-copy${profile.usageInstructions ? '' : ' is-empty'}`}>{profile.usageInstructions || tUi("暂无使用说明")}</p>
      </div>}
    </section>
    <section className="preset-content-section preset-updates" aria-label={tUi("更新记录")}>
      <div className="preset-content-section-heading"><h2>{tUi("更新记录")}</h2><Button data-dsh-control variant="outline" ref={addRef} type="button" className="preset-content-button is-section-action" disabled={saving || Boolean(draft?.isNew)} onClick={() => openDraft(createTimelineDraft())}><Plus size={15} />{tUi("添加更新")}</Button></div>
      <ol id={timelineId} className="preset-update-list" aria-label={tUi("更新时间线，最新记录在前")}>
        {draft?.kind === 'timeline' && draft.isNew ? <li className="preset-update-step is-editing"><i className="preset-update-node" aria-hidden="true" />{composer}</li> : null}
        {records.map((item, index) => <li className={`preset-update-step${index === 0 ? ' is-latest' : ''}${draft?.kind === 'timeline' && draft.value.id === item.id ? ' is-editing' : ''}`} key={item.id}>
        <i className="preset-update-node" aria-hidden="true" />
        {draft?.kind === 'timeline' && !draft.isNew && draft.value.id === item.id ? composer : <article className="preset-update-record" tabIndex={0}
          aria-label={tUi("更新记录：{value0}", {value0: item.title || item.dateLabel || tUi("未命名更新")})}
          onContextMenu={event => context.open(event, item)} onKeyDown={event => {
            if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') context.open(event, item);
          }}>
          <div className="preset-update-record-heading">
            <div className="preset-update-record-summary">
              {item.title ? <h3>{item.title}</h3> : null}
              {item.dateLabel ? <span className="preset-update-record-date">{item.dateLabel}</span> : null}
            </div>
            <div className="preset-update-record-actions">
              <button ref={element => { if (element) timelineEditRefs.current.set(item.id, element); else timelineEditRefs.current.delete(item.id); }}
                type="button" className="preset-update-action preset-update-edit" title={tUi("编辑更新")} aria-label={tUi("编辑更新：{value0}", {value0: item.title || item.dateLabel || tUi("未命名更新")})}
                disabled={saving} onClick={() => openDraft(createTimelineDraft(item))}><NotePencil size={16} aria-hidden="true" /></button>
              <button type="button" className="preset-update-action is-delete" title={tUi("删除更新")} aria-label={tUi("删除更新：{value0}", {value0: item.title || item.dateLabel || tUi("未命名更新")})}
                disabled={saving} onClick={() => requestLeave(() => { onClearError(); setDeleting(item); })}><TrashIcon size={16} aria-hidden="true" /></button>
            </div>
          </div>
          {item.note ? <p>{item.note}</p> : null}
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
