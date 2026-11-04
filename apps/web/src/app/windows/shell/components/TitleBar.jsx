import logoIcon from "../../../../assets/eleckoi-app-icon.png";
import { DshPanelLeftIcon } from "../../../../ui/icons/dshComposerIcons.jsx";
import { ElecKoiWordmark } from "../../../../ui/icons/ElecKoiWordmark.jsx";
import { appWindow } from "../../../services/windowControls.js";

function stopDrag(event) {
  event.stopPropagation();
}

export function WindowControls({ onClose }) {
  if (globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === "android") return null;
  if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-native-window-controls")) return null;
  return (
    <div className="window-controls">
      <button className="window-control-button minimize" type="button" title="最小化" onPointerDown={stopDrag} onClick={() => appWindow.minimize()}>
        <span />
      </button>
      <button className="window-control-button maximize" type="button" title="最大化" onPointerDown={stopDrag} onClick={() => appWindow.maximizeToggle()}>
        <span />
      </button>
      <button
        className="window-control-button close"
        type="button"
        title="关闭"
        onPointerDown={stopDrag}
        onClick={() => {
          if (onClose) onClose();
          else appWindow.close();
        }}
      >
        <span />
      </button>
    </div>
  );
}

export function TitleBar({
  title = "ElecKoi",
  projectTitle = "",
  splitSurface = false,
  showWindowControls = true,
  sidePanelCollapsed = false,
  onToggleSidePanel,
  onClose,
  desktopMenu = false,
}) {
  const sidePanelToggle = sidePanelCollapsed && onToggleSidePanel ? <button
    className="side-panel-expand-button"
    type="button"
    aria-label="展开侧边栏"
    title="展开侧边栏"
    aria-expanded="false"
    onPointerDown={stopDrag}
    onClick={onToggleSidePanel}
  ><DshPanelLeftIcon size={16} /></button> : null;
  if (splitSurface) {
    return (
      <header className="client-titlebar split-surface" data-tauri-drag-region>
        {desktopMenu || (sidePanelCollapsed && onToggleSidePanel) ? <div className={desktopMenu ? 'title-caption-actions' : undefined}>
          {sidePanelToggle}
          {desktopMenu ? <span className="desktop-menu-seat" data-desktop-menu-seat /> : null}
        </div> : null}
        <div className="title-spacer" data-tauri-drag-region>
          {projectTitle ? (
            <div className="title-project-tab">
              <span>{projectTitle}</span>
              <i />
            </div>
          ) : null}
        </div>
        {showWindowControls ? <WindowControls onClose={onClose} /> : null}
      </header>
    );
  }

  return (
    <header className="client-titlebar">
      <div className="title-brand" data-tauri-drag-region>
        <img src={logoIcon} alt="" className="title-brand-logo" draggable="false" />
        {title === "ElecKoi" ? <ElecKoiWordmark /> : <strong>{title}</strong>}
      </div>
      <div className="title-spacer" data-tauri-drag-region>
        {projectTitle ? (
          <div className="title-project-tab">
            <span>{projectTitle}</span>
            <i />
          </div>
        ) : null}
      </div>

      {showWindowControls ? <WindowControls onClose={onClose} /> : null}
    </header>
  );
}
