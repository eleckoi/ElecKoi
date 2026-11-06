import { useProductTranslation } from "../../../i18n/ProductLocaleContext.jsx";
import { useLayoutEffect, useState } from 'react';
import { SidebarRail } from './SidebarRail.jsx';
import { SidePanelShell } from './SidePanelShell.jsx';

function WorkspaceSidebarSurface({ collapsed, children }) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const hadTitlebar = root.hasAttribute('data-windows-titlebar');
    root.setAttribute('data-windows-titlebar', '');
    setReady(true);
    return () => { if (!hadTitlebar) root.removeAttribute('data-windows-titlebar'); };
  }, []);
  return <div className="native-workspace-sidebar">
    <header className="native-workspace-caption" data-tauri-drag-region>
      {!collapsed ? <span className="desktop-menu-seat" data-desktop-menu-seat /> : null}
    </header>
    <div className="native-workspace-body">{ready ? children : null}</div>
  </div>;
}

export function SidebarContent({ expanded = false, collapsed, onCollapse, sidePanel, workspaceSidebar, workspaceCollapsed = false, hasFooterActions, renderSidebarSlot, desktopMenu = false, ...railProps }) {
  const tUi = useProductTranslation();
  const footerActions = hasFooterActions ? renderSidebarSlot?.('sidebar.footer.action', { wide: true }) : null;
  const rail = <SidebarRail {...railProps} expanded={expanded} onCollapse={onCollapse}
    renderSidebarSlot={renderSidebarSlot} footerActions={expanded ? footerActions : null} />;
  if (expanded) return rail;
  return <>
    <section className="navigation-rail-shell" aria-label={tUi("功能导航栏")}>
      <div className="navigation-rail-title" data-tauri-drag-region />
      {rail}
    </section>
    {workspaceSidebar ? <WorkspaceSidebarSurface collapsed={workspaceCollapsed}>{workspaceSidebar}</WorkspaceSidebarSurface> : <SidePanelShell collapsed={collapsed} onCollapse={onCollapse} renderSidebarSlot={renderSidebarSlot} footerActions={footerActions} desktopMenu={desktopMenu}>
      {renderSidebarSlot?.('sidebar.workspaces', { wide: true, content: sidePanel }) || sidePanel}
    </SidePanelShell>}
  </>;
}
