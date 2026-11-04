import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, IconAgentPresetOutlineRegular, IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { TrajectoryView, trajectoryZh } from 'official-trajectory-fixture';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileCreatorStudioPage } from '../../src/mobile/MobileCreatorStudioPage.jsx';
import { MobileConversationPage } from '../../src/mobile/MobileConversationPage.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/modules/chat/styles/chat-panel.css';
import '../../src/modules/chat/styles/trajectory.css';
import '../../src/mobile/mobile.css';

const sessionId = 'synthetic-studio-session', listeners = new Set();
let store = { view: 'chat', viewRequest: null };
const readStore = () => store, subscribeStore = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const openView = (view, focus) => { store = { view, viewRequest: { view, focus } }; listeners.forEach(listener => listener()); };
const completeViewRequest = () => { store = { ...store, viewRequest: null }; listeners.forEach(listener => listener()); };
const session = { running: false, blank: false, openState: 'open', loadingOlder: false, hasMore: false };
const inspection = { eventNodes: [], eventLocations: new Map(), requests: [], callSchemas: new Map(), partial: null, runningCalls: [] };
const translate = (key, values = {}) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), trajectoryZh[key] ?? key);
const trajectoryProps = { useSession: select => select(session), useTrajectory: select => select(inspection), useDuration: select => select(false),
  loadOlder: async () => false, loadImage: async () => '', setActualDuration() {}, renderSlot: () => null, t: translate };
const modelSnapshot = { configs: [] }, characterSnapshot = { collection: { items: [], groups: [] } };
const studioSnapshot = { status: 'ready', active: { sessionId, characterId: '', presetId: 'synthetic-preset' }, reference: {}, items: [], error: '' };
const model = { subscribe: () => () => {}, getSnapshot: () => studioSnapshot, restoreRecent: async () => studioSnapshot.active, release() {},
  readDefaultModel: async () => null, refresh: async () => {}, create: async () => {} };
const drawerSnapshot = { shown: false };
const view = { navigation: { sidebar: { subscribe: () => () => {}, getSnapshot: () => drawerSnapshot }, closeSidebar() {} }, openWorkspaceDrawer() {}, creatorStudio: { sessions: model }, models: { subscribe: () => () => {}, getSnapshot: () => modelSnapshot },
  characters: { subscribe: () => () => {}, getSnapshot: () => characterSnapshot }, registerBackHandler: () => () => {}, goBack() {},
  renderCreatorStudioConversation: ({ component: Component, props }) => <Component {...props} sessionId={sessionId}
    useSession={select => select(session)} useInput={select => select({})} useSessionStatus={select => select(new Map())}
    useProjection={() => null} useInspectCall={select => select({})} useStore={select => select(useSyncExternalStore(subscribeStore, readStore))}
    useConversationViews={select => select([{ id: 'chat', label: '对话' }, { id: 'trajectory', label: '轨迹' }])}
    useEntryPins={select => select([])} useEntryActions={select => select(true)} setPinned={() => {}}
    selectView={id => openView(id)} renderHeaderSlot={name => name.endsWith('.corner')
      ? <span data-slot={name}><Button size="sm" data-sidebar-right-expand="" aria-label="打开右侧边栏"><IconPanelLeftOutlineRegular size={18} style={{ transform: 'rotate(180deg)' }} /></Button></span>
      : name.endsWith('.views.actions') ? <><button role="menuitem">浏览更多插件</button><button role="menuitem">创建你的插件</button></>
      : name.endsWith('.actions') ? <span data-slot={name}><Button size="sm"><IconAgentPresetOutlineRegular size={14} /><span>默认创作预设</span></Button></span>
      : name.endsWith('.utilities') ? <Button size="sm" aria-label="下载 Session 日志">日志</Button> : null}
    openView={openView} actions={{ completeViewRequest }} renderSlotChain={(_name, _owner, options) => options.fallback}
    renderSlot={(name, owner, options) => name === 'eleckoi.creator-studio.view' ? <div data-slot={name} data-view={options.only}>
      {options.only === 'trajectory' ? <TrajectoryView {...trajectoryProps} viewRequest={owner.viewRequest} completeViewRequest={owner.completeViewRequest} />
        : <p>合成对话正文</p>}</div> : name === 'eleckoi.creator-studio.composer.bar' ? <div style={{ height: 120 }}><textarea data-composer-input="" aria-label="合成输入" defaultValue="合成草稿" /></div> : null} />,
};
function Fixture() {
  return <>
    <aside style={{ position: 'absolute', left: -10000, width: '100%', height: 68, visibility: 'hidden' }}><MobileConversationPage><section className="chat-panel"><header className="chat-header" data-roleplay-header="">
      <div className="chat-header-title-row"><h1>合成角色</h1></div><div className="chat-header-tabs"><button>对话</button><button>轨迹</button></div>
    </header></section></MobileConversationPage></aside>
    <MainPageContext.Provider value={view}><main className="mobile-shell"><MobileCreatorStudioPage /></main></MainPageContext.Provider>
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
