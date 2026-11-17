import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChatView, InputBar, DraftEditorRuntime, registerPlainText, conversationZh } from 'official-tablet-conversation';
import { UserMessageNodeView } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/MessageItem.tsx';
import { AssistantNodeView } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/AssistantNodeView.tsx';
import { UserContent } from '@deepseek-ai/dsh-client-ui-chat/src/client/chat/UserContent.tsx';
import { UserText } from '@deepseek-ai/dsh-client-ui-conversation/src/client/user-text/UserText.tsx';
import { zh as chatZh } from '@deepseek-ai/dsh-client-ui-chat/src/client/locale.ts';
import { TrajectoryView } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/TrajectoryView.tsx';
import { zh as trajectoryZh } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/locales.ts';
import { SidebarRoot } from '@deepseek-ai/dsh-client-ui-sidebar/src/client/SidebarRoot.tsx';
import { zh as sidebarZh } from '@deepseek-ai/dsh-client-ui-sidebar/src/client/locales.ts';
import { WorkspaceBrowser } from '@deepseek-ai/dsh-client-ui-workspace/src/client/rows/WorkspaceBrowser.tsx';
import { WorkspacePickFlow } from '@deepseek-ai/dsh-client-ui-workspace/src/client/WorkspacePicker.tsx';
import { createWorkspaceViewStore } from '@deepseek-ai/dsh-client-ui-workspace/src/client/stores.ts';
import { zh as workspaceZh } from '@deepseek-ai/dsh-client-ui-workspace/src/client/locales.ts';
import { EntryMenuContent } from '@deepseek-ai/dsh-client-ui-entry-customization/src/client/EntryMenuContent.tsx';
import { zh as entryZh } from '@deepseek-ai/dsh-client-ui-entry-customization/src/client/locales.ts';
import { AgentPresetLabel } from '@deepseek-ai/dsh-client-ui-agent-preset/src/client/AgentPresetLabel.tsx';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { ElecKoiWordmark } from '../../src/ui/icons/ElecKoiWordmark.jsx';
import logoIcon from '../../src/assets/eleckoi-app-icon.png';
import { nativeContent, NativeModelSelect } from './tablet-conversation.fixture.jsx';
import { TabletRightbarExpand } from './tablet-rightbar.fixture.jsx';
import { studioState, creatorStudio, previewActions } from './tablet-layout-model.fixture.jsx';

const noop=()=>{}, empty=[], hook=value=>select=>select(value);
const dictionary=dict=>(key,values={})=>Object.entries(values).reduce((text,[name,value])=>text.replaceAll(`{${name}}`,String(value)),dict[key]??key);
const record=action=>previewActions.push({action});
const workspaces={phase:'ready',state:'ready',items:[{workspaceId:'studio-workspace',title:'合成创作工作区',sessionIds:['tablet-runtime'],path:'/synthetic/studio'}],archivedSessionIds:[],pinnedSessionIds:[]};
const summaries={phase:'ready',ids:['tablet-runtime'],projectionsBySession:{},byId:{'tablet-runtime':{id:'tablet-runtime',title:'合成创作会话',updatedAt:Date.now(),blank:false,retainedBy:{mainView:1},projectionValues:{agentPreset:'synthetic-creator'}}}};
const session={running:false,blank:false,subagent:null,openState:'open',hasMore:false,loadingOlder:false,pendingSubmissions:empty};
const runtime=new DraftEditorRuntime();registerPlainText(runtime.editor);runtime.setDraft('合成创作草稿');
const keyboard={editor:runtime.editor,arbitrate:()=> 'pass',space:()=>false,dismissPopup:noop,bindFilePicker:()=>noop,submit:()=>record('studio.synthetic-submit'),steerQueue:noop};
const input={phase:'plain',draft:'合成创作草稿',attachmentIds:empty,queue:empty};
const nodes=Array.from({length:24},(_,index)=>({key:`studio-node-${index}`,kind:index%2?'assistant-step':'user',anchorSeq:index+1,
  location:{kind:'step',turn:{turn:index+1,status:'closed',data:{get:noop}}},
  data:index%2?{turn:index+1,step:1,status:'settled',blocks:[{kind:'text',text:'这是合成工作室回复，用来检查平板正文、工具栏和输入框。\n\n- 合成提纲\n- 合成段落'}]}:
    {seq:index+1,time:Date.now(),source:{kind:'user'},content:[{type:'text',text:'请用合成数据检查创作工作室的平板布局。'}]}}));
const chat={order:nodes.map(node=>node.key),nodes:new Map(nodes.map(node=>[node.key,node])),navigation:{items:()=>empty},legacy:{nodes:empty},session};
const inspection={eventNodes:[],eventLocations:new Map(),requests:[],callSchemas:new Map(),partial:null,runningCalls:[]};
const base={sessionId:'tablet-runtime',useSession:hook(session),useChat:hook(chat),useChatNode:(id,select=value=>value)=>select(chat.nodes.get(id)),useChatNodeProcess:noop,useChatGroup:noop,
  useContextMenu:()=>({getTriggerProps:()=>({})}),useConnectionState:hook('connected'),useInteractionIds:hook(empty),dispatchInteraction:async()=>{},useConversation:hook({views:{grouped:noop}}),
  useSessions:hook(summaries),useProjection:key=>key==='inbox'?{'next-step':empty}:undefined,usePresentation:hook({foldCompletedTurns:false,stepGrouping:'none',foldedReplies:'all'}),
  useStore:hook({turnProcess:{}}),actions:{setTurnProcessOpen:noop},loadOlder:async()=>{},consumeOlder:()=>false,loadThrough:async()=>{},openFile:async()=>{},openSkill:noop,openExternalLink:noop,
  loadImage:async()=>'',inspectCall:noop,fileMentions:noop,t:dictionary(chatZh)};
const fallback=(_name,_owner,options)=>options?.fallback??null;
function NativeStudioNode({node}) {
  const props={...base,node,useTurnData:()=>undefined,useDisclosure:()=>useState(false),useGroupAction:()=>useRef(null),resolveFilePath:path=>path,renderSlot:fallback,
    renderSlotChain:fallback,renderFactorySlot:(_name,owner)=><UserContent {...owner} renderSlot={fallback}
      renderFactorySlot={(_slot,textOwner)=><UserText {...textOwner} useUserTextRevision={hook(0)} createUserTextEvaluator={()=>({text})=>[{id:'text',start:0,end:text.length,data:{display:text}}]}
        reportTransformFailure={noop} renderSlot={fallback}/>} t={dictionary(chatZh)}/>};
  return node.kind==='user'?<UserMessageNodeView {...props}/>:<AssistantNodeView {...props}/>;
}
function Composer(owner) {
  return <InputBar {...owner} sessionId="tablet-runtime" useSession={hook(session)} useInput={hook(input)} useAccess={()=>true} useNotices={hook(null)} useBusyEnter={hook('queue')}
    useStopShortcut={hook(empty)} useMenuLauncher={hook(null)} useFileUploads={hook({})} useLexicon={hook(empty)} useProjection={()=>undefined} inputActions={{}}
    keyboard={keyboard} registerFileIntake={()=>noop} t={dictionary(conversationZh)} renderSlot={name=>name==='conversation.input.model'?<NativeModelSelect/>:null}/>;
}
function Studio({component:Component,props}) {
  const snapshot=useSyncExternalStore(studioState.subscribe,studioState.getSnapshot);
  const [activeView,selectView]=useState('chat');
  const state=useMemo(()=>({...session,blank:snapshot.blank}),[snapshot.blank]);
  const savedScroll=useRef(null);
  const renderSlot=(name,owner,options)=>name==='eleckoi.creator-studio.composer.bar'?<Composer {...owner}/>:
    name==='eleckoi.creator-studio.hero.workspace'?<WorkspacePickFlow {...owner} useWorkspaces={hook(workspaces)} useDirectoryFlow={hook(false)} createWorkspace={async()=>{}} renderDirectoryFlow={()=>null} t={dictionary(workspaceZh)}/>:
    name==='eleckoi.creator-studio.view'?<div data-slot={name}>{options.only==='trajectory'?<TrajectoryView useSession={hook(state)} useTrajectory={hook(inspection)} useDuration={hook(false)} loadOlder={async()=>false} loadImage={async()=>''} setActualDuration={noop} renderSlot={()=>null} t={dictionary(trajectoryZh)}/>:
      <ChatView {...base} chatScroll={{read:()=>savedScroll.current,save:value=>{savedScroll.current=value;}}} renderSlot={(slot,nodeOwner,opts)=>slot==='conversation.chat.node'?<NativeStudioNode {...nodeOwner}/>:opts?.fallback??null}/>}</div>:null;
  return <OfficialMarkdownProvider component={MarkdownText}><Component {...props} sessionId="tablet-runtime" useSession={hook(state)} useInput={hook(input)} useSessionStatus={hook(new Map())}
    useWorkspaces={hook(workspaces)} useProjection={()=>undefined} useInspectCall={hook(null)} useConversationViews={hook([{id:'chat',label:'对话'},{id:'trajectory',label:'轨迹'}])}
    useEntryPins={hook(empty)} useEntryActions={hook(true)} setPinned={noop} useStore={hook({view:activeView})} actions={{completeViewRequest:noop}} openView={selectView} selectView={selectView}
    renderFactorySlot={(_name,owner)=>nativeContent(owner.presentation)} renderSlot={renderSlot} renderSlotChain={fallback}
    renderHeaderSlot={(name,owner)=>name.endsWith('.corner')?<TabletRightbarExpand/>:name.endsWith('.views.actions')?<EntryMenuContent {...owner} region="conversation" usePluginNavigation={hook(true)} browsePlugins={()=>record('plugins.browse')} createPlugin={()=>record('plugins.create')} renderFactorySlot={()=>null} t={dictionary(entryZh)}/>:
      name.endsWith('.actions')?<AgentPresetLabel sessionId="tablet-runtime" useSessions={hook(summaries)} useAgentPresets={hook({options:[{id:'synthetic-creator',name:'合成创作预设'}]})} load={async()=>{}} t={key=>key}/>:null}/></OfficialMarkdownProvider>;
}
export const renderStudio=owner=><Studio {...owner}/>;
const workspaceStore=createWorkspaceViewStore().create();
export function StudioSidebar({owner,layout}) {
  const useStore=select=>select(useSyncExternalStore(workspaceStore.subscribe,workspaceStore.getSnapshot));
  return <SidebarRoot {...owner} startSession={()=>creatorStudio.sessions.create('')} toggleSidebar={layout.actions.toggleSidebar} selectPanel={layout.actions.selectPanel} setPinned={noop} trackEntryClick={noop}
    useRemoteAccess={()=>true} usePanels={hook(empty)} useEntryPins={hook(empty)} useEntryActions={hook(false)} useShortcuts={hook(empty)} usePanelInfo={hook({activePanelId:null})} t={dictionary(sidebarZh)} renderFactorySlot={()=>null}
    renderSlot={(name,ownerProps,opts)=>name==='sidebar.brand.name'?<ElecKoiWordmark/>:name==='sidebar.brand.mark'?<img src={logoIcon} width={ownerProps.size} height={ownerProps.size} alt="" draggable="false"/>:name==='sidebar.workspaces'?<WorkspaceBrowser wide useSectionScroller={()=>({bindScrollerRef:noop})} usePanelInfo={hook({activePanelId:null})} expandSidebar={noop}
      useSessions={hook(summaries)} useSessionStatus={hook(new Map())} useSessionAccess={()=>true} useWorkspaceAccess={()=>true} useWorkspaces={hook(workspaces)} useStore={useStore} actions={workspaceStore.actions}
      startSession={()=>creatorStudio.sessions.create('')} open={()=>layout.actions.toggleSidebar()} requestSessionRename={noop} notifyArchivedNotOpenable={noop} renameWorkspace={async()=>{}} useWorkspaceActionRequest={hook(null)} settleWorkspaceAction={noop}
      deleteWorkspace={async()=>{}} insertWorkspaceBefore={noop} unarchiveSession={async()=>{}} createWorkspace={async()=>{}} searchSessions={async()=>({items:[],hasMore:false})} searchResultLimit={50} useDirectoryFlow={hook(false)}
      useHostInfo={hook({home:'/synthetic'})} useShortcuts={hook(empty)} useWorkspaceShortcuts={hook({})} requestSearch={noop} requestAddWorkspace={noop} closeAddWorkspace={noop} setDirectoryBusy={noop}
      renderSlot={fallback} renderFactorySlot={()=>null} useContextMenuTarget={hook(null)} useContextMenu={()=>({getTriggerProps:()=>({})})} t={dictionary(workspaceZh)}/>:opts?.fallback??null}/>;
}
