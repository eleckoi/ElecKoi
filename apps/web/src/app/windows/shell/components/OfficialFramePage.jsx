import { createPortal } from 'react-dom';
import { useMainPageView } from '../../MainPageContext.jsx';
import { PluginCenterSurface, PluginListPanel } from './PluginCenter.jsx';
import { TitleBar } from './TitleBar.jsx';

/** Only product presentation; DSH AppFrame owns the columns and their lifecycle. */
export function OfficialFramePage({ sidePanel, mainPanel, overlays, panelId }) {
  const view = useMainPageView();
  if (view.renderFramePage) return view.renderFramePage({ mainPanel, overlays, panelId });
  const plugins = panelId === 'plugins';
  return <>
    {view.sidebarTarget && createPortal(plugins ? <PluginListPanel onNotify={view.chat.notify} /> : sidePanel, view.sidebarTarget)}
    <section className="main-panel-shell" aria-label={view.tUi('主功能界面')}>
      <TitleBar splitSurface desktopMenu={!view.sidebar.shown} showWindowControls={false}
        sidePanelCollapsed={!view.sidebar.shown} onToggleSidePanel={view.navigation.toggleSidebar} />
      <div className="main-panel-content">{plugins ? <PluginCenterSurface>{mainPanel}</PluginCenterSurface> : mainPanel}</div>
    </section>
    {overlays}
  </>;
}
