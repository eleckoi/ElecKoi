import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  BracketsCurly,
  FolderSimple,
  IdentificationCard,
  TreeStructure,
} from "@phosphor-icons/react";
import logoIcon from "../../assets/eleckoi-app-icon.png";
import {
  CharacterBasicInfoPanel,
  getCharacters,
  updateCharacter,
} from "../../modules/persona/index.js";
import { applyAppearanceTheme } from "../../modules/appearance/index.js";
import { DynamicSettingsPanel, SettingLibraryPanel } from "../../modules/settingLibraries/index.js";
import { VariableConfigPanel } from "../../modules/variables/index.js";
import { RegexRulesPanel } from "../../modules/regex/index.js";
import { UnsavedChangesDialog } from "../../ui/ui/UnsavedChangesDialog.jsx";
import { characterName } from "../../utils/characterDisplay.js";
import { appWindow, showCurrentWindow } from "../services/windowControls.js";
import { TitleBar } from "./shell/components/TitleBar.jsx";

const EDITOR_SECTIONS = [
  { id: "card", label: "基础资料", Icon: IdentificationCard },
  { id: "lore", label: "设定库", Icon: BookOpenText },
  { id: "variables", label: "变量", Icon: TreeStructure },
  { id: "regex", label: "正则", Icon: BracketsCurly },
  { id: "dynamic", label: "动态设定", Icon: FolderSimple },
];

function editableCharacterSnapshot(character) {
  if (!character) return "";
  const persona = character.persona || {};
  return JSON.stringify({
    name: character.name || "",
    assistantName: persona.assistant_name || "",
    avatar: persona.assistant_avatar || "",
    cover: persona.assistant_cover || "",
    profile: character.profileLike || "",
  });
}

export function CharacterEditorWindow() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const characterId = params.get("character") || "";
  const [character, setCharacter] = useState(null);
  const [persistedCharacter, setPersistedCharacter] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState("card");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [basicSaveNotice, setBasicSaveNotice] = useState("");
  const [loreDirty, setLoreDirty] = useState(false);
  const [variablesDirty, setVariablesDirty] = useState(false);
  const [regexDirty, setRegexDirty] = useState(false);
  const [dynamicDirty, setDynamicDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const collectionRef = useRef(null);
  const settingLibraryRef = useRef(null);
  const variableConfigRef = useRef(null);
  const regexRulesRef = useRef(null);
  const dynamicSettingsRef = useRef(null);
  const allowCloseRef = useRef(false);

  const basicDirty = useMemo(
    () => editableCharacterSnapshot(character) !== editableCharacterSnapshot(persistedCharacter),
    [character, persistedCharacter],
  );
  const dirty = activeSection === "lore"
    ? loreDirty
    : activeSection === "variables"
      ? variablesDirty
      : activeSection === "regex"
        ? regexDirty
        : activeSection === "dynamic"
          ? dynamicDirty
        : basicDirty;

  useEffect(() => {
    applyAppearanceTheme(null);
  }, []);

  useEffect(() => {
    let active = true;

    getCharacters()
      .then((collection) => {
        if (!active) return;
        collectionRef.current = collection;
        const found = (collection?.items || []).find((item) => item.id === characterId) || null;
        setCharacter(found);
        setPersistedCharacter(found);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });

    showCurrentWindow().catch(() => {});
    return () => {
      active = false;
    };
  }, [characterId]);

  function updateBasicInfo(patch) {
    if (saving) return;
    setSaveError("");
    setBasicSaveNotice("");
    setCharacter((current) => current ? {
      ...current,
      ...patch,
      persona: {
        ...(current.persona || {}),
        ...(patch.persona || {}),
      },
    } : current);
  }

  function cancelChanges() {
    if (saving) return;
    setCharacter(persistedCharacter);
    setSaveError("");
    setBasicSaveNotice("discarded");
  }

  async function saveBasicInfo() {
    if (!character || !collectionRef.current || saving) return false;

    const normalizedName = (character.persona?.assistant_name || character.name || "").trim() || "未命名角色";
    const submittedCharacter = {
      ...character,
      name: normalizedName,
      persona: {
        ...(character.persona || {}),
        assistant_name: normalizedName,
      },
    };
    setSaving(true);
    setSaveError("");
    setBasicSaveNotice("");
    try {
      const saved = await updateCharacter(submittedCharacter);
      const savedCharacter = saved.items.find((item) => item.id === submittedCharacter.id) || submittedCharacter;
      collectionRef.current = saved;
      setPersistedCharacter(savedCharacter);
      setCharacter(savedCharacter);
      setBasicSaveNotice("saved");
      return true;
    } catch (error) {
      setSaveError(error?.message || "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveCurrentDraft() {
    if (activeSection !== "lore" && activeSection !== "variables" && activeSection !== "regex" && activeSection !== "dynamic") return saveBasicInfo();
    if (saving) return false;
    setSaving(true);
    try {
      const editor = activeSection === "lore"
        ? settingLibraryRef.current
        : activeSection === "variables"
          ? variableConfigRef.current
          : activeSection === "regex"
            ? regexRulesRef.current
            : dynamicSettingsRef.current;
      const saved = await editor?.save?.() || false;
      if (saved && activeSection === "lore") setLoreDirty(false);
      if (saved && activeSection === "variables") setVariablesDirty(false);
      if (saved && activeSection === "regex") setRegexDirty(false);
      if (saved && activeSection === "dynamic") setDynamicDirty(false);
      return saved;
    } finally {
      setSaving(false);
    }
  }

  function completePendingAction(action) {
    setPendingAction(null);
    if (action?.type === "section") {
      setActiveSection(action.sectionId);
      return;
    }
    if (action?.type === "close") {
      allowCloseRef.current = true;
      appWindow.close().catch(() => {
        allowCloseRef.current = false;
      });
    }
  }

  function requestSection(sectionId) {
    if (sectionId === activeSection) return;
    if (dirty) {
      setPendingAction({ type: "section", sectionId });
      return;
    }
    setActiveSection(sectionId);
  }

  function requestClose() {
    if (dirty) {
      setPendingAction({ type: "close" });
      return;
    }
    allowCloseRef.current = true;
    appWindow.close().catch(() => {
      allowCloseRef.current = false;
    });
  }

  function discardAndContinue() {
    const action = pendingAction;
    if (activeSection === "lore") {
      settingLibraryRef.current?.discard?.();
      setLoreDirty(false);
    } else if (activeSection === "variables") {
      variableConfigRef.current?.discard?.();
      setVariablesDirty(false);
    } else if (activeSection === "regex") {
      regexRulesRef.current?.discard?.();
      setRegexDirty(false);
    } else if (activeSection === "dynamic") {
      dynamicSettingsRef.current?.discard?.();
      setDynamicDirty(false);
    } else setCharacter(persistedCharacter);
    setSaveError("");
    completePendingAction(action);
  }

  async function saveAndContinue() {
    const action = pendingAction;
    if (await saveCurrentDraft()) completePendingAction(action);
  }

  const activeLabel = EDITOR_SECTIONS.find((section) => section.id === activeSection)?.label || "基础资料";

  useEffect(() => {
    document.title = character ? `${characterName(character)} - 角色编辑器 - ElecKoi` : "角色编辑器 - ElecKoi";
  }, [character]);

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!dirty || allowCloseRef.current) return;
      event.preventDefault();
      event.returnValue = false;
      setPendingAction({ type: "close" });
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  return (
    <main className="qq-shell qq-character-editor-window-shell">
      <aside className="character-editor-side-panel">
        <header className="side-panel-header" data-tauri-drag-region>
          <div className="side-panel-brand">
            <img src={logoIcon} alt="" draggable="false" />
            <strong>ElecKoi</strong>
          </div>
        </header>
        <nav className="character-editor-navigation" aria-label="角色编辑器功能">
          {EDITOR_SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={activeSection === id ? "page" : undefined}
              onClick={() => requestSection(id)}
            >
              <Icon size={19} weight={activeSection === id ? "fill" : "regular"} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="character-editor-main-panel">
        <TitleBar splitSurface onClose={requestClose} />
        <section
          className={`character-editor-workspace${activeSection === "card" ? " is-basic-info" : ""}${activeSection === "lore" ? " is-setting-library" : ""}${activeSection === "variables" ? " is-variable-config" : ""}${activeSection === "regex" ? " is-regex-rules" : ""}${activeSection === "dynamic" ? " is-dynamic-settings" : ""}`}
          aria-label={activeLabel}
        >
          {loaded && !character ? (
            <p className="character-editor-missing">角色不存在</p>
          ) : activeSection === "card" ? (
            character ? (
              <CharacterBasicInfoPanel
                character={character}
                dirty={basicDirty}
                saving={saving}
                error={saveError}
                saveNotice={basicSaveNotice}
                onChange={updateBasicInfo}
                onCancel={cancelChanges}
                onSave={saveBasicInfo}
              />
            ) : null
          ) : activeSection === "lore" ? (
            character ? (
              <SettingLibraryPanel
                ref={settingLibraryRef}
                characterId={character.id}
                onDirtyChange={setLoreDirty}
              />
            ) : null
          ) : activeSection === "variables" ? (
            character ? (
              <VariableConfigPanel
                ref={variableConfigRef}
                characterId={character.id}
                onDirtyChange={setVariablesDirty}
              />
            ) : null
          ) : activeSection === "regex" ? (
            character ? (
              <RegexRulesPanel
                ref={regexRulesRef}
                characterId={character.id}
                onDirtyChange={setRegexDirty}
              />
            ) : null
          ) : activeSection === "dynamic" ? (
            character ? (
              <DynamicSettingsPanel
                ref={dynamicSettingsRef}
                characterId={character.id}
                onDirtyChange={setDynamicDirty}
              />
            ) : null
          ) : (
            <h1 id="character-editor-section-title">{activeLabel}</h1>
          )}
        </section>
      </section>
      <UnsavedChangesDialog
        open={Boolean(pendingAction)}
        title="保存修改？"
        description="离开前是否保存当前角色的修改？"
        saving={saving}
        onCancel={() => setPendingAction(null)}
        onDiscard={discardAndContinue}
        onSave={saveAndContinue}
      />
    </main>
  );
}
