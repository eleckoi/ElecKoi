import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMainPageView } from '../../MainPageContext.jsx';
import { SidePanelShell } from './SidePanelShell.jsx';
import { WorkspaceSidebarSurface } from './SidebarContent.jsx';
import { SidebarRail } from './SidebarRail.jsx';

/** Product sidebar content within the actual DSH frame's resolved column. */
export function OfficialFrameSidebar({ collapsed, width, drawer, renderSidebarSlot, workspaceSidebar }) {
  const view = useMainPageView();
  const expandedWidth = useRef(width);
  if (!collapsed) expandedWidth.current = width;
  useLayoutEffect(() => {
    view.navigation.reportSidebar({ shown: !collapsed, width, drawer });
  }, [view.navigation, collapsed, width, drawer]);
  if (view.renderFrameSidebar) return view.renderFrameSidebar(renderSidebarSlot, workspaceSidebar, { collapsed, width, drawer });
  const workspace = ['conversation', 'creatorStudio', 'schedules'].includes(view.chat.activeSection)
    || !view.navigation.productPanelIds.includes(view.chat.activeSection) && view.chat.activeSection !== 'plugins';
  return <>
    {view.railTarget && createPortal(<SidebarRail {...view.railProps} renderSidebarSlot={renderSidebarSlot}
      renderEntryActions={view.navigation.hasSidebarEntryActions
        ? onDismiss => view.navigation.renderSidebarEntryActions(renderSidebarSlot, onDismiss) : undefined}
      footerActions={view.navigation.hasSidebarFooterActions ? renderSidebarSlot('sidebar.footer.action', { wide: true }) : null} />, view.railTarget)}
    {workspace ? <WorkspaceSidebarSurface collapsed={collapsed} renderSidebarSlot={renderSidebarSlot}>{workspaceSidebar}</WorkspaceSidebarSurface>
      : <SidePanelShell collapsed={collapsed} contentWidth={expandedWidth.current} onCollapse={view.navigation.closeSidebar} renderSidebarSlot={renderSidebarSlot}
    footerActions={view.navigation.hasSidebarFooterActions ? renderSidebarSlot('sidebar.footer.action', { wide: true }) : null} desktopMenu>
    <div ref={view.setSidebarTarget} className="official-product-sidebar-target" />
    </SidePanelShell>}
  </>;
}
