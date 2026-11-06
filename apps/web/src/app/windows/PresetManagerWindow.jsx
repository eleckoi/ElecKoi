import { useProductTranslation } from "../i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyAppearanceTheme } from "../../modules/appearance/index.js";
import {
  downloadPresetFile,
  fileBase64,
  PresetImportDialog,
  PresetManager,
} from "../../modules/presets/index.js";
import { showCurrentWindow } from "../services/windowControls.js";
import { TitleBar } from "./shell/components/TitleBar.jsx";
import { bestEffort } from "../../utils/swallowedFailure.js";
import { FailureAlert } from "../../ui/ui/FailureAlert.jsx";

const ALL_PRESETS = "全部预设";

export function PresetManagerWindow({ presetCatalog, renderPresetManager }) {
  const tUi = useProductTranslation();
  const [catalog, setCatalog] = useState(null);
  const [purpose, setPurpose] = useState(() => new URLSearchParams(window.location.search).get('purpose') === 'creator' ? 'creator' : 'roleplay');
  const [selectedGroup, setSelectedGroup] = useState(ALL_PRESETS);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const importInputRef = useRef(null);
  const importSourceRef = useRef("");

  const acceptCatalog = useCallback((next, preferredId = "") => {
    setCatalog(next);
    setSelectedPresetId((current) => {
      const requested = preferredId || current || next.activePresetIds[purpose];
      return next.presets.some((preset) => preset.id === requested && preset.purpose === purpose) ? requested : next.activePresetIds[purpose];
    });
    setSelectedGroup((current) => current === ALL_PRESETS || next.groups.some((group) => group.id === current) ? current : ALL_PRESETS);
    setLoadError(null);
    return next;
  }, [purpose]);

  const refresh = useCallback(async (preferredId = "") => {
    try {
      return acceptCatalog(await presetCatalog.refresh(), preferredId);
    } catch (cause) {
      setLoadError(cause ?? tUi("读取预设失败。"));
      return null;
    }
  }, [acceptCatalog, presetCatalog]);

  useEffect(() => {
    applyAppearanceTheme(null);
    document.title = tUi("预设管理器 - ElecKoi");
    showCurrentWindow().catch(bestEffort);
    const update = () => {
      const snapshot = presetCatalog.getSnapshot();
      if (snapshot.status === "ready") acceptCatalog(snapshot.catalog);
      else if (snapshot.status === "error") setLoadError(snapshot.error);
    };
    const stop = presetCatalog.subscribe(update);
    update();
    void refresh();
    return stop;
  }, [acceptCatalog, presetCatalog, refresh, tUi]);

  function beginImport() {
    setImportError("");
    setImportDialogOpen(true);
  }

  function chooseImportSource(source) {
    importSourceRef.current = source;
    setImportDialogOpen(false);
    if (!importInputRef.current) return;
    importInputRef.current.accept = source === "sillytavern"
      ? "application/json,.json"
      : "image/png,application/json,.png,.json";
    importInputRef.current.click();
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      const result = await presetCatalog.import(importSourceRef.current, {
        displayName: file.name,
        mimeType: file.type,
        base64: await fileBase64(file),
      }, purpose);
      setSelectedGroup(ALL_PRESETS);
      await refresh(result.preset.id);
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : tUi("导入预设失败。"));
    } finally {
      setImporting(false);
    }
  }

  async function downloadPreset(format) {
    if (!selectedPresetId) return;
    setImportError("");
    downloadPresetFile(await presetCatalog.export(selectedPresetId, format));
  }

  const purposeCatalog = catalog ? { ...catalog, groups: catalog.groups.filter(item => item.purpose === purpose), presets: catalog.presets.filter(item => item.purpose === purpose) } : null;
  function changePurpose(value) { setPurpose(value); setSelectedGroup(ALL_PRESETS); setSelectedPresetId(catalog?.activePresetIds[value] || ''); }
  const managerOwner = {
    catalog: purposeCatalog,
    purpose,
    onPurposeChange: changePurpose,
    selectedGroup,
    selectedPresetId,
    importing,
    importError,
    onSelectGroup: setSelectedGroup,
    onSelectPreset: setSelectedPresetId,
    onRefresh: refresh,
    onImport: beginImport,
    onExport: downloadPreset,
  };
  const managerFallback = catalog ? <PresetManager
    catalogModel={presetCatalog}
    catalog={purposeCatalog}
    purpose={purpose}
    onPurposeChange={changePurpose}
    selectedGroup={selectedGroup}
    selectedPresetId={selectedPresetId}
    onSelectGroup={setSelectedGroup}
    onSelectPreset={setSelectedPresetId}
    onRefresh={refresh}
    onImport={beginImport}
    onExport={downloadPreset}
    importing={importing}
    importError={importError}
  /> : null;

  return (
    <main className="qq-shell management-window-shell preset-manager-shell">
      <TitleBar splitSurface />
      <section className="management-window-content">
        {!catalog && !loadError ? <p className="management-window-state">{tUi("正在读取…")}</p> : loadError ? (
          <FailureAlert failure={loadError}
            className="management-window-state is-error" onRetry={() => void refresh()} />
        ) : (
          renderPresetManager?.(managerOwner, managerFallback) ?? managerFallback
        )}
      </section>
      <input ref={importInputRef} type="file" accept="image/png,application/json,.png,.json" hidden onChange={handleImport} />
      {importDialogOpen ? <PresetImportDialog onSelect={chooseImportSource} onClose={() => setImportDialogOpen(false)} /> : null}
    </main>
  );
}
