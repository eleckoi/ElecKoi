import { useEffect, useId, useRef, useState } from 'react';
import { Button, IconChevronLeftOutlineMedium, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { resolveFailure } from '../../../utils/failureText.js';
import { usePresets } from './PresetContext.jsx';
import { PresetProfileActions, PresetProfileHeader } from './PresetProfileHeader.jsx';
import { PresetIntroductionEditor } from './PresetIntroductionEditor.jsx';
import { openPresetEditorWindow } from '../window/openPresetEditorWindow.js';
import { useCatalogSlots } from '../../../ui/ui/CatalogSlotsContext.jsx';
import '../styles/preset-workspace.css';

export function PresetOverview({ requestedTab, onRequestedTabHandled, onBack, focusBack }) {
  const tUi = useProductTranslation();
  const { render } = useCatalogSlots();
  const { catalog, selectedPresetId, catalogModel, setCatalog, error: catalogError } = usePresets();
  const [activationError, setError] = useState(''), [activating, setActivating] = useState(false);
  const title = useId();
  const back = useRef(null);
  // Catalog summaries already carry the complete display profile; full editor documents are not needed here.
  const current = catalog?.presets.find(preset => preset.id === selectedPresetId);
  const error = activationError || catalogError;
  useEffect(() => { setError(''); }, [selectedPresetId]);
  useEffect(() => { if (focusBack) back.current?.focus({ preventScroll: true }); }, [focusBack, current?.id]);
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
  const backAction = onBack && <div className="preset-overview-back-slot">
    <Tooltip label={tUi('返回')} portal>
      <Button ref={back} data-dsh-control variant="toolbar" className="preset-overview-back" aria-label={tUi('返回')}
        icon={<IconChevronLeftOutlineMedium size={22} aria-hidden="true" />} onClick={onBack} />
    </Tooltip>
  </div>;
  return render('eleckoi.preset.page.preview', owner,
    <section className={`preset-workspace preset-overview${onBack ? ' preset-home-detail' : ''}`} aria-labelledby={title} onKeyDown={onBack && (event => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); onBack(); }
    })}>
      <PresetProfileHeader preset={current} headingId={title} active={active} editingAvailable onEdit={onEdit}
        activating={activating} onActivate={onActivate} showActions={!onBack} backAction={backAction} />
      <div className="preset-workspace-body is-introduction" tabIndex={onBack ? 0 : undefined}>
        <div className="preset-overview-reading">
          {error && <p className="preset-save-error" role="alert">{error}</p>}
          <PresetIntroductionEditor key={current.id} preset={current} readOnly documentScroll={Boolean(onBack)} />
        </div>
      </div>
      {onBack && <footer className="preset-overview-footer">
        <PresetProfileActions active={active} activating={activating} onEdit={onEdit} onActivate={onActivate} activateFirst />
      </footer>}
    </section>);
}
