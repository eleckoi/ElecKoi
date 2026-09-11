import { DshPanelLeftIcon } from "../../../../ui/icons/dshComposerIcons.jsx";

function stopDrag(event) {
  event.stopPropagation();
}

export function SidePanelShell({ collapsed = false, onCollapse, children }) {
  return (
    <section
      className={`side-panel-shell${collapsed ? " collapsed" : ""}`}
      aria-label="侧边栏"
      aria-hidden={collapsed || undefined}
      inert={collapsed ? "" : undefined}
    >
      <header className="side-panel-header" data-tauri-drag-region>
        <div className="side-panel-brand">
          <strong>ElecKoi</strong>
        </div>
        <button
          className="side-panel-collapse-button"
          type="button"
          aria-label="收起侧边栏"
          title="收起侧边栏"
          onPointerDown={stopDrag}
          onClick={onCollapse}
        >
          <DshPanelLeftIcon size={16} />
        </button>
      </header>
      <div className="side-panel-content">{children}</div>
    </section>
  );
}
