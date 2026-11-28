import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as jsx from 'react/jsx-runtime';
import * as store from '@deepseek-ai/dsh-client-store';
import * as slots from '@deepseek-ai/dsh-client-ui-slots';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip, IconSlidersTwoOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives';
import { OfficialFrameSidebar } from '../../src/app/windows/shell/components/OfficialFrameSidebar.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { TitleBar } from '../../src/app/windows/shell/components/TitleBar.jsx';
import { ElecKoiWordmark } from '../../src/ui/icons/ElecKoiWordmark.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/app/windows/shell/styles/sidebar-rail.css';
import '../../src/app/windows/shell/styles/titlebar.css';

let SidebarRoot, dictionary;
const noop = () => {};
const runContribution = run => {
  const effect = run();
  if (effect?.[Symbol.iterator]) for (const _dispose of effect) { /* retained until this isolated page is destroyed */ }
  return noop;
};
window.__ModuleLoader__ = { load: ({ factory }) => {
const { apply } = factory(name => ({ react: React, 'react/jsx-runtime': jsx,
  '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-slots': slots, '@deepseek-ai/dsh-client-ui-primitives': primitives })[name]);
apply({ get: () => ({ startSession: noop }), effect: runContribution,
  locale: { register: (_name, dictionaries) => { dictionary = dictionaries.zh; return noop; }, subscribe: () => noop },
  slots: { entriesOfSlot: () => [], subscribe: () => noop, inject: (_name, run) => runContribution(run), registerFactory: () => noop,
    register: (options, Component) => { if (options.name === 'sidebar') SidebarRoot = Component; return noop; } },
});
} };
function Workspaces() {
  return <div style={{ paddingTop: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>工作区</span>
      <Tooltip label="视图选项" side="bottom" delayMs={500}>
        <button aria-label="视图选项" style={{ display: 'grid', placeItems: 'center', width: 28, height: 28 }}><IconSlidersTwoOutlineRegular /></button>
      </Tooltip>
    </div>
    <div style={{ padding: '16px 8px' }}>合成工作区</div>
  </div>;
}
function Fixture() {
  const [collapsed, setCollapsed] = useState(false);
  const [unpinned, setUnpinned] = useState([]);
  const [activeSection, setActiveSection] = useState('creatorStudio');
  const [railTarget, setRailTarget] = useState(null);
  const panels = [{ id: 'schedules', label: '自动化任务' }, { id: 'synthetic-plugin', label: '合成插件' }];
  const setPinned = (id, pinned) => setUnpinned(rows => pinned ? rows.filter(row => row !== id) : [...rows, id]);
  const t = (key, values) => (dictionary[key] || key).replace(/\{(\w+)\}/g, (token, field) => values?.[field] ?? token);
  const workspaceSidebar = <SidebarRoot collapsed={collapsed} width={280} startSession={noop} toggleSidebar={() => setCollapsed(value => !value)}
    selectPanel={setActiveSection} setPinned={setPinned} trackEntryClick={noop} usePanels={select => select(panels)} useEntryPins={select => select(unpinned)}
    fixedPanelIds={['schedules']} renderFactorySlot={() => <IconSlidersTwoOutlineRegular />}
    useRemoteAccess={() => true} useEntryActions={select => select(true)} useShortcuts={select => select([])} usePanelInfo={select => select({ activePanelId: null })} t={t}
    renderSlot={(name, owner, options) => {
      if (name === 'sidebar.brand.name') return <ElecKoiWordmark />;
      if (name === 'sidebar.workspaces') return <Workspaces />;
      if (name === 'sidebar.footer.action') return <div className="workspace-plugin-footer">
        <div data-synthetic-footer="" data-wide={String(owner.wide)} style={{ minWidth: 248, minHeight: 480 }}>合成宽栏插件</div>
      </div>;
      if (name === 'sidebar.panellist.actions') return owner.entries.filter(entry => !entry.pinned).map(entry =>
        <MenuItemButton key={entry.id} onSelect={() => { owner.onPinnedChange(entry.id, true); owner.onDismiss(); }}>固定{entry.label}</MenuItemButton>);
      return options?.fallback;
    }} />;
  const view = { chat: { activeSection }, railTarget, railProps: { activeSection, navigationItems: [
    { id: 'creatorStudio', label: '创作工作区', productIcon: true },
    { id: 'presets', label: '预设', productIcon: true },
    { id: 'plugins', label: '插件' },
  ], onSectionChange: setActiveSection }, navigation: { productPanelIds: ['creatorStudio', 'presets'],
    hasSidebarFooterActions: true, hasSidebarEntryActions: true, reportSidebar: noop, closeSidebar: () => setCollapsed(true) } };
  return <main className={`qq-shell main-window-shell${collapsed ? ' side-panel-collapsed' : ''}`} style={{ '--side-panel-width': collapsed ? '0px' : '280px', '--rightbar-track-width': '0px' }}>
    <section className="navigation-rail-shell"><div className="navigation-rail-title" /><div ref={setRailTarget} className="official-navigation-rail-target" /></section>
    <MainPageContext.Provider value={view}><OfficialFrameSidebar collapsed={collapsed} width={280}
      workspaceSidebar={workspaceSidebar} renderSidebarSlot={(name, owner) => {
        if (name === 'sidebar.footer.action') return <div data-synthetic-footer="" style={{ minWidth: 248 }}>意外重复的插件</div>;
        if (name === 'sidebar.panellist') return <IconSlidersTwoOutlineRegular />;
        return owner.content;
      }} /></MainPageContext.Provider>
    <section className="main-panel-shell"><TitleBar splitSurface sidePanelCollapsed={collapsed} onToggleSidePanel={() => setCollapsed(false)} showWindowControls={false} />
      <div className="main-panel-content" style={{ background: 'var(--chat)' }}>合成主区域</div>
    </section>
  </main>;
}
import('@deepseek-ai/dsh-client-ui-sidebar/client').then(() => createRoot(document.querySelector('#root')).render(<Fixture />));
