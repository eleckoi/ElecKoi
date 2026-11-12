import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, ICON_SYMBOLS, IconAgentPresetOutlineRegular, IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { TrajectoryView, trajectoryZh } from 'official-trajectory-fixture';
import { InputBar, DraftEditorRuntime, registerPlainText, conversationZh } from 'official-studio-composer-fixture';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileCreatorStudioPage } from '../../src/mobile/MobileCreatorStudioPage.jsx';
import { MobileConversationPage } from '../../src/mobile/MobileConversationPage.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/modules/chat/styles/chat-panel.css';
import '../../src/modules/chat/styles/trajectory.css';
import '../../src/mobile/mobile.css';

const svgNamespace = 'http://www.w3.org/2000/svg', sprite = document.createElementNS(svgNamespace, 'svg');
sprite.setAttribute('aria-hidden', 'true'); sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
for (const [id, markup] of Object.entries(ICON_SYMBOLS)) {
  const artwork = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const symbol = document.createElementNS(svgNamespace, 'symbol');
  for (const { name, value } of artwork.attributes) if (!['width', 'height', 'xmlns', 'class', 'aria-hidden'].includes(name)) symbol.setAttribute(name, value);
  symbol.id = id; symbol.append(...[...artwork.childNodes].map(node => document.importNode(node, true))); sprite.append(symbol);
}
document.body.prepend(sprite);

const sessionId = 'synthetic-studio-session', listeners = new Set();
let store = { view: 'chat', viewRequest: null };
const readStore = () => store, subscribeStore = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const openView = (view, focus) => { store = { view, viewRequest: { view, focus } }; listeners.forEach(listener => listener()); };
const completeViewRequest = () => { store = { ...store, viewRequest: null }; listeners.forEach(listener => listener()); };
let session = { running: false, blank: false, openState: 'open', loadingOlder: false, hasMore: false };
const runtime = new DraftEditorRuntime(); registerPlainText(runtime.editor); runtime.setDraft('合成草稿');
const keyboard = { editor: runtime.editor, arbitrate: () => 'pass', space: () => false, dismissPopup() {}, bindFilePicker: () => () => {}, submit() {}, steerQueue() {} };
const hook = value => select => select(value);
function NativeComposer(owner) {
  return <InputBar {...owner} useSession={select => select(session)} useInput={hook({ phase: 'plain', draft: '合成草稿', attachmentIds: [], queue: [] })}
    useAccess={() => true} useNotices={hook(null)} useBusyEnter={hook('queue')} useStopShortcut={hook([])} useMenuLauncher={hook(null)} useFileUploads={hook({})} useLexicon={hook([])} useProjection={() => undefined}
    inputActions={{}} keyboard={keyboard} sessionId={sessionId} t={(key, values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), conversationZh[key] ?? key)}
    renderSlot={name => name === 'conversation.composer.dock' ? <span data-synthetic-stats="">合成统计</span> : null} />;
}
const inspection = { eventNodes: [], eventLocations: new Map(), requests: [], callSchemas: new Map(), partial: null, runningCalls: [] };
const translate = (key, values = {}) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), trajectoryZh[key] ?? key);
const trajectoryProps = { useSession: select => select(session), useTrajectory: select => select(inspection), useDuration: select => select(false),
  loadOlder: async () => false, loadImage: async () => '', setActualDuration() {}, renderSlot: () => null, t: translate };
const modelSnapshot = { configs: [] }, characterSnapshot = { collection: { items: [], groups: [] } };
let studioSnapshot = { status: 'ready', active: { sessionId, characterId: '', presetId: 'synthetic-preset' }, reference: {}, items: [], error: '' };
window.mobileStudioFixture = { setPhase(blank, editing = false) { session = { ...session, blank }; studioSnapshot = { ...studioSnapshot, editingSessionId: editing ? sessionId : null }; store = { ...store }; listeners.forEach(listener => listener()); } };
const model = { subscribe: subscribeStore, getSnapshot: () => studioSnapshot, restoreRecent: async () => studioSnapshot.active, release() {},
  readDefaultModel: async () => null, refresh: async () => {}, create: async () => {} };
const drawerSnapshot = { shown: false };
const presetSnapshot = { catalog: { activePresetIds: { creator: 'synthetic-preset' }, presets: [{ id: 'synthetic-preset', name: '合成创作预设', purpose: 'creator', profile: { authorName: '', authorAvatarPath: '' } }] } };
const view = { presets: { subscribe: () => () => {}, getSnapshot: () => presetSnapshot, setActive: async () => {} }, navigation: { sidebar: { subscribe: () => () => {}, getSnapshot: () => drawerSnapshot }, closeSidebar() {} }, openWorkspaceDrawer() {}, creatorStudio: { sessions: model }, models: { subscribe: () => () => {}, getSnapshot: () => modelSnapshot },
  characters: { subscribe: () => () => {}, getSnapshot: () => characterSnapshot }, registerBackHandler: () => () => {}, goBack() {},
  renderCreatorStudioConversation: ({ component: Component, props }) => <Component {...props} sessionId={sessionId}
    useSession={select => select(session)} useInput={select => select({})} useSessionStatus={select => select(new Map())}
    useWorkspaces={hook({ phase: 'ready', items: [{ workspaceId: 'synthetic-workspace', title: '合成工作区', sessionIds: [sessionId] }] })}
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
        : <p>合成对话正文</p>}</div> : name === 'eleckoi.creator-studio.composer.bar' ? <NativeComposer {...owner} /> : null} />,
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
