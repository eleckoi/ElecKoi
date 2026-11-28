import { useEffect, useId, useState } from 'react';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import defaultCover from '../../../assets/default-preset-cover.png';
import { resolveFailure } from '../../../utils/failureText.js';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { CatalogCardDialog } from '../../../ui/ui/CatalogCardDialog.jsx';
import { usePresets } from './PresetContext.jsx';
import { PresetProfileActions, PresetProfileHeader } from './PresetProfileHeader.jsx';
import { PresetIntroductionEditor } from './PresetIntroductionEditor.jsx';
import { openPresetEditorWindow } from '../window/openPresetEditorWindow.js';
import { useCatalogSlots } from '../../../ui/ui/CatalogSlotsContext.jsx';
import '../styles/preset-workspace.css';
import '../styles/preset-card-dialog.css';

export function PresetOverview({ requestedTab, onRequestedTabHandled, onBack, trigger }) {
  const tUi = useProductTranslation();
  const { render } = useCatalogSlots();
  const { catalog, selectedPresetId, catalogModel, setCatalog, error: catalogError } = usePresets();
  const [activationError, setError] = useState(''), [activating, setActivating] = useState(false);
  const title = useId();
  // Catalog summaries already carry the complete display profile; full editor documents are not needed here.
  const current = catalog?.presets.find(preset => preset.id === selectedPresetId);
  const error = activationError || catalogError;
  useEffect(() => { setError(''); }, [selectedPresetId]);
  useEffect(() => {
    if (requestedTab && selectedPresetId) { openPresetEditorWindow(selectedPresetId, requestedTab === 'introduction' ? 'profile' : requestedTab); onRequestedTabHandled?.(); }
  }, [requestedTab, selectedPresetId, onRequestedTabHandled]);
  if (!current) return <section className="preset-workspace preset-overview" aria-busy={!error || undefined}>{error ? <p className="preset-workspace-state is-error" role="alert">{error}</p> : null}</section>;
  const active = catalog?.activePresetIds[current.purpose] === current.id;
  const onEdit = () => openPresetEditorWindow(current.id);
  async function onActivate() {
    if (activating) return;
    setActivating(true);
    try { setCatalog(await catalogModel.setActive(current.id)); setError(''); }
    catch (cause) { setError(resolveFailure(cause, { fallback: tUi('切换预设失败') }).text); }
    finally { setActivating(false); }
  }
  const owner = { preset: current, active, activating, error, onEdit, onActivate };
  const content = closeButton => <section className={`preset-workspace preset-overview${onBack ? ' preset-home-detail' : ''}`} aria-labelledby={title}>
      <PresetProfileHeader preset={current} headingId={title} active={active} editingAvailable onEdit={onEdit}
        activating={activating} onActivate={onActivate} showActions={!onBack} closeButton={closeButton} />
      <div className="preset-workspace-body is-introduction" tabIndex={onBack ? 0 : undefined}>
        <div className="preset-overview-reading">
          {error && <p className="preset-save-error" role="alert">{error}</p>}
          <PresetIntroductionEditor key={current.id} preset={current} readOnly documentScroll={Boolean(onBack)} />
        </div>
      </div>
      {onBack && <footer className="preset-overview-footer">
        <PresetProfileActions active={active} activating={activating} onEdit={onEdit} onActivate={onActivate} activateFirst />
      </footer>}
    </section>;
  return render('eleckoi.preset.page.preview', owner, onBack ? <CatalogCardDialog title={current.name}
    className="preset-card-dialog" sheetClassName="preset-card-sheet" trigger={trigger} labelledBy={title}
    artworkSelector=".preset-home-card-avatar, .preset-list-avatar" onClose={onBack}>
    {closeButton => <>
      <div className="preset-card-dialog-art" data-catalog-card-art>
        <Avatar src={current.profile.authorAvatarPath || defaultCover} name={current.name} thumbnail={false} />
      </div>
      {content(closeButton)}
    </>}
  </CatalogCardDialog> : content());
}
