import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SidebarContent } from '../../src/app/windows/shell/components/SidebarContent.jsx';
import { TitleBar, WindowControls } from '../../src/app/windows/shell/components/TitleBar.jsx';
import { SidePanelMotionFixture } from './side-panel-motion.fixture.jsx';
import { SidebarSectionHeader } from '../../src/ui/ui/SidebarSectionHeader.jsx';
import { MessageNavIcon, PersonNavIcon, PresetNavIcon, CreatorStudioNavIcon, CommunityNavIcon, ModelNavIcon } from '../../src/ui/icons/navIcons.jsx';
import { IconPluginPinwheelOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import '../../src/modules/chat/styles/conversation-list.css';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/shell/styles/titlebar.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/app/windows/shell/styles/sidebar-rail.css';
import '../../src/app/windows/styles/responsive.css';

const query = new URLSearchParams(location.search);
const rightbar = query.has('rightbar');
document.documentElement.lang = 'zh-CN';
document.documentElement.dataset.theme = query.get('theme') || 'light';
document.documentElement.toggleAttribute('data-ds-dark-theme', query.get('theme') === 'dark');
document.body.toggleAttribute('data-ds-dark-theme', query.get('theme') === 'dark');
const railEntries = [
  ['messages', '消息', MessageNavIcon], ['character', '角色列表', PersonNavIcon], ['presets', '预设', PresetNavIcon],
  ['plugins', '插件', IconPluginPinwheelOutlineRegular], ['creatorStudio', '工作室', CreatorStudioNavIcon], ['community', '社区', CommunityNavIcon], ['model', '模型', ModelNavIcon],
];
const navigationItems = railEntries.map(([id, label]) => ({ id, label, productIcon: id !== 'plugins', action: id === 'community' }));
function renderSidebarSlot(name, owner, options) {
  if (name !== 'sidebar.panellist') return undefined;
  const Icon = railEntries.find(([id]) => id === options.only)[2];
  return <Icon size={owner.size} />;
}
function CaptionFixture() {
  const [collapsed, setCollapsed] = useState(query.has('collapsed'));
  const [activeSection, setActiveSection] = useState('messages');
  return <main className="qq-shell main-window-shell" style={{
    '--side-panel-width': collapsed ? '0px' : '328px',
    '--rightbar-track-width': rightbar ? '300px' : '0px',
  }}>
    <SidebarContent desktopMenu collapsed={collapsed} onCollapse={() => setCollapsed(true)}
      activeSection={activeSection} navigationItems={navigationItems} renderSidebarSlot={renderSidebarSlot} renderEntryActions={dismiss => <button onClick={dismiss}>关闭扩展入口</button>}
      onSectionChange={setActiveSection} onNavigationAction={setActiveSection} onOpenSettings={() => setActiveSection('settings')}
      sidePanel={<div className="conversation-list"><SidebarSectionHeader title="会话" value="" onValueChange={() => {}}
        placeholder="搜索会话名称" createLabel="新建对话" onCreate={() => {}} /><div>合成会话列表</div></div>} />
    <section className="main-panel-shell">
      <TitleBar desktopMenu={collapsed} splitSurface showWindowControls={false} sidePanelCollapsed={collapsed} onToggleSidePanel={() => setCollapsed(false)} />
      <div className="main-panel-content"><div style={{padding:16}}>合成主界面</div></div>
    </section>
    <div className="dsh-rightbar-column">{rightbar && <div>合成右侧栏</div>}</div>
    <div className="rightbar-resizer" />
    <div className="main-window-controls"><WindowControls /></div>
  </main>;
}
createRoot(document.querySelector('#root')).render(
  query.has('motion') ? <SidePanelMotionFixture /> : <CaptionFixture />,
);
