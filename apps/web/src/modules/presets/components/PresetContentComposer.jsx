import { lazy, Suspense, useLayoutEffect } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { calendarDateValue } from '../model/presetIntroductionDraft.js';

const EditorWritingBoard = lazy(() => import('../../settingLibraries/index.js').then(module => ({ default: module.EditorWritingBoard })));

function ComposerWritingBoard({ onReady, readyKey, ...props }) {
  useLayoutEffect(() => { onReady?.(); }, [readyKey]);
  return <EditorWritingBoard {...props} />;
}

export function PresetContentComposer({ draft, formRef, saving, error, onChange, onCancel, onSave, onReady }) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const timeline = draft.kind === 'timeline';
  const value = timeline ? draft.value.note : draft.value;
  const change = value => onChange(timeline ? { ...draft.value, note: value } : value);
  return <form ref={formRef} className="preset-content-composer" aria-label={timeline ? tUi("编辑更新记录") : tUi("编辑使用说明")} onSubmit={(event) => { event.preventDefault(); void onSave(); }} onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void onSave(); }
  }}>
    <fieldset disabled={saving}>
      {timeline ? <div className="preset-content-composer-heading">
        <input className="preset-content-composer-title" aria-label={tUi("更新标题")} placeholder={tUi("更新标题")} value={draft.value.title} onChange={(event) => onChange({ ...draft.value, title: event.target.value })} />
        <input className="preset-content-composer-date" aria-label={tUi("更新日期")} type={!draft.value.dateLabel || calendarDateValue(draft.value.dateLabel) ? 'date' : 'text'} value={calendarDateValue(draft.value.dateLabel) || draft.value.dateLabel} onChange={(event) => onChange({ ...draft.value, dateLabel: event.target.value })} />
      </div> : null}
      {/* Keep the editor's final height while its implementation loads, so later sections never move. */}
      <Suspense fallback={<div className="rs-writing preset-composer-writing" aria-busy="true" />}>
        <ComposerWritingBoard className="preset-composer-writing" showHeading={false} code={false} label={timeline ? tUi('更新内容') : tUi('使用说明')}
          readyKey={`${draft.kind}:${draft.value?.id || ''}`} onReady={onReady}
          placeholder={timeline ? tUi('写下这次更新…') : tUi('写下使用说明…')} value={value} onChange={change} disabled={saving} />
      </Suspense>
      <div className="preset-content-composer-footer">
        <span className="preset-content-error" role={error ? 'alert' : undefined}>{error}</span>
        <div className="preset-content-actions">
          <Button data-dsh-control variant="outline" type="button" className="preset-content-button" onClick={onCancel}>{tUi("取消")}</Button>
          {!compact && <Button data-dsh-control variant="primary" type="submit" className="preset-content-button is-primary">{saving ? tUi("保存中…") : timeline ? tUi("保存更新") : tUi("保存")}</Button>}
        </div>
      </div>
    </fieldset>
  </form>;
}
