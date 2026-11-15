
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppFrame } from '@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.tsx';
import { createLayoutStore } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts';
import { SidePanelShell } from '../../src/app/windows/shell/components/SidePanelShell.jsx';
import { TitleBar, WindowControls } from '../../src/app/windows/shell/components/TitleBar.jsx';
const store = createLayoutStore().create();
const useStore = select => select(useSyncExternalStore(store.subscribe, store.getSnapshot));
const usePanelInfo = select => select(useStore(s => s.panelInfo));
const useSessions = select => select({ byId: {} });
const useFoldedLandscape = select => select(false);
const toggle = () => store.actions.toggleSidebar();
function Sidebar({ collapsed, width }) {
  const expandedWidth = useRef(width);
  if (!collapsed) expandedWidth.current = width;
  return <SidePanelShell collapsed={collapsed} contentWidth={expandedWidth.current} onCollapse={toggle}><input aria-label="保留搜索" /></SidePanelShell>;
}
function Panel() {
  const collapsed = useStore(s => s.layoutInfo.sidebar === 0 || s.layoutInfo.viewportWidth < 1024 && !s.layoutInfo.narrowExpanded);
  return <section className="main-panel-shell"><TitleBar splitSurface showWindowControls={false} sidePanelCollapsed={collapsed} onToggleSidePanel={toggle} /><div className="main-panel-content" /></section>;
}
const renderSlot = (name, owner) => name === 'sidebar' ? <Sidebar {...owner} /> : name === 'main' ? <Panel /> : null;
/** Actual installed native geometry, drag handles, transitions and store actions. */
export function SidePanelMotionFixture() {
  useEffect(() => {
    document.documentElement.setAttribute('data-windows-titlebar', '');
    window.captionMotion = {
      setRightbarTrack: value => { if (value) { store.actions.setRightbar(300); store.actions.openRightbar(true, false); } else store.actions.closeRightbar(); },
      setInstant: value => { if (value) store.actions.openRightbar(true, true); },
    };
    return () => { delete window.captionMotion; document.documentElement.removeAttribute('data-windows-titlebar'); };
  }, []);
  return <main className="qq-shell main-window-shell official-frame-window" style={{ '--rail-column-width': '51px', '--dsh-windows-titlebar-height': '0px', '--ds-transition-duration-slow': '.3s', '--ds-ease-in-out': 'cubic-bezier(.4, 0, .2, 1)' }}>
    <div className="official-product-rail" />
    <div className="official-native-frame"><AppFrame useStore={useStore} usePanelInfo={usePanelInfo} useSessions={useSessions} useFoldedLandscape={useFoldedLandscape}
      actions={store.actions} renderSlot={renderSlot} t={key => key} /></div>
    <div className="main-window-controls"><WindowControls /></div>
  </main>;
}
