import { useState } from 'react';
import { NotePencil } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { PresetProfileEditor } from './PresetProfileEditor.jsx';
import { PresetIntroductionEditor } from './PresetIntroductionEditor.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';

export function PresetBasicDocument({ action, preset, dirty, saving, error, onChange, onSave, onDiscard, introductionRef, onClearError, onIntroductionDirtyChange, renderIntroduction = value => value }) {
  const tUi = useProductTranslation(), [revision, setRevision] = useState(0);
  const { compact } = useEditorPresentation();
  return <section className="preset-basic-document">
    <header className="preset-document-heading"><NotePencil size={21} /><h1>{tUi('基础资料')}</h1></header>
    <div className="preset-basic-scroll">
      <section className="preset-basic-card preset-content-section"><div className="preset-basic-card-heading"><h2>{tUi('基本信息')}</h2>{action}</div>
        <PresetProfileEditor key={`${preset.id}:${revision}`} preset={preset} dirty={dirty} saving={saving} error={error} onChange={onChange} showActions={!compact}
          onSave={onSave} onCancel={() => { onDiscard(); setRevision(value => value + 1); }} />
      </section>
      <div className="preset-basic-introduction preset-workspace-body is-introduction">{renderIntroduction(<PresetIntroductionEditor key={preset.id} preset={preset} autoEditEmpty={!compact} editorRef={introductionRef} saving={saving} error={error} onClearError={onClearError} onDirtyChange={onIntroductionDirtyChange} onSaveProfile={patch => onSave({ ...preset, profile: { ...preset.profile, ...patch } })} />)}</div>
    </div>
  </section>;
}
