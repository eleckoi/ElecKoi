import { ConversationWidthControls } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationWidthControls.tsx';
import { createNativeConversationPresentation } from '../helpers/NativeConversationPresentationBase.jsx';
import { ConversationContent } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationContent.tsx';
import { ConversationRoot } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationRoot.tsx';
import React, { useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatView, ActivityPill, UsagePill, ContextMeter, PermissionSelect } from 'official-scroll-popovers';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { ChatPanel } from '../../src/modules/chat/components/ChatPanel.jsx';
import { MobileCreatorStudioPage } from '../../src/mobile/MobileCreatorStudioPage.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

const createRenderNativeContent = createNativeConversationPresentation(ConversationContent, ConversationWidthControls, ConversationRoot);

installBrowserIconSprite();
const noop = () => {};
const hook = value => select => select(value);
const empty = [];
const listeners = new Set();
const session = { running: false, openState: 'open', hasMore: false, loadingOlder: false, pendingSubmissions: empty };
let state = { order: [], nodes: new Map(), navigation: { items: () => empty }, legacy: { nodes: empty }, session };
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const useChat = select => select(useSyncExternalStore(subscribe, () => state));
const useChatNode = (key, select = value => value) => select(useSyncExternalStore(subscribe, () => state).nodes.get(key));
const catalog = { options: [{ value: 'workspace-write', name: 'Synthetic workspace' }, { value: 'read-only', name: 'Synthetic read only' }] };
const projections = {
  permissions: { currentValue: 'workspace-write' },
  contextPressure: { pressureTokens: 12000, contextWindow: 100000 },
  sessionStats: { turns: 3, steps: 9, llmMs: 10000, toolMs: 2000, ttftSteps: 1, ttftMs: 100, decodeMs: 1000, decodeTokens: 100 },
  tokenUsage: { uncachedInputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 0, outputTokens: 300 },
};
const t = (key, values = {}) => key + Object.values(values).join(' ');
const useProjection = key => projections[key];
let savedScroll = null;
const studioPage = { status: 'ready', reference: { sessionId: 'synthetic-scroll-session' }, active: { sessionId: 'synthetic-scroll-session', characterId: '' } };
const studioModel = { subscribe: () => noop, getSnapshot: () => studioPage, restoreRecent: async () => {}, refresh: async () => {}, release: noop };
const characterCatalog = { collection: { items: [], groups: [] } };
const presetCatalog = { catalog: { presets: [], activePresetIds: { roleplay: '', creator: '' } } };
const sidebarSnapshot = { shown: false };
const chatProps = {
  sessionId: 'synthetic-scroll-session', useSession: select => select(useSyncExternalStore(subscribe, () => state).session), useChat, useChatNode,
  useContextMenu: () => ({ getTriggerProps: () => ({}) }), useConnectionState: hook('connected'),
  useInteractionIds: hook(empty), dispatchInteraction: async () => {},
  useChatNodeProcess: noop, useChatGroup: noop, useConversation: hook({ views: { grouped: noop } }),
  useSessions: hook({ byId: { 'synthetic-scroll-session': {} } }),
  useProjection: key => key === 'inbox' ? { 'next-step': empty } : useProjection(key),
  usePresentation: hook({ foldCompletedTurns: false, stepGrouping: 'none' }),
  useStore: hook({ turnProcess: {} }), actions: { setTurnProcessOpen: noop }, t,
  chatScroll: { read: () => savedScroll, save: value => { savedScroll = value; } },
  loadOlder: async () => {}, loadThrough: async () => {}, openFile: async () => {}, openSkill: noop,
  openExternalLink: noop, loadImage: async () => '', inspectCall: noop, fileMentions: noop,
  renderSlot: (name, owner, options) => name === 'conversation.chat.node'
    ? owner.node.kind === 'assistant-step'
      ? <article data-test-stream style={{ padding: 12, whiteSpace: 'pre-wrap' }}>{owner.node.data.blocks.map(block => block.text).join('')}</article>
      : <article className="synthetic-message" style={{ height: 96, padding: 12 }}>{owner.node.key}</article> : options?.fallback ?? null,
};
function Composer({ leadingAccessory, tall }) {
  const stats = { useChat, useProjection, usePerformanceUsage: hook('detailed'), t };
  return <div data-composer-card style={{ margin: '24px 12px 0', padding: 12, border: '1px solid gray', borderRadius: 18 }}>
    <textarea aria-label="Synthetic draft" defaultValue="Synthetic retained draft" style={{ width: '100%', height: tall ? 180 : 55 }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{leadingAccessory}
      <PermissionSelect locked={false} select={async () => true} usePermissionCatalog={hook({ value: catalog })} useProjection={useProjection} t={t} />
    </div>
    <div data-composer-stats style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
      <ActivityPill {...stats} /><UsagePill {...stats} /><ContextMeter useProjection={useProjection} t={t} />
    </div>
  </div>;
}
function Fixture() {
  const [activeView, selectView] = useState('chat');
  const [tall, setTall] = useState(false);
  const scrollRef = useRef(null);
  const activeSession = useSyncExternalStore(subscribe, () => state.session);
  const query = new URLSearchParams(location.search);
  const mobile = query.get('mobile') === 'true';
  const studio = query.get('surface') === 'mobile-studio';
  document.documentElement.dataset.eleckoiMobile = String(mobile);
  window.scrollPopoverFixture = { selectView, setTall, live(text) {
    const key = 'synthetic-streaming-step';
    const node = { key, kind: 'assistant-step', anchorSeq: 1000,
      location: { kind: 'step', turn: { turn: 81, status: 'open', data: { get: noop } } },
      data: { turn: 81, step: 1, status: 'running', blocks: [{ kind: 'text', text }] } };
    state = { ...state, session: { ...session, running: true }, order: state.order.includes(key) ? state.order : [...state.order, key], nodes: new Map(state.nodes).set(key, node) };
    listeners.forEach(listener => listener());
  }, stop() { state = { ...state, session }; listeners.forEach(listener => listener()); }, setCount(count) {
    const nodes = Array.from({ length: count }, (_, index) => ({ key: `synthetic-turn-${index}`, kind: 'turn-process', anchorSeq: index + 1,
      location: { kind: 'turn', turn: { turn: index + 1, status: 'closed', data: { get: noop } } }, data: { turn: index + 1 } }));
    state = { ...state, session, order: nodes.map(node => node.key), nodes: new Map(nodes.map(node => [node.key, node])) };
    listeners.forEach(listener => listener());
  } };
  const render = (name, owner) => name === 'eleckoi.roleplay.conversation.composer.bar' ? <Composer {...owner} tall={tall} />
    : name === 'eleckoi.roleplay.chat' ? <ChatView {...chatProps} runningStatusTarget={owner.runningStatusTarget} /> : null;
  const tabs = [{ id: 'chat', label: 'Chat' }, { id: 'trajectory', label: 'Trajectory' }];
  const studioView = {
    creatorStudio: { sessions: studioModel },
    characters: { subscribe: () => noop, getSnapshot: () => characterCatalog },
    presets: { subscribe: () => noop, getSnapshot: () => presetCatalog },
    navigation: { sidebar: { subscribe: () => noop, getSnapshot: () => sidebarSnapshot }, closeSidebar: noop },
    goBack: noop, openWorkspaceDrawer: noop,
    renderCreatorStudioConversation: ({ component: Component, props }) => <Component {...props}
      renderFactorySlot={(_name, owner) => createRenderNativeContent(owner.presentation)}
      sessionId="synthetic-scroll-session" useSession={chatProps.useSession} useInput={hook({})}
      useWorkspaces={hook({ phase: 'ready', items: [] })} useSessionStatus={hook(new Map())}
      useProjection={useProjection} useInspectCall={hook(null)} useConversationViews={hook(tabs)}
      useEntryPins={hook(empty)} useEntryActions={hook(false)} setPinned={noop} useStore={hook({ view: activeView })}
      actions={{ completeViewRequest: noop }} openView={selectView} selectView={selectView} renderHeaderSlot={noop}
      renderSlotChain={(_name, _owner, options) => options.fallback}
      renderSlot={(name, owner) => name === 'eleckoi.creator-studio.composer.bar' ? <Composer {...owner} tall={tall} />
        : name === 'eleckoi.creator-studio.view' ? <div data-slot={name}><ChatView {...chatProps} /></div> : null} />,
  };
  return <OfficialMarkdownProvider component={MarkdownText}><main className={mobile ? `mobile-shell${studio ? '' : ' mobile-conversation-page'}` : ''} style={{ height: '100%' }}>
    {studio ? <MainPageContext.Provider value={studioView}><MobileCreatorStudioPage /></MainPageContext.Provider> :
    <ChatPanel renderConversationContent={createRenderNativeContent} hasActiveChat hasCharacters currentTitle="Synthetic character" persona={{}} messages={[]}
      conversationId="synthetic-chat" runtimeSessionId="synthetic-scroll-session" input="" setInput={noop} modelConfigs={[]} scrollRef={scrollRef}
      isSending={activeSession.running}
      chatDisplay={{ layout_mode: 'roleplay' }} onOpenHistory={() => { window.scrollPopoverFixture.historyOpened = true; }}
      renderRoleplaySlot={render} dshConversation={{ activeView, selectView, tabs, renderView: noop }} />}
  </main></OfficialMarkdownProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
