import React from "react";
import { DshPanelLeftIcon } from "../../../../ui/icons/dshComposerIcons.jsx";
import { ElecKoiWordmark } from "../../../../ui/icons/ElecKoiWordmark.jsx";

function stopDrag(event) {
  event.stopPropagation();
}

export function SidePanelShell({ collapsed = false, onCollapse, footerActions, renderSidebarSlot, desktopMenu = false, children }) {
  return (
    <section
      className={`side-panel-shell${collapsed ? " collapsed" : ""}${footerActions ? " has-footer-actions" : ""}`}
      aria-label="侧边栏"
      aria-hidden={collapsed || undefined}
      inert={collapsed || undefined}
    >
      <header className="side-panel-header" data-tauri-drag-region>
        <button
          className="side-panel-collapse-button"
          type="button"
          aria-label="收起侧边栏"
          title="收起侧边栏"
          aria-expanded="true"
          onPointerDown={stopDrag}
          onClick={onCollapse}
        >
          <DshPanelLeftIcon size={16} />
        </button>
        {desktopMenu && !collapsed ? <span className="desktop-menu-seat" data-desktop-menu-seat /> : null}
      </header>
      <div className="side-panel-brand" data-tauri-drag-region>
        {renderSidebarSlot?.("sidebar.brand.name", { content: <ElecKoiWordmark /> }) || <ElecKoiWordmark />}
      </div>
      <div className="side-panel-content">{children}</div>
      {footerActions ? <div className="side-panel-footer-actions" aria-label="侧边栏插件操作">{footerActions}</div> : null}
    </section>
  );
}
