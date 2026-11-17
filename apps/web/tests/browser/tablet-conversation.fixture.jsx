import React, { useState } from 'react';
import { ConversationWidthControls } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationWidthControls.tsx';
import { ConversationContent } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationContent.tsx';
import { ConversationRoot } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/ConversationRoot.tsx';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { ChatView, InputBar, DraftEditorRuntime, registerPlainText, conversationZh } from 'official-tablet-conversation';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { createNativeConversationPresentation } from '../helpers/NativeConversationPresentationBase.jsx';
import { messages, previewActions } from './tablet-layout-model.fixture.jsx';
import { TabletRightbarExpand } from './tablet-rightbar.fixture.jsx';
import { AgentPresetLabel } from '@deepseek-ai/dsh-client-ui-agent-preset/src/client/AgentPresetLabel.tsx';
import { SubagentCatalogAction } from '@deepseek-ai/dsh-client-ui-subagent/src/client/SubagentHeaderLineage.tsx';
import { zh as subagentZh } from '@deepseek-ai/dsh-client-ui-subagent/src/client/locales.ts';
import { ModelSelect } from '@deepseek-ai/dsh-client-ui-model-selection/src/client/ModelSelect.tsx';
import { zh as modelZh } from '@deepseek-ai/dsh-client-ui-model-selection/src/client/locales.ts';
import { TrajectoryView } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/TrajectoryView.tsx';
import { zh as trajectoryZh } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/locales.ts';
import { EntryMenuContent } from '@deepseek-ai/dsh-client-ui-entry-customization/src/client/EntryMenuContent.tsx';
import { zh as entryZh } from '@deepseek-ai/dsh-client-ui-entry-customization/src/client/locales.ts';

// Only data/service contracts are synthetic; the frame, transcript, message and input views are installed components.
export const nativeContent = createNativeConversationPresentation(ConversationContent, ConversationWidthControls, ConversationRoot);
const noop = () => {}, empty = [], hook = value => select => select(value);
const session = { running: false, blank: false, subagent: null, openState: 'open', hasMore: false, loadingOlder: false, pendingSubmissions: empty };
const nodes = messages.map((message, index) => ({ key: message.id, kind: message.role === 'user' ? 'user' : 'turn-process', anchorSeq: index + 1,
  location: { kind: 'turn', turn: { turn: index + 1, status: 'closed', data: { get: noop } } },
  data: { seq: index + 1, time: Date.parse(message.created_at), content: [{ type: 'text', text: message.content }], turn: index + 1 } }));
const chat = { session, order: nodes.map(node => node.key), nodes: new Map(nodes.map(node => [node.key, node])),
  navigation: { items: () => empty }, legacy: { nodes: empty } };
const runtime = new DraftEditorRuntime(); registerPlainText(runtime.editor); runtime.setDraft('合成草稿，可编辑，不发送真实请求');
const keyboard = { editor: runtime.editor, arbitrate: () => 'pass', space: () => false, dismissPopup: noop,
  bindFilePicker: () => noop, submit: () => previewActions.push({ action: 'chat.synthetic-submit' }), steerQueue: noop };
const input = { phase: 'plain', draft: '合成草稿，可编辑，不发送真实请求', attachmentIds: empty, queue: empty };
let savedScroll = null;
const translate = (key, values = {}) => Object.entries(values).reduce((text, [name,value]) => text.replaceAll(`{${name}}`, String(value)), conversationZh[key] ?? key);
const dictionary = dict => (key, values = {}) => Object.entries(values).reduce((text, [name,value]) => text.replaceAll(`{${name}}`, String(value)), dict[key] ?? key);
const modelListeners = new Set();
let modelDirectory = { current: { provider: 'synthetic', model: 'synthetic-model' }, routable: true, status: 'ready', pending: null, error: null, failures: [],
  groups: [{ id: 'synthetic', name: '合成提供商', models: [{ id: 'synthetic-model', name: '合成模型', reasoning: { efforts: [{id:'low',name:'低'},{id:'high',name:'高'}] } }] }] };
const directory = { subscribe: fn => { modelListeners.add(fn); return () => modelListeners.delete(fn); }, getSnapshot: () => modelDirectory };
export function NativeModelSelect() {
  return <ModelSelect locked={false} available directory={directory} load={noop} resolveText={text => typeof text === 'string' ? text : ''} t={dictionary(modelZh)}
    select={async current => { modelDirectory = { ...modelDirectory, current }; modelListeners.forEach(fn=>fn()); return { status: 'ok' }; }} renderSlot={(_name, _owner, options) => options?.fallback} />;
}
function NativeComposer(owner) {
  return <InputBar {...owner} sessionId="tablet-runtime" useSession={hook(session)} useInput={hook(input)} useAccess={() => true}
    useNotices={hook(null)} useBusyEnter={hook('queue')} useStopShortcut={hook(empty)} useMenuLauncher={hook(null)}
    useFileUploads={hook({})} useLexicon={hook(empty)} useProjection={() => undefined} inputActions={{}}
    keyboard={keyboard} registerFileIntake={() => noop} t={translate} renderSlot={name => name === 'conversation.input.model' ? <NativeModelSelect /> : null} />;
}
const chatProps = { sessionId: 'tablet-runtime', useSession: hook(session), useChat: hook(chat),
  useChatNode: (key, select = value => value) => select(chat.nodes.get(key)),
  useChatNodeProcess: noop, useChatGroup: noop, useContextMenu: () => ({ getTriggerProps: () => ({}) }),
  useConnectionState: hook('connected'), useInteractionIds: hook(empty), dispatchInteraction: async () => {},
  useConversation: hook({ views: { grouped: noop } }), useSessions: hook({ byId: { 'tablet-runtime': {} } }),
  useProjection: key => key === 'inbox' ? { 'next-step': empty } : undefined,
  usePresentation: hook({ foldCompletedTurns: false, stepGrouping: 'none' }), useStore: hook({ turnProcess: {} }),
  actions: { setTurnProcessOpen: noop }, t: key => key, loadOlder: async () => {}, consumeOlder: () => false, loadThrough: async () => {},
  chatScroll: { read: () => savedScroll, save: value => { savedScroll = value; } },
  openFile: async () => {}, openSkill: noop, openExternalLink: noop, loadImage: async () => '', inspectCall: noop, fileMentions: noop,
};
function Conversation({ component: Component, props }) {
  const [activeView, selectView] = useState('chat');
  const sessions = { byId: { 'tablet-runtime': { projectionValues: { agentPreset: 'synthetic-preset' } }, 'synthetic-child': { title: '合成子代理', projectionValues: {} } }, projectionsBySession: { 'tablet-runtime': { state: 'ready', error: null, values: { subagentCatalog: [{ id: 'synthetic-child', mode: 'continuable', name: '合成子代理' }] } } } };
  const inspection = { eventNodes: [], eventLocations: new Map(), requests: [], callSchemas: new Map(), partial: null, runningCalls: [] };
  return <OfficialMarkdownProvider component={MarkdownText}><Component {...props} hasHeaderMenu renderConversationContent={nativeContent}
    dshConversation={{ activeView, selectView, tabs: [{ id: 'chat', label: '对话' }, { id: 'trajectory', label: '轨迹' }], renderView: noop,
      renderEntryActions: onDismiss => <EntryMenuContent region="conversation" entries={empty} onOpen={selectView} onPinnedChange={noop} onDismiss={onDismiss}
        usePluginNavigation={hook(true)} browsePlugins={()=>previewActions.push({action:'plugins.browse'})} createPlugin={()=>previewActions.push({action:'plugins.create'})} t={dictionary(entryZh)} renderFactorySlot={()=>null} />,
      renderHeaderActions: () => <><AgentPresetLabel sessionId="tablet-runtime" useSessions={hook(sessions)}
        useAgentPresets={hook({ options: [{ id: 'synthetic-preset', name: '合成扮演预设' }] })} load={async()=>{}} t={key=>key} />
        <SubagentCatalogAction sessionId="tablet-runtime" useSession={hook(session)} useSessions={hook(sessions)} useSessionStatus={hook(new Map())}
          useProjection={(_key, select) => select?.(undefined)} useFooterAvailable={hook(false)} prepareCatalog={async()=>{}} refreshProjection={noop}
          openChild={noop} openChildAside={noop} renderSlot={()=>null} t={dictionary(subagentZh)} /></> }}
    renderRoleplaySlot={(name, owner) => name === 'eleckoi.roleplay.conversation.composer.bar' ? <NativeComposer {...owner} />
      : name === 'eleckoi.roleplay.conversation.header.corner' ? <TabletRightbarExpand />
      : name === 'eleckoi.roleplay.header.menu' ? <button type="button" role="menuitem" onClick={owner.onOpen}>自定义背景</button>
      : name === 'eleckoi.roleplay.trajectory' ? <TrajectoryView useSession={hook(session)} useTrajectory={hook(inspection)} useDuration={hook(false)}
        loadOlder={async()=>false} loadImage={async()=>''} setActualDuration={noop} renderSlot={()=>null} t={dictionary(trajectoryZh)} />
      : name === 'eleckoi.roleplay.chat' ? <ChatView {...chatProps} before={owner.before} runningStatusTarget={owner.runningStatusTarget}
        renderSlot={(slot, nodeOwner, options) => slot === 'conversation.chat.node' ? owner.renderChatNode(nodeOwner) : options?.fallback ?? null} /> : null} />
  </OfficialMarkdownProvider>;
}
export const renderRoleplay = owner => <Conversation {...owner} />;
