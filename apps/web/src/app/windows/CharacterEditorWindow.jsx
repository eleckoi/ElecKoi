import { EditorNavigationRail } from '../../ui/ui/EditorNavigationRail.jsx';
import { localizeUiCopy } from "../i18n/productCopy.js";
import { useProductTranslation } from "../i18n/ProductLocaleContext.jsx";
import { CharacterOpeningsPanel } from "../../modules/characterOpenings/index.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  ChatCircleDots,
  BracketsCurly,
  IdentificationCard,
  TreeStructure,
  Browsers,
} from "@phosphor-icons/react";
import logoIcon from "../../assets/eleckoi-app-icon.png";
import { ElecKoiWordmark } from "../../ui/icons/ElecKoiWordmark.jsx";
import { FileCode, FolderSimple } from '../../ui/icons/interfaceIcons.jsx';
import { resolveFailure } from '../../utils/failureText.js';
import {
  CharacterBasicInfoPanel,
} from "../../modules/persona/index.js";
import { applyAppearanceTheme } from "../../modules/appearance/index.js";
import { DynamicSettingsPanel, SettingLibraryPanel } from "../../modules/settingLibraries/index.js";
import { VariableConfigPanel } from "../../modules/variables/index.js";
import { RegexRulesPanel } from "../../modules/regex/index.js";
import { ScriptLibrariesPanel } from '../../modules/scripts/index.js';
import { CharacterFrontendPanel } from '../../modules/authorFrontend/index.js';
import { useCharacterEditorSidebarState } from "../../modules/settings/index.js";
import { AppErrorDialog } from "../../ui/ui/AppErrorDialog.jsx";
import { UnsavedChangesDialog } from "../../ui/ui/UnsavedChangesDialog.jsx";
import { characterName } from "../../utils/characterDisplay.js";
import { appWindow, showCurrentWindow } from "../services/windowControls.js";
import { TitleBar } from "./shell/components/TitleBar.jsx";
import { EditorPresentationContext, useEditorFeedbackHost } from '../../ui/ui/EditorPresentationContext.jsx';
import { usePageFade } from '../../ui/hooks/usePageFade.js';
import { bestEffort } from "../../utils/swallowedFailure.js";

const EDITOR_SECTIONS = [
  { id: "card", label: "基础资料", Icon: IdentificationCard },
  { id: "openings", label: "开场白", Icon: ChatCircleDots },
  { id: "lore", label: "设定库", Icon: BookOpenText },
  { id: "variables", label: "变量", Icon: TreeStructure },
  { id: "regex", label: "正则", Icon: BracketsCurly },
  { id: 'scripts', label: '脚本', Icon: FileCode },
  { id: 'frontend', label: '前端', Icon: Browsers },
  { id: "dynamic", label: "分支设定", Icon: FolderSimple },
];

const CHARACTER_EDITOR_SIDEBAR_DEFAULT_WIDTH = 220;
const CHARACTER_EDITOR_SIDEBAR_MIN_WIDTH = 190;
const CHARACTER_EDITOR_SIDEBAR_MAX_WIDTH = 340;

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

export function CharacterEditorWindow({ characterCatalog, characterConfiguration, renderCharacterEditorSection, embeddedCharacterId, navigationGuardRef, renderHeader, onClose, compact = false, registerBackHandler }) {
  const tUi = useProductTranslation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const characterId = embeddedCharacterId ?? params.get("character") ?? "";
  const [character, setCharacter] = useState(null);
  const [persistedCharacter, setPersistedCharacter] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState("card");
  const workspaceRef = usePageFade(activeSection, compact, '.editor-sidebar-directory, .dynamic-settings-conversation-list, .character-basic-content');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [basicSaveNotice, setBasicSaveNotice] = useState("");
  const [openingsDirty, setOpeningsDirty] = useState(false);
  const [loreDirty, setLoreDirty] = useState(false);
  const [variablesDirty, setVariablesDirty] = useState(false);
  const [regexDirty, setRegexDirty] = useState(false);
  const [scriptsDirty, setScriptsDirty] = useState(false);
  const [frontendDirty, setFrontendDirty] = useState(false);
  const [dynamicDirty, setDynamicDirty] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(CHARACTER_EDITOR_SIDEBAR_DEFAULT_WIDTH);
  const sidebarPreference = useCharacterEditorSidebarState();
  const sidebarCollapsed = sidebarPreference.collapsed;
  const [sidebarResize, setSidebarResize] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [subpage, setSubpage] = useState(null);
  const { feedback, registerSaveFeedback } = useEditorFeedbackHost();
  const registerSubpage = useCallback(page => {
    setSubpage(page);
    return () => setSubpage(current => current === page ? null : current);
  }, []);
  const presentation = useMemo(() => ({ compact, registerSubpage, registerBackHandler, registerSaveFeedback }), [compact, registerSubpage, registerBackHandler, registerSaveFeedback]);
  useEffect(() => {
    if (!compact || !subpage || !registerBackHandler) return undefined;
    return registerBackHandler(() => { subpage.back(); return true; });
  }, [compact, subpage, registerBackHandler]);
  const collectionRef = useRef(null);
  const openingsRef = useRef(null);
  const settingLibraryRef = useRef(null);
  const variableConfigRef = useRef(null);
  const regexRulesRef = useRef(null);
  const scriptsRef = useRef(null);
  const frontendRef = useRef(null);
  const dynamicSettingsRef = useRef(null);
  const allowCloseRef = useRef(false);

  useEffect(() => {
    if (!sidebarResize) return undefined;
    const handlePointerMove = (event) => {
      setSidebarWidth(Math.min(CHARACTER_EDITOR_SIDEBAR_MAX_WIDTH, Math.max(CHARACTER_EDITOR_SIDEBAR_MIN_WIDTH, sidebarResize.startWidth + event.clientX - sidebarResize.startX)));
    };
    const stopResize = () => setSidebarResize(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [sidebarResize]);

  function adjustSidebarWidth(delta) {
    setSidebarWidth((current) => Math.min(CHARACTER_EDITOR_SIDEBAR_MAX_WIDTH, Math.max(CHARACTER_EDITOR_SIDEBAR_MIN_WIDTH, current + delta)));
  }

  const basicDirty = useMemo(
    () => editableCharacterSnapshot(character) !== editableCharacterSnapshot(persistedCharacter),
    [character, persistedCharacter],
  );
  const dirty = activeSection === "openings"
    ? openingsDirty
    : activeSection === "lore"
    ? loreDirty
    : activeSection === "variables"
      ? variablesDirty
      : activeSection === "regex"
        ? regexDirty
        : activeSection === 'scripts'
          ? scriptsDirty
        : activeSection === 'frontend'
          ? frontendDirty
        : activeSection === "dynamic"
          ? dynamicDirty
        : basicDirty;

  useEffect(() => {
    if (embeddedCharacterId === undefined) applyAppearanceTheme(null);
  }, [embeddedCharacterId]);

  useEffect(() => {
    let active = true;

    characterCatalog.refresh()
      .then((collection) => {
        if (!active) return;
        collectionRef.current = collection;
        const found = (collection?.items || []).find((item) => item.id === characterId) || null;
        setCharacter(found);
        setPersistedCharacter(found);
      })
      .catch((error) => { if (active) setSaveError(resolveFailure(error, { fallback: tUi("读取角色卡失败") }).text); })
      .finally(() => {
        if (active) setLoaded(true);
      });

    if (embeddedCharacterId === undefined) showCurrentWindow().catch(bestEffort);
    return () => {
      active = false;
    };
  }, [characterCatalog, characterId]);

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

  async function saveBasicInfo(candidate = character) {
    if (!candidate || !collectionRef.current || saving) return false;

    const normalizedName = (candidate.persona?.assistant_name || candidate.name || "").trim() || tUi("未命名角色");
    const submittedCharacter = {
      ...candidate,
      name: normalizedName,
      persona: {
        ...(candidate.persona || {}),
        assistant_name: normalizedName,
      },
    };
    setSaving(true);
    setSaveError("");
    setBasicSaveNotice("");
    try {
      const saved = await characterCatalog.update(submittedCharacter);
      const savedCharacter = saved.items.find((item) => item.id === submittedCharacter.id) || submittedCharacter;
      collectionRef.current = saved;
      setPersistedCharacter(savedCharacter);
      setCharacter(savedCharacter);
      setBasicSaveNotice("saved");
      return true;
    } catch (error) {
      setSaveError(resolveFailure(error, { fallback: tUi("保存失败") }).text);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveCurrentDraft() {
    if (!["openings", "lore", "variables", "regex", 'scripts', 'frontend', "dynamic"].includes(activeSection)) return saveBasicInfo();
    if (saving) return false;
    setSaving(true);
    try {
      const editor = activeSection === "openings"
        ? openingsRef.current
        : activeSection === "lore"
        ? settingLibraryRef.current
        : activeSection === "variables"
          ? variableConfigRef.current
          : activeSection === "regex"
            ? regexRulesRef.current
            : activeSection === 'scripts'
              ? scriptsRef.current
            : activeSection === 'frontend'
              ? frontendRef.current
            : dynamicSettingsRef.current;
      const saved = await editor?.save?.() || false;
      if (saved && activeSection === "openings") setOpeningsDirty(false);
      if (saved && activeSection === "lore") setLoreDirty(false);
      if (saved && activeSection === "variables") setVariablesDirty(false);
      if (saved && activeSection === "regex") setRegexDirty(false);
      if (saved && activeSection === 'scripts') setScriptsDirty(false);
      if (saved && activeSection === 'frontend') setFrontendDirty(false);
      if (saved && activeSection === "dynamic") setDynamicDirty(false);
      return saved;
    } finally {
      setSaving(false);
    }
  }

  function completePendingAction(action) {
    setPendingAction(null);
    if (action?.type === "navigate") { action.run(); return; }
    if (action?.type === "section") {
      setActiveSection(action.sectionId);
      return;
    }
    if (action?.type === "close") {
      if (onClose) { onClose(); return; }
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
    if (onClose) { onClose(); return; }
    allowCloseRef.current = true;
    appWindow.close().catch(() => {
      allowCloseRef.current = false;
    });
  }

  function discardAndContinue() {
    const action = pendingAction;
    if (activeSection === "openings") {
      openingsRef.current?.discard?.();
      setOpeningsDirty(false);
    } else if (activeSection === "lore") {
      settingLibraryRef.current?.discard?.();
      setLoreDirty(false);
    } else if (activeSection === "variables") {
      variableConfigRef.current?.discard?.();
      setVariablesDirty(false);
    } else if (activeSection === "regex") {
      regexRulesRef.current?.discard?.();
      setRegexDirty(false);
    } else if (activeSection === 'scripts') {
      scriptsRef.current?.discard?.();
      setScriptsDirty(false);
    } else if (activeSection === 'frontend') {
      frontendRef.current?.discard?.();
      setFrontendDirty(false);
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

  const activeLabel = localizeUiCopy(EDITOR_SECTIONS, tUi).find((section) => section.id === activeSection)?.label || tUi("基础资料");
  useEffect(() => {
    if (!navigationGuardRef) return;
    navigationGuardRef.current = run => {
      if (dirty) setPendingAction({ type: 'navigate', run });
      else run();
    };
    return () => { navigationGuardRef.current = null; };
  }, [dirty, navigationGuardRef]);

  useEffect(() => {
    document.title = character ? tUi("{value0} - 角色编辑器 - ElecKoi", {value0: characterName(character, tUi)}) : tUi("角色编辑器 - ElecKoi");
  }, [character, tUi]);

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

  let editorContent = null;
  if (character) {
    if (activeSection === "card") {
      const fallback = <CharacterBasicInfoPanel
        character={character}
        dirty={basicDirty}
        saving={saving}
        error={saveError}
        saveNotice={basicSaveNotice}
        onChange={updateBasicInfo}
        onCancel={cancelChanges}
        onSave={saveBasicInfo}
      />;
      const owner = {
        characterId: character.id, character, dirty: basicDirty, saving,
        error: saveError, saveNotice: basicSaveNotice,
        onChange: updateBasicInfo, onCancel: cancelChanges, onSave: saveBasicInfo,
      };
      editorContent = renderCharacterEditorSection?.("card", owner, fallback) ?? fallback;
    } else if (activeSection === "openings") {
      const fallback = <CharacterOpeningsPanel ref={openingsRef} characterId={character.id}
        openings={characterConfiguration.openings} variables={characterConfiguration.variables}
        onDirtyChange={setOpeningsDirty} />;
      editorContent = renderCharacterEditorSection?.("openings", {
        characterId: character.id, dirty: openingsDirty, saving,
        configuration: characterConfiguration.openings, onDirtyChange: setOpeningsDirty,
        setController: controller => { openingsRef.current = controller; },
      }, fallback) ?? fallback;
    } else if (activeSection === "lore") {
      const fallback = <SettingLibraryPanel
        ref={settingLibraryRef}
        characterId={character.id}
        settingLibraries={characterConfiguration.settingLibraries}
        globalSettingLibraries={characterConfiguration.globalSettingLibraries}
        onDirtyChange={setLoreDirty}
      />;
      editorContent = renderCharacterEditorSection?.("lore", {
        characterId: character.id, dirty: loreDirty, saving,
        configuration: characterConfiguration.settingLibraries,
        onDirtyChange: setLoreDirty,
        setController: (controller) => { settingLibraryRef.current = controller; },
      }, fallback) ?? fallback;
    } else if (activeSection === "variables") {
      const fallback = <VariableConfigPanel
        ref={variableConfigRef}
        characterId={character.id}
        variables={characterConfiguration.variables}
        onDirtyChange={setVariablesDirty}
      />;
      editorContent = renderCharacterEditorSection?.("variables", {
        characterId: character.id, dirty: variablesDirty, saving,
        configuration: characterConfiguration.variables,
        onDirtyChange: setVariablesDirty,
        setController: (controller) => { variableConfigRef.current = controller; },
      }, fallback) ?? fallback;
    } else if (activeSection === "regex") {
      const fallback = <RegexRulesPanel
        ref={regexRulesRef}
        characterId={character.id}
        regexRules={characterConfiguration.regexRules}
        onDirtyChange={setRegexDirty}
      />;
      editorContent = renderCharacterEditorSection?.("regex", {
        characterId: character.id, dirty: regexDirty, saving,
        configuration: characterConfiguration.regexRules,
        onDirtyChange: setRegexDirty,
        setController: (controller) => { regexRulesRef.current = controller; },
      }, fallback) ?? fallback;
    } else if (activeSection === 'scripts') {
      const fallback = <ScriptLibrariesPanel ref={scriptsRef} characterId={character.id}
        scriptLibraries={characterConfiguration.scripts} scriptRuntimeConnection={characterConfiguration.scriptRuntimeConnection}
        onDirtyChange={setScriptsDirty} />;
      editorContent = renderCharacterEditorSection?.('scripts', {
        characterId: character.id, dirty: scriptsDirty, saving,
        configuration: characterConfiguration.scripts, onDirtyChange: setScriptsDirty,
        setController: controller => { scriptsRef.current = controller; },
      }, fallback) ?? fallback;
    } else if (activeSection === 'frontend') {
      const fallback = <CharacterFrontendPanel ref={frontendRef} characterId={character.id} onDirtyChange={setFrontendDirty} />;
      editorContent = renderCharacterEditorSection?.('frontend', {
        characterId: character.id, dirty: frontendDirty, saving, onDirtyChange: setFrontendDirty,
        setController: controller => { frontendRef.current = controller; },
      }, fallback) ?? fallback;
    } else if (activeSection === "dynamic") {
      const fallback = <DynamicSettingsPanel
        ref={dynamicSettingsRef}
        characterId={character.id}
        settingLibraries={characterConfiguration.settingLibraries}
        onDirtyChange={setDynamicDirty}
      />;
      editorContent = renderCharacterEditorSection?.("dynamic", {
        characterId: character.id, dirty: dynamicDirty, saving,
        configuration: characterConfiguration.settingLibraries,
        onDirtyChange: setDynamicDirty,
        setController: (controller) => { dynamicSettingsRef.current = controller; },
      }, fallback) ?? fallback;
    }
  }

  return (
    <EditorPresentationContext.Provider value={presentation}>
    <main className={`qq-shell qq-character-editor-window-shell${compact && subpage ? ' is-editor-subpage' : ''}${compact && sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`} style={{ "--character-editor-sidebar-width": `${sidebarWidth}px` }}>
      <aside className="character-editor-side-panel">
        <header className="side-panel-header" data-tauri-drag-region>
          <div className="side-panel-brand">
            <img src={logoIcon} alt="" draggable="false" />
            {compact ? <strong>ElecKoi</strong> : <ElecKoiWordmark />}
          </div>
        </header>
        <EditorNavigationRail id="character-editor-navigation" label={tUi("角色编辑器功能")} items={localizeUiCopy(EDITOR_SECTIONS, tUi)}
          value={activeSection} onChange={requestSection} compact={compact} collapsed={sidebarCollapsed} busy={sidebarPreference.busy} onToggle={sidebarPreference.toggle} />
        <div
          className={`character-editor-sidebar-resizer${sidebarResize ? " is-resizing" : ""}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={tUi("调整侧边栏宽度")}
          aria-valuemin={CHARACTER_EDITOR_SIDEBAR_MIN_WIDTH}
          aria-valuemax={CHARACTER_EDITOR_SIDEBAR_MAX_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setSidebarResize({ startX: event.clientX, startWidth: sidebarWidth });
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); adjustSidebarWidth(-16); }
            if (event.key === "ArrowRight") { event.preventDefault(); adjustSidebarWidth(16); }
            if (event.key === "Home") { event.preventDefault(); setSidebarWidth(CHARACTER_EDITOR_SIDEBAR_MIN_WIDTH); }
            if (event.key === "End") { event.preventDefault(); setSidebarWidth(CHARACTER_EDITOR_SIDEBAR_MAX_WIDTH); }
          }}
        />
      </aside>

      <section className="character-editor-main-panel">
        {renderHeader ? renderHeader({ character, dirty, saving, save: saveCurrentDraft, subpage, feedback: activeSection === 'card' ? { error: saveError, notice: basicSaveNotice } : feedback }) : <TitleBar splitSurface onClose={requestClose} />}
        <section
          className={`character-editor-workspace${['openings', 'lore', 'variables', 'regex', 'scripts'].includes(activeSection) ? ' is-collection-editor' : ''}${activeSection === "card" ? " is-basic-info" : ""}${activeSection === "openings" ? " is-character-openings" : ""}${activeSection === "lore" ? " is-setting-library" : ""}${activeSection === "variables" ? " is-variable-config" : ""}${activeSection === "regex" ? " is-regex-rules" : ""}${activeSection === 'scripts' ? ' is-scripts' : ''}${activeSection === 'frontend' ? ' is-frontend' : ''}${activeSection === "dynamic" ? " is-dynamic-settings" : ""}`}
          aria-label={activeLabel}
          ref={workspaceRef}
        >
          {loaded && !character
            ? <p className="character-editor-missing" role={saveError ? 'alert' : undefined}>{saveError || tUi("角色不存在")}</p>
            : editorContent || <h1 id="character-editor-section-title">{activeLabel}</h1>}
        </section>
      </section>
      <UnsavedChangesDialog
        open={Boolean(pendingAction)}
        title={tUi("保存修改？")}
        description={tUi("离开前是否保存当前角色的修改？")}
        saving={saving}
        onCancel={() => setPendingAction(null)}
        onDiscard={discardAndContinue}
        onSave={saveAndContinue}
      />
      {compact && <AppErrorDialog notice={sidebarPreference.error ? { id: sidebarPreference.error, message: sidebarPreference.error } : null}
        onDismiss={sidebarPreference.dismissError} />}
    </main>
    </EditorPresentationContext.Provider>
  );
}
