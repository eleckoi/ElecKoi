import { useCallback, useEffect, useState } from "react";
import { listenRecordsChanged } from "../../bridge/recordEvents.js";
import { applyAppearanceTheme } from "../../modules/appearance/index.js";
import {
  CharacterManager,
  commitCharacterImports,
  deleteCharacters,
  exportCharacterFiles,
  getCharacters,
  getPersona,
  saveCharacterGroups,
} from "../../modules/persona/index.js";
import { showCurrentWindow } from "../services/windowControls.js";
import { TitleBar } from "./shell/components/TitleBar.jsx";

const EMPTY_CHARACTERS = { active_character_id: "", groups: [], items: [] };
const EMPTY_PERSONA = { user_name: "用户", user_avatar: "" };

function normalizeCharacters(collection) {
  return {
    active_character_id: collection?.active_character_id || collection?.items?.[0]?.id || "",
    groups: collection?.groups || [],
    items: collection?.items || [],
  };
}

export function CharacterManagerWindow() {
  const [characters, setCharacters] = useState(EMPTY_CHARACTERS);
  const [persona, setPersona] = useState(EMPTY_PERSONA);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [nextCharacters, personaResult] = await Promise.all([getCharacters(), getPersona()]);
      setCharacters(normalizeCharacters(nextCharacters));
      setPersona(personaResult.persona || EMPTY_PERSONA);
      setLoadError("");
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "读取角色卡失败。");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    applyAppearanceTheme(null);
    document.title = "角色卡管理器 - ElecKoi";
    showCurrentWindow().catch(() => {});
    void refresh();
    return listenRecordsChanged((event) => {
      if (event.module === "personas") void refresh();
    });
  }, [refresh]);

  async function persistGroups(groups, assignments = []) {
    const saved = await saveCharacterGroups(groups, assignments);
    setCharacters(normalizeCharacters(saved));
    return saved;
  }

  async function removeCharacters(characterIds) {
    const saved = await deleteCharacters(characterIds);
    setCharacters(normalizeCharacters(saved));
    return saved;
  }

  async function importCharacters(token) {
    const result = await commitCharacterImports(token);
    setCharacters(normalizeCharacters(result.collection));
    return result;
  }

  return (
    <main className="qq-shell management-window-shell">
      <TitleBar splitSurface />
      <section className="management-window-content">
        {!loaded ? <p className="management-window-state">正在读取…</p> : loadError ? (
          <div className="management-window-state is-error" role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={() => void refresh()}>重试</button>
          </div>
        ) : (
          <CharacterManager
            characters={characters}
            persona={persona}
            onSaveGroups={persistGroups}
            onDeleteCharacters={removeCharacters}
            onImportCharacters={importCharacters}
            onExportCharacters={exportCharacterFiles}
          />
        )}
      </section>
    </main>
  );
}
