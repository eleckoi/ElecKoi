import { SidebarRail } from './SidebarRail.jsx';
import { SidePanelShell } from './SidePanelShell.jsx';

export function SidebarContent({ expanded = false, collapsed, onCollapse, sidePanel, hasFooterActions, renderSidebarSlot, desktopMenu = false, ...railProps }) {
  const footerActions = hasFooterActions ? renderSidebarSlot?.('sidebar.footer.action', { wide: true }) : null;
  const rail = <SidebarRail {...railProps} expanded={expanded} onCollapse={onCollapse}
    renderSidebarSlot={renderSidebarSlot} footerActions={expanded ? footerActions : null} />;
  if (expanded) return rail;
  return <>
    <section className="navigation-rail-shell" aria-label="功能导航栏">
      <div className="navigation-rail-title" data-tauri-drag-region />
      {rail}
    </section>
    <SidePanelShell collapsed={collapsed} onCollapse={onCollapse} renderSidebarSlot={renderSidebarSlot} footerActions={footerActions} desktopMenu={desktopMenu}>
      {renderSidebarSlot?.('sidebar.workspaces', { wide: true, content: sidePanel }) || sidePanel}
    </SidePanelShell>
  </>;
}
