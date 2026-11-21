import { useProductTranslation } from "../../../i18n/ProductLocaleContext.jsx";
import React from "react";
import { DshPanelLeftIcon } from "../../../../ui/icons/dshComposerIcons.jsx";
import { ElecKoiWordmark } from "../../../../ui/icons/ElecKoiWordmark.jsx";

function stopDrag(event) {
  event.stopPropagation();
}

export function SidePanelShell({ collapsed = false, contentWidth, onCollapse, footerActions, showFooter = true, renderSidebarSlot, desktopMenu = false, children }) {
  const tUi = useProductTranslation();
  const hasFooter = showFooter && (footerActions || renderSidebarSlot);
  return (
    <section
      className={`side-panel-shell${collapsed ? " collapsed" : ""}${hasFooter ? " has-footer-actions" : ""}`}
      style={contentWidth === undefined ? undefined : { '--side-panel-content-width': `${contentWidth}px` }}
      aria-label={tUi("侧边栏")}
      aria-hidden={collapsed || undefined}
      inert={collapsed || undefined}
    >
      <header className="side-panel-header" data-tauri-drag-region>
        <button
          className="side-panel-collapse-button"
          type="button"
          aria-label={tUi("收起侧边栏")}
          title={tUi("收起侧边栏")}
          aria-expanded="true"
          onPointerDown={stopDrag}
          onClick={onCollapse}
        >
          <DshPanelLeftIcon size={16} />
        </button>
        {desktopMenu && !collapsed ? <span className="desktop-menu-seat" data-desktop-menu-seat /> : null}
      </header>
      <div className="side-panel-brand">
        {renderSidebarSlot?.("sidebar.brand.name", { content: <ElecKoiWordmark /> }) || <ElecKoiWordmark />}
      </div>
      <div className="side-panel-content">{children}</div>
      {hasFooter ? <div className={`side-panel-footer-actions${footerActions ? "" : " is-update-only"}`} aria-label={tUi("侧边栏插件操作")}>
        {footerActions}
        <SidebarUpdateSeat renderSidebarSlot={renderSidebarSlot} />
      </div> : null}
    </section>
  );
}

export function SidebarUpdateSeat({ renderSidebarSlot }) {
  return <div className="sidebar-update-seat">{renderSidebarSlot?.('sidebar.update', {})}</div>;
}
