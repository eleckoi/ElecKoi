import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as jsx from 'react/jsx-runtime';
import * as store from '@deepseek-ai/dsh-client-store';
import * as slots from '@deepseek-ai/dsh-client-ui-slots';
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip, IconSlidersTwoOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { SidebarContent } from '../../src/app/windows/shell/components/SidebarContent.jsx';
import { TitleBar } from '../../src/app/windows/shell/components/TitleBar.jsx';
import { ElecKoiWordmark } from '../../src/ui/icons/ElecKoiWordmark.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/app/windows/shell/styles/titlebar.css';

let SidebarRoot, dictionary;
const noop = () => {};
window.__ModuleLoader__ = { load: ({ factory }) => {
const { apply } = factory(name => ({ react: React, 'react/jsx-runtime': jsx,
  '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-slots': slots, '@deepseek-ai/dsh-client-ui-primitives': primitives })[name]);
apply({ get: () => ({ startSession: noop }), effect: run => run(),
  locale: { register: (_name, dictionaries) => { dictionary = dictionaries.zh; return noop; }, subscribe: () => noop },
  slots: { entriesOfSlot: () => [], subscribe: () => noop, inject: (_name, run) => run(),
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
  const t = key => dictionary[key] || key;
  const workspaceSidebar = <SidebarRoot collapsed={collapsed} width={280} startSession={noop} toggleSidebar={() => setCollapsed(value => !value)}
    selectPanel={noop} setPinned={noop} trackEntryClick={noop} usePanels={select => select([])} useEntryPins={select => select([])}
    useEntryActions={select => select(false)} useShortcuts={select => select([])} usePanelInfo={select => select({ activePanelId: null })} t={t}
    renderSlot={(name, _owner, options) => name === 'sidebar.brand.mark' ? null : name === 'sidebar.brand.name' ? <ElecKoiWordmark /> : name === 'sidebar.workspaces' ? <Workspaces /> : options?.fallback} />;
  return <main className={`qq-shell main-window-shell${collapsed ? ' side-panel-collapsed' : ''}`} style={{ '--side-panel-width': collapsed ? '0px' : '280px', '--rightbar-track-width': '0px' }}>
    <SidebarContent navigationItems={[]} workspaceSidebar={workspaceSidebar} workspaceCollapsed={collapsed} />
    <section className="main-panel-shell"><TitleBar splitSurface sidePanelCollapsed={collapsed} onToggleSidePanel={() => setCollapsed(false)} showWindowControls={false} />
      <div className="main-panel-content" style={{ background: 'var(--chat)' }}>合成主区域</div>
    </section>
  </main>;
}
import('@deepseek-ai/dsh-client-ui-sidebar/client').then(() => createRoot(document.querySelector('#root')).render(<Fixture />));
