import { useProductTranslation } from "../i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useState } from "react";
import { applyAppearanceTheme } from "../../modules/appearance/index.js";
import {
  CharacterManager,
} from "../../modules/persona/index.js";
import { showCurrentWindow } from "../services/windowControls.js";
import { TitleBar } from "./shell/components/TitleBar.jsx";
import { bestEffort } from "../../utils/swallowedFailure.js";
import { FailureAlert } from "../../ui/ui/FailureAlert.jsx";
import { LOG_ACTIONS, runLoggedAction } from "../../utils/logAction.js";

const EMPTY_CHARACTERS = { active_character_id: "", groups: [], items: [] };
const EMPTY_PERSONA = { user_name: "用户", user_avatar: "" };

function normalizeCharacters(collection) {
  return {
    active_character_id: collection?.active_character_id || collection?.items?.[0]?.id || "",
    groups: collection?.groups || [],
    items: collection?.items || [],
  };
}

export function CharacterManagerWindow({ characterCatalog, personaModel, renderCharacterManager }) {
  const tUi = useProductTranslation();
  const [characters, setCharacters] = useState(EMPTY_CHARACTERS);
  const [persona, setPersona] = useState(EMPTY_PERSONA);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [nextCharacters, nextPersona] = await Promise.all([characterCatalog.refresh(), personaModel.refresh()]);
      setCharacters(normalizeCharacters(nextCharacters));
      setPersona(nextPersona || EMPTY_PERSONA);
      setLoadError(null);
    } catch (cause) {
      setLoadError(cause ?? tUi("读取角色卡失败。"));
    } finally {
      setLoaded(true);
    }
  }, [characterCatalog, personaModel]);

  useEffect(() => {
    applyAppearanceTheme(null);
    document.title = tUi("角色卡管理器 - ElecKoi");
    showCurrentWindow().catch(bestEffort);
    const updateCharacters = () => {
      const snapshot = characterCatalog.getSnapshot();
      if (snapshot.status === "ready") {
        setCharacters(normalizeCharacters(snapshot.collection));
        setLoaded(true);
        setLoadError(null);
      } else if (snapshot.status === "error") setLoadError(snapshot.error);
    };
    const updatePersona = () => {
      const snapshot = personaModel.getSnapshot();
      if (snapshot.status === "ready") setPersona(snapshot.profile || EMPTY_PERSONA);
      else if (snapshot.status === "error") setLoadError(snapshot.error);
    };
    const stopCharacters = characterCatalog.subscribe(updateCharacters);
    const stopPersona = personaModel.subscribe(updatePersona);
    updateCharacters();
    updatePersona();
    void refresh();
    return () => { stopCharacters(); stopPersona(); };
  }, [characterCatalog, personaModel, refresh, tUi]);

  async function persistGroups(groups, assignments = []) {
    const saved = await characterCatalog.saveGroups(groups, assignments);
    setCharacters(normalizeCharacters(saved));
    return saved;
  }

  async function removeCharacters(characterIds) {
    const saved = await characterCatalog.delete(characterIds);
    setCharacters(normalizeCharacters(saved));
    return saved;
  }

  async function importCharacters(token) {
    // 关键路径日志：导入角色卡（角色卡管理器这条路；主窗口角色页另有一条同样的动作）。
    const result = await runLoggedAction(LOG_ACTIONS.characterImport, () => characterCatalog.commitImport(token));
    setCharacters(normalizeCharacters(result.collection));
    return result;
  }

  // 关键路径日志：导出角色卡。用户点了导出、文件没写出来时，日志要能说明是哪一步。
  function exportCharacters(characterIds, format) {
    return runLoggedAction(LOG_ACTIONS.characterExport, () => characterCatalog.exportCharacters(characterIds, format));
  }

  const managerOwner = {
    characters,
    persona,
    onRefresh: refresh,
    onSaveGroups: persistGroups,
    onDeleteCharacters: removeCharacters,
    onImportCharacters: importCharacters,
    onPrepareImports: (source, files) => characterCatalog.prepareImport(source, files),
    onDiscardImports: (token) => characterCatalog.discardImport(token),
    onExportCharacters: exportCharacters,
    onDuplicateCharacter: (id) => characterCatalog.duplicate(id),
  };
  const managerFallback = <CharacterManager
    characters={characters}
    persona={persona}
    onSaveGroups={persistGroups}
    onDeleteCharacters={removeCharacters}
    onImportCharacters={importCharacters}
    onPrepareImports={(source, files) => characterCatalog.prepareImport(source, files)}
    onDiscardImports={(token) => characterCatalog.discardImport(token)}
    onExportCharacters={exportCharacters}
    onDuplicateCharacter={(id) => characterCatalog.duplicate(id)}
  />;

  return (
    <main className="qq-shell management-window-shell">
      <TitleBar splitSurface />
      <section className="management-window-content">
        {!loaded ? <p className="management-window-state">{tUi("正在读取…")}</p> : loadError ? (
          <FailureAlert failure={loadError}
            className="management-window-state is-error" onRetry={() => void refresh()} />
        ) : (
          renderCharacterManager?.(managerOwner, managerFallback) ?? managerFallback
        )}
      </section>
    </main>
  );
}
