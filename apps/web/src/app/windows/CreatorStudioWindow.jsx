import { useProductTranslation } from "../i18n/ProductLocaleContext.jsx";
// NODE STUDIO: retained project/canvas development entry; future integration starts here.
// Production creation is assembled in dsh-client-creator-studio/page.jsx in the main window.
import { useEffect, useId, useState } from "react";
import { ArrowLeft, CheckCircle, Sparkle } from "@phosphor-icons/react";
import logoIcon from "../../assets/eleckoi-app-icon.png";
import { applyAppearanceTheme } from "../../modules/appearance/index.js";
import {
  CanvasDotGrid,
  CreatorStudioCanvas,
  CreatorStudioProjectHome,
  CreatorStudioSimplePage,
  DEFAULT_CANVAS_VIEWPORT,
} from "../../modules/creatorStudio/index.js";
import { DshPanelLeftIcon } from "../../ui/icons/dshComposerIcons.jsx";
import { showCurrentWindow } from "../services/windowControls.js";
import { WindowControls } from "./shell/components/TitleBar.jsx";
import { bestEffort } from "../../utils/swallowedFailure.js";

function CreatorStudioDevelopmentNotice({ onSimple, onDeveloper }) {
  const tUi = useProductTranslation();
  return <main className="qq-shell creator-studio-shell creator-studio-development-shell" aria-label={tUi("AI创作工作室")}>
    <header className="creator-studio-development-header" data-tauri-drag-region>
      <div className="creator-studio-development-brand" data-tauri-drag-region>
        <img src={logoIcon} alt="" draggable="false" />
        <strong>{tUi("AI创作工作室")}</strong>
      </div>
      <div data-tauri-drag-region />
      <WindowControls />
    </header>
    <section className="creator-studio-development-content" aria-label={tUi("工作室入口")}>
      <div className="creator-studio-entry-options">
        <div className="creator-studio-development-card">
          <h1>{tUi("简易版")}</h1>
          <button className="creator-studio-development-enter" type="button" onClick={onSimple}>{tUi("进入简易版")}</button>
        </div>
        <div className="creator-studio-development-card is-developer">
          <h1>{tUi("开发者专用")}</h1><p>{tUi("勿进")}</p>
          <button className="creator-studio-development-enter" type="button" onClick={onDeveloper}>{tUi("进入开发版")}</button>
        </div>
      </div>
    </section>
  </main>;
}

export function CreatorStudioWindow({ characterCatalog, projectCatalog, models, presetCatalog, renderCreatorStudioConversation, rightbar, navigation }) {
  const tUi = useProductTranslation();
  const [mode, setMode] = useState('entry');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [canvasAssetsOpen, setCanvasAssetsOpen] = useState(false);
  const [canvasDirty, setCanvasDirty] = useState(false);
  const [canvasViewport, setCanvasViewport] = useState(DEFAULT_CANVAS_VIEWPORT);
  const titlebarGridId = useId().replace(/:/g, "");

  useEffect(() => {
    applyAppearanceTheme(null);
    document.title = tUi("AI创作工作室 - ElecKoi");
    showCurrentWindow().catch(bestEffort);
  }, [tUi]);

  const nativePanelId = ['plugins', 'conversation'].includes(navigation?.selectedPanelId) ? navigation.selectedPanelId : null;
  if (mode === 'entry') return <CreatorStudioDevelopmentNotice onSimple={() => setMode('simple')} onDeveloper={() => setMode('developer')} />;
  if (mode === 'simple') return <CreatorStudioSimplePage characterCatalog={characterCatalog} model={projectCatalog.sessions}
    models={models} presetCatalog={presetCatalog} rightbar={rightbar} renderConversation={renderCreatorStudioConversation}
    nativePanel={nativePanelId ? navigation.renderPanel(nativePanelId) : null}
    onReturnToConversation={() => navigation.selectPanel('messages')} onBack={() => setMode('entry')} />;

  const openProject = (project) => {
    setActiveProject(project);
    setAssistantOpen(false);
    setCanvasAssetsOpen(false);
    setCanvasDirty(false);
    setCanvasViewport({ ...DEFAULT_CANVAS_VIEWPORT });
  };

  const closeProject = () => {
    setActiveProject(null);
    setAssistantOpen(false);
    setCanvasAssetsOpen(false);
    setCanvasDirty(false);
    setCanvasViewport({ ...DEFAULT_CANVAS_VIEWPORT });
  };

  const titlebarGridViewport = {
    x: canvasViewport.x + (canvasAssetsOpen ? 320 : 0),
    y: canvasViewport.y + 52,
    zoom: canvasViewport.zoom,
  };

  return <main className="qq-shell creator-studio-shell">
    <header className={`creator-studio-shell-header${sidebarCollapsed && !activeProject ? " is-sidebar-collapsed" : ""}${activeProject ? " is-canvas-mode" : ""}${activeProject && canvasAssetsOpen ? " has-canvas-assets" : ""}`} data-tauri-drag-region>
      {activeProject ? <>
        <CanvasDotGrid id={`${titlebarGridId}-titlebar`} viewport={titlebarGridViewport} className="is-titlebar" />
        <div className="creator-studio-canvas-titlebar" data-tauri-drag-region>
        <button className="creator-studio-canvas-back" type="button" aria-label={tUi("返回创作项目")} title={tUi("返回创作项目")} onClick={closeProject}>
          <ArrowLeft size={17} weight="bold" aria-hidden="true" />
        </button>
        <img src={logoIcon} alt="" draggable="false" />
        <span className="creator-studio-canvas-brand">{tUi("AI创作工作室")}</span>
        <span className="creator-studio-canvas-titlebar-divider" aria-hidden="true" />
        <strong title={activeProject.name}>{activeProject.name}</strong>
        <span className={`creator-studio-canvas-save-state${canvasDirty ? " is-dirty" : ""}`}>
          <CheckCircle size={14} weight="fill" aria-hidden="true" />{canvasDirty ? tUi("未保存") : tUi("已保存")}
        </span>
        </div>
      </> : <div className="creator-studio-shell-brand-area" data-tauri-drag-region>
          <div className="creator-studio-shell-identity" data-tauri-drag-region>
            <img src={logoIcon} alt="" draggable="false" />
            <strong>{tUi("AI创作工作室")}</strong>
          </div>
          <button
            className="creator-studio-sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? tUi("展开侧边栏") : tUi("收起侧边栏")}
            title={sidebarCollapsed ? tUi("展开侧边栏") : tUi("收起侧边栏")}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <DshPanelLeftIcon size={16} />
          </button>
        </div>}
      <div className="creator-studio-shell-drag-space" data-tauri-drag-region />
      {activeProject ? <button
        className={`creator-studio-assistant-titlebar-toggle${assistantOpen ? " is-active" : ""}`}
        type="button"
        aria-pressed={assistantOpen}
        onClick={() => setAssistantOpen((open) => !open)}
      >
        <Sparkle size={15} weight="fill" aria-hidden="true" />{tUi("AI助手")}</button> : null}
      <WindowControls />
    </header>
    <section className={`creator-studio-shell-workspace${sidebarCollapsed && !activeProject ? " is-sidebar-collapsed" : ""}${activeProject ? " is-canvas-mode" : ""}`} aria-label={tUi("AI创作工作室工作区")}>
      {activeProject ? <CreatorStudioCanvas
        project={activeProject}
        assistantOpen={assistantOpen}
        onAssistantOpenChange={setAssistantOpen}
        onAssetLibraryOpenChange={setCanvasAssetsOpen}
        onDirtyChange={setCanvasDirty}
        viewport={canvasViewport}
        onViewportChange={setCanvasViewport}
      /> : <CreatorStudioProjectHome sidebarCollapsed={sidebarCollapsed} characterCatalog={characterCatalog} projectCatalog={projectCatalog} onOpenProject={openProject} />}
    </section>
  </main>;
}
