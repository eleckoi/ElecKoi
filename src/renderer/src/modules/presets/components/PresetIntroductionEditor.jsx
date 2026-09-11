import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { CaretRight, CaretUp, DotsThree, NotePencil, Plus } from '@phosphor-icons/react';
import { TrashIcon } from '../../../ui/icons/index.jsx';
import { UnsavedChangesDialog } from '../../../ui/ui/UnsavedChangesDialog.jsx';
import { calendarDateValue, createTimelineDraft, createUsageDraft, introductionDraftPatch, isIntroductionDraftDirty, visibleTimelineRecords } from '../model/presetIntroductionDraft.js';
import '../styles/preset-usage.css';

export function PresetContentComposer({ draft, formRef, saving, error, onChange, onCancel, onSave }) {
  const timeline = draft.kind === 'timeline';
  return <form ref={formRef} className="preset-content-composer" aria-label={timeline ? '编辑更新记录' : '编辑使用说明'} onSubmit={(event) => { event.preventDefault(); void onSave(); }} onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void onSave(); }
  }}>
    <fieldset disabled={saving}>
      {timeline ? <div className="preset-content-composer-heading">
        <input className="preset-content-composer-title" aria-label="更新标题" placeholder="更新标题" maxLength={80} value={draft.value.title} onChange={(event) => onChange({ ...draft.value, title: event.target.value })} />
        <input className="preset-content-composer-date" aria-label="更新日期" type={!draft.value.dateLabel || calendarDateValue(draft.value.dateLabel) ? 'date' : 'text'} maxLength={24} value={calendarDateValue(draft.value.dateLabel) || draft.value.dateLabel} onChange={(event) => onChange({ ...draft.value, dateLabel: event.target.value })} />
      </div> : null}
      <textarea aria-label={timeline ? '更新内容' : '使用说明'} placeholder={timeline ? '写下这次更新…' : '写下使用说明…'} rows={4} maxLength={timeline ? 800 : 1000} value={timeline ? draft.value.note : draft.value} onChange={(event) => onChange(timeline ? { ...draft.value, note: event.target.value } : event.target.value)} />
      <div className="preset-content-composer-footer">
        <span className="preset-content-error" role={error ? 'alert' : undefined}>{error}</span>
        <div className="preset-content-actions">
          <button type="button" className="preset-content-button" onClick={onCancel}>取消</button>
          <button type="submit" className="preset-content-button is-primary">{saving ? '保存中…' : timeline ? '保存更新' : '保存'}</button>
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

function RecordActions({ item, saving, onEdit, onDelete }) {
  const ref = useRef(null);
  const label = item.title || item.dateLabel || '更新记录';
  function choose(action) { ref.current.open = false; action(); }
  return <details ref={ref} className="preset-update-menu" name="preset-update-actions" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); }
  }}>
    <summary aria-label={`操作：${label}`} title="记录操作" aria-disabled={saving || undefined} tabIndex={saving ? -1 : 0} onClick={(event) => { if (saving) event.preventDefault(); }}><DotsThree size={22} weight="bold" /></summary>
    <div className="preset-update-menu-items">
      <button type="button" disabled={saving} onClick={() => choose(onEdit)}><NotePencil size={16} aria-hidden="true" /><span>编辑</span></button>
      <button type="button" className="is-delete" disabled={saving} onClick={() => choose(onDelete)}><TrashIcon size={16} /><span>删除</span></button>
    </div>
  </details>;
}

export function PresetIntroductionEditor({ preset, editorRef, saving, error, onClearError, onSaveProfile }) {
  const profile = preset.profile;
  const [draft, setDraft] = useState(() => profile.usageInstructions ? null : createUsageDraft(profile));
  const [validation, setValidation] = useState('');
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const formRef = useRef(null);
  const timelineRef = useRef(null);
  const timelineId = useId();
  const usageEditRef = useRef(null);
  const addRef = useRef(null);
  const busyRef = useRef(false);
  const dirty = isIntroductionDraftDirty(draft);
  const { records, hiddenCount } = visibleTimelineRecords(profile.timeline, expanded, Boolean(draft?.isNew));

  useEffect(() => {
    const closeMenus = (event) => {
      timelineRef.current?.querySelectorAll('details[open]').forEach((menu) => {
        if (!menu.contains(event.target)) menu.open = false;
      });
    };
    document.addEventListener('pointerdown', closeMenus);
    return () => document.removeEventListener('pointerdown', closeMenus);
  }, []);

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
    setDraft(null); setValidation('');
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function saveDraft() {
    if (!draft || saving || busyRef.current) return false;
    if (!dirty && !draft.isNew) { finish(); return true; }
    let patch;
    try { patch = introductionDraftPatch(profile, draft); } catch (cause) { setValidation(cause.message); return false; }
    busyRef.current = true;
    try {
      if (!await onSaveProfile(patch)) return false;
      finish(); setNotice('已保存'); return true;
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
    <section aria-label="使用说明">
      <div className="preset-content-section-heading">
        <h2>使用说明</h2>
        {draft?.kind !== 'usage' ? <button ref={usageEditRef} type="button" className="preset-content-button is-section-action" disabled={saving} onClick={() => openDraft(createUsageDraft(profile))}>编辑</button> : null}
      </div>
      {draft?.kind === 'usage' ? composer : <div className="preset-usage-reading-surface">
        <p className={`preset-usage-copy${profile.usageInstructions ? '' : ' is-empty'}`}>{profile.usageInstructions || '暂无使用说明'}</p>
      </div>}
    </section>
    <section className="preset-updates" aria-label="更新记录">
      <div className="preset-content-section-heading"><h2>更新记录</h2><button ref={addRef} type="button" className="preset-content-button is-section-action" disabled={saving || Boolean(draft?.isNew)} onClick={() => openDraft(createTimelineDraft())}><Plus size={15} />添加更新</button></div>
      <ol ref={timelineRef} id={timelineId} className="preset-update-list" aria-label="更新时间线，最新记录在前">
        {draft?.kind === 'timeline' && draft.isNew ? <li className="preset-update-step is-editing"><i className="preset-update-node" aria-hidden="true" />{composer}</li> : null}
        {records.map((item, index) => <li className={`preset-update-step${index === 0 ? ' is-latest' : ''}${draft?.kind === 'timeline' && draft.value.id === item.id ? ' is-editing' : ''}`} key={item.id}>
        <i className="preset-update-node" aria-hidden="true" />
        {draft?.kind === 'timeline' && !draft.isNew && draft.value.id === item.id ? composer : <article className="preset-update-record">
          <div className="preset-update-record-heading"><h3>{item.title}</h3>{item.dateLabel ? <span className="preset-update-record-date">{item.dateLabel}</span> : null}
            <RecordActions item={item} saving={saving} onEdit={() => openDraft(createTimelineDraft(item))} onDelete={() => requestLeave(() => { onClearError(); setDeleting(item); })} />
          </div>
          {item.note ? <p>{item.note}</p> : null}
        </article>}
      </li>)}</ol>
      {hiddenCount > 0 || expanded && profile.timeline.length > (draft?.isNew ? 2 : 3) ? <button type="button" className={`preset-updates-expand${expanded ? ' is-expanded' : ''}`} aria-expanded={expanded} aria-controls={timelineId} disabled={saving} onClick={toggleEarlier}><span>{expanded ? '收起更早记录' : `展开更早 ${hiddenCount} 条记录`}</span>{expanded ? <CaretUp size={17} /> : <CaretRight size={17} />}</button> : null}
      {!profile.timeline.length && !draft?.isNew ? <div className="preset-updates-empty">暂无更新记录</div> : null}
    </section>
    {!draft && error && !deleting ? <p className="preset-content-error" role="alert">{error}</p> : null}
    <span className="preset-content-sr-only" role="status">{notice}</span>
    <UnsavedChangesDialog
      open={Boolean(pending)}
      title="保存修改？"
      description="离开前是否保存当前内容的修改？"
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
    {deleting ? <ContentDialog title="删除这条更新？" busy={saving} onClose={() => { setDeleting(null); onClearError(); }}>
      {error ? <p className="preset-content-error" role="alert">{error}</p> : null}
      <div className="preset-content-actions"><button type="button" className="preset-content-button" disabled={saving} onClick={() => { setDeleting(null); onClearError(); }}>取消</button><button type="button" className="preset-content-button is-danger" disabled={saving} onClick={async () => { if (await onSaveProfile({ timeline: profile.timeline.filter((item) => item.id !== deleting.id) })) { setDeleting(null); setNotice('已删除更新'); } }}>删除</button></div>
    </ContentDialog> : null}
  </div>;
}
