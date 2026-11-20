import { useEffect, useState } from 'react';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { resolveFailure } from '../../../utils/failureText.js';
import { usePresets } from './PresetContext.jsx';
import { PresetProfileHeader } from './PresetProfileHeader.jsx';
import { PresetIntroductionEditor } from './PresetIntroductionEditor.jsx';
import { openPresetEditorWindow } from '../window/openPresetEditorWindow.js';
import { useCatalogSlots } from '../../../ui/ui/CatalogSlotsContext.jsx';
import '../styles/preset-workspace.css';

export function PresetOverview({ requestedTab, onRequestedTabHandled }) {
  const tUi = useProductTranslation();
  const { render } = useCatalogSlots();
  const { catalog, selectedPresetId, catalogModel, setCatalog, error: catalogError } = usePresets();
  const [activationError, setError] = useState(''), [activating, setActivating] = useState(false);
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
  return render('eleckoi.preset.page.preview', { preset: current, active, activating, error, onEdit, onActivate },
    <section className="preset-workspace preset-overview" aria-label={tUi('预设')}>
    <PresetProfileHeader preset={current} active={active} editingAvailable onEdit={onEdit} activating={activating} onActivate={onActivate} />
    <div className="preset-workspace-body is-introduction">{error && <p className="preset-save-error" role="alert">{error}</p>}<PresetIntroductionEditor key={current.id} preset={current} readOnly /></div>
  </section>);
}
