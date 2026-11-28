import { cloneElement, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMainPageView } from '../../MainPageContext.jsx';
import { SidePanelShell } from './SidePanelShell.jsx';
import { WorkspaceSidebarSurface } from './SidebarContent.jsx';
import { SidebarRail } from './SidebarRail.jsx';

/** Product sidebar content within the actual DSH frame's resolved column. */
export function OfficialFrameSidebar({ collapsed, width, drawer, renderSidebarSlot, workspaceSidebar }) {
  const view = useMainPageView();
  const expandedWidth = useRef(width);
  const entryActionsTrigger = useRef(null);
  if (!collapsed) expandedWidth.current = width;
  useLayoutEffect(() => {
    view.navigation.reportSidebar({ shown: !collapsed, width, drawer });
  }, [view.navigation, collapsed, width, drawer]);
  if (view.renderFrameSidebar) return view.renderFrameSidebar(renderSidebarSlot, workspaceSidebar, { collapsed, width, drawer });
  const { activeSection } = view.chat;
  const workspace = ['conversation', 'creatorStudio', 'schedules'].includes(activeSection)
    || !view.navigation.productPanelIds.includes(activeSection) && activeSection !== 'plugins';
  const showFooter = activeSection !== 'character';
  const footerActions = showFooter && view.navigation.hasSidebarFooterActions
    ? renderSidebarSlot('sidebar.footer.action', { wide: true }) : null;
  return <>
    {view.railTarget && createPortal(<SidebarRail {...view.railProps} renderSidebarSlot={renderSidebarSlot}
      entryActionsTriggerRef={entryActionsTrigger}
      renderEntryActions={view.navigation.hasSidebarEntryActions
        ? onDismiss => view.navigation.renderSidebarEntryActions(renderSidebarSlot, onDismiss) : undefined}
      footerActions={footerActions} />, view.railTarget)}
    {workspace ? <WorkspaceSidebarSurface collapsed={collapsed} renderSidebarSlot={renderSidebarSlot}>
      {/* RETIRE WHEN: DSH exposes the external More launcher as a public option. */}
      {workspaceSidebar && cloneElement(workspaceSidebar, { getPanelMoreTrigger: () => entryActionsTrigger.current })}
    </WorkspaceSidebarSurface>
      : <SidePanelShell collapsed={collapsed} contentWidth={expandedWidth.current} onCollapse={view.navigation.closeSidebar}
          renderSidebarSlot={renderSidebarSlot} footerActions={footerActions} showFooter={showFooter} desktopMenu>
        <div ref={view.setSidebarTarget} className="official-product-sidebar-target" />
      </SidePanelShell>}
  </>;
}
