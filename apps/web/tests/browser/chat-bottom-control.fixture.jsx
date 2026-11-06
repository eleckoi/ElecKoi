import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatView } from 'official-chat-fixture';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { MessageList } from '../../src/modules/chat/components/ChatPanel.jsx';
import { selectRoleplayChatSeat } from '../../src/modules/chat/model/chatViewSeats.js';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/modules/chat/styles/chat-panel.css';
import '../../src/mobile/mobile.css';

const query = new URLSearchParams(location.search);
const alignment = query.has('alignment');
const layoutMode = query.get('layout') || 'roleplay';
const mobile = query.has('mobile');
document.documentElement.dataset.theme = query.get('theme') || 'light';
document.documentElement.dataset.eleckoiMobile = String(mobile);

const listeners = new Set();
const empty = [];
const node = index => ({ key: `synthetic-turn-${index}`, kind: 'turn-process', anchorSeq: index + 1,
  location: { kind: 'turn', turn: { turn: index + 1, status: 'closed', data: { get() {} } } }, data: { turn: index + 1 } });
let nodes = Array.from({ length: 24 }, (_, index) => node(index));
if (alignment) nodes = [node(0), ...['synthetic-image', 'synthetic-panel', 'manual-compaction'].map((kind, index) => ({
  key: `synthetic-extension-${index}`, kind, anchorSeq: index + 2, location: { kind: 'session' }, data: {},
}))];
let state = { order: nodes.map(item => item.key), nodes: new Map(nodes.map(item => [item.key, item])) };
let saved = null;
const snapshot = () => state;
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const session = { running: false, openState: 'open', openError: null, hasMore: false, loadingOlder: false, pendingSubmissions: empty };
const messages = [{ id: 'synthetic-reply', role: 'assistant', runtimeSessionId: 'synthetic-scroll-session',
  renderKey: 'dsh-reply-synthetic-scroll-session-1', content: '合成正文：插件内容与这段正文共用阅读边界。', status: 'complete' }];
const rowProps = { messages, runtimeSessionId: 'synthetic-scroll-session', layoutMode, profile: {},
  avatarShape: 'portrait', assistantName: '合成角色', showRoleplayTimestamp: false, showRoleplayFloor: false };
const props = {
  useContextMenu: () => ({ getTriggerProps: () => ({}) }), useConnectionState: select => select('connected'),
  useInteractionIds: select => select(empty), dispatchInteraction: async () => {},
  sessionId: 'synthetic-scroll-session',
  useSession: select => select(session),
  useChat: select => select({ ...useSyncExternalStore(subscribe, snapshot), navigation: { items: () => empty } }),
  useChatNode: (key, select = value => value) => select(useSyncExternalStore(subscribe, snapshot).nodes.get(key)),
  useChatNodeProcess: () => undefined, useChatGroup: () => undefined,
  useConversation: select => select({ views: { grouped: () => undefined } }),
  useSessions: select => select({ byId: { 'synthetic-scroll-session': {} } }),
  useProjection: key => key === 'inbox' ? { 'next-step': empty } : undefined,
  usePresentation: select => select({ foldCompletedTurns: false, stepGrouping: 'none' }),
  useStore: select => select({ turnProcess: {} }), actions: { setTurnProcessOpen() {} }, t: key => key,
  chatScroll: { read: () => saved, save: value => { saved = value; } },
  loadOlder: async () => {}, loadThrough: async () => {}, openFile: async () => {}, openSkill() {},
  openExternalLink() {}, loadImage: async () => '', inspectCall() {}, fileMentions() {},
  renderSlot: (name, owner, options) => {
    if (name !== 'conversation.chat.node') return options?.fallback ?? null;
    if (!alignment) return <article className="synthetic-message">{owner.node.key}</article>;
    const seat = selectRoleplayChatSeat(messages, props.sessionId, owner.node);
    if (seat !== undefined) return seat ? <MessageList {...rowProps} seat={seat} officialNode /> : null;
    return <section data-alignment-target={owner.node.kind} style={{ minWidth: 0, width: '100%', overflowWrap: 'anywhere' }}>
      <strong>{owner.node.kind === 'manual-compaction' ? '合成压缩状态' : '合成插件内容'}</strong>
      <p>合成内容与正文对齐</p>
      {owner.node.kind === 'synthetic-image' ? <svg width="280" height="160" viewBox="0 0 280 160" style={{ maxWidth: '100%', display: 'block' }}>
        <rect width="280" height="160" rx="12" fill="#dbe8f4" /><circle cx="140" cy="80" r="38" fill="#729dc7" />
      </svg> : null}
    </section>;
  },
};

window.chatBottomFixture = {
  setCount(count) {
    nodes = Array.from({ length: count }, (_, index) => node(index));
    state = { order: nodes.map(item => item.key), nodes: new Map(nodes.map(item => [item.key, item])) };
    listeners.forEach(listener => listener());
  },
};

function Fixture() {
  const scroller = useRef(null), composer = useRef(null);
  useLayoutEffect(() => {
    const update = () => scroller.current.style.setProperty('--dsh-composer-height', `${composer.current.offsetHeight}px`);
    const observer = new ResizeObserver(update);
    observer.observe(composer.current); update();
    return () => observer.disconnect();
  }, []);
  const spacing = Object.fromEntries(['avatar', 'gap', 'padding'].filter(key => query.has(key)).map(key => [
    { avatar: '--chat-avatar-width', gap: '--chat-avatar-gap', padding: '--chat-horizontal-padding' }[key], `${query.get(key)}px`,
  ]));
  return <div className={mobile ? 'mobile-conversation-page' : 'fixture-surface'} style={{ height: '100%' }}><section className={`chat-panel view-chat layout-${layoutMode}`} style={spacing}>
    <header className="chat-header">合成聊天</header>
    <div className="chat-conversation-body" style={alignment ? { '--dsh-chat-user-width': `${query.get('reading') || 680}px` } : undefined}>
      <div className={`message-area layout-${layoutMode}`} data-conversation-scroll="" ref={scroller}>
        <div className="chat-transcript-region"><OfficialMarkdownProvider component={MarkdownText}><ChatView {...props} /></OfficialMarkdownProvider></div>
        <div className="chat-composer-region" data-composer-seat="" ref={composer}>
          <textarea aria-label="合成输入框" />
        </div>
      </div>
    </div>
  </section></div>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
