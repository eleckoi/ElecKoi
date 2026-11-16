import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { resolveFailure } from '../../../utils/failureText.js';

const PresetContext = createContext(null);
const EMPTY_PRESET_CATALOG = { status: 'loading', catalog: null, error: '' };
const subscribeEmptyCatalog = () => () => {};
const getEmptyCatalog = () => EMPTY_PRESET_CATALOG;

export function PresetProvider({ children, catalogModel, navigationGuardRef: externalNavigationGuardRef, fixedPresetId }) {
  const tUi = useProductTranslation();
  const snapshot = useSyncExternalStore(
    catalogModel?.subscribe || subscribeEmptyCatalog,
    catalogModel?.getSnapshot || getEmptyCatalog,
  );
  const catalog = snapshot.catalog;
  const [purpose, commitPurpose] = useState('roleplay');
  const purposeCatalog = useMemo(() => catalog ? { ...catalog, groups: catalog.groups.filter(item => item.purpose === purpose), presets: catalog.presets.filter(item => item.purpose === purpose) } : null, [catalog, purpose]);
  const [localSelectedPresetId, commitSelectedPresetId] = useState(() => catalog?.activePresetIds.roleplay || '');
  const selectedPresetId = fixedPresetId ?? localSelectedPresetId;
  const [localError, setError] = useState('');
  const error = localError || snapshot.error;
  const internalNavigationGuardRef = useRef(null);
  const navigationGuard = externalNavigationGuardRef || internalNavigationGuardRef;

  function setCatalog(next) {
    catalogModel.adopt(next);
  }

  function setSelectedPresetId(id) {
    if (id === selectedPresetId) return;
    const select = () => commitSelectedPresetId(id);
    if (navigationGuard.current) navigationGuard.current(select);
    else select();
  }

  function setPurpose(next) {
    if (next === purpose) return;
    const select = () => { commitPurpose(next); commitSelectedPresetId(catalog?.activePresetIds[next] || ''); };
    if (navigationGuard.current) navigationGuard.current(select);
    else select();
  }

  async function refresh(preferredId = '') {
    try {
      const next = await catalogModel.refresh();
      commitSelectedPresetId((current) => {
        const requested = preferredId || current || next.activePresetIds[purpose];
        return next.presets.some((item) => item.id === requested) ? requested : next.activePresetIds[purpose];
      });
      setError('');
      return next;
    } catch (cause) {
      setError(resolveFailure(cause, { fallback: tUi("读取预设失败") }).text);
      return null;
    }
  }

  useEffect(() => {
    // The shared catalog already follows Remote changes; navigation need not reread it.
    const current = catalogModel?.getSnapshot();
    if (catalogModel && (!current.catalog || current.status === 'error')) void refresh();
  }, [catalogModel]);
  useEffect(() => {
    if (!catalog) return;
    setError('');
    commitSelectedPresetId((current) => {
      const requested = current || catalog.activePresetIds[purpose];
      return catalog.presets.some((item) => item.id === requested) ? requested : catalog.activePresetIds[purpose];
    });
  }, [catalog, catalogModel, purpose]);
  const value = useMemo(() => ({ catalog, purposeCatalog, purpose, setPurpose, catalogModel, setCatalog, selectedPresetId, setSelectedPresetId, navigationGuard, refresh, error, setError }), [catalog, purposeCatalog, purpose, catalogModel, selectedPresetId, error]);
  return <PresetContext.Provider value={value}>{children}</PresetContext.Provider>;
}

export function usePresets() {
  const value = useContext(PresetContext);
  if (!value) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, 'PresetProvider is missing.', { what: '预设 Provider' });
  return value;
}
