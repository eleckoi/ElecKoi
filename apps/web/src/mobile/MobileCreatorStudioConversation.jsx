import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { RoleplayInputMenu } from '../modules/chat/components/RoleplayInputMenu.jsx';
import { ModelPicker } from '../modules/models/index.js';
import { AgentToolsDialog } from '../modules/chat/components/AgentToolsDialog.jsx';
import { MobileConversationPage } from './MobileConversationPage.jsx';
import { MobileDialog } from './MobileChrome.jsx';
import { DshEntryActionsMenu } from '../ui/ui/DshEntryActionsMenu.jsx';

/** Official Chat keeps its native tool cards; the resident mobile composer owns input and stats. */
export function MobileCreatorStudioConversation({ model, headerTarget, cornerTarget, editing = false, onCreate, onSelectCharacter, onError,
  sessionId, useSession, useInput, useSessionStatus, useProjection, useInspectCall, useConversationViews, useEntryPins, useEntryActions, setPinned, useStore, actions, openView, selectView, renderHeaderSlot, renderSlot, renderSlotChain }) {
  const tUi = useProductTranslation();
  const view = useMainPageView();
  const session = useSession(snapshot => snapshot);
  const input = useInput(snapshot => snapshot);
  const pendingInteraction = useSessionStatus(snapshot => snapshot.get(sessionId)?.pendingInteraction);
  const projectedModel = useProjection('modelSelection');
  const inspectCall = useInspectCall(value => value);
  const activeView = useStore(value => value.view);
  const tabs = useConversationViews(value => value);
  const unpinned = useEntryPins(value => value), hasEntryActions = useEntryActions(value => value);
  const active = tabs.find(tab => tab.id === activeView) ?? tabs.find(tab => tab.id === 'chat') ?? tabs[0];
  const viewRequest = useStore(value => value.viewRequest ?? null);
  const viewOwner = { inspectCall, viewRequest, openView, completeViewRequest: actions.completeViewRequest };
  const models = useSyncExternalStore(view.models.subscribe, view.models.getSnapshot);
  const [defaultModel, setDefaultModel] = useState(null);
  const [tools, setTools] = useState(false);
  const [messages, setMessages] = useState(null);
  const [deleteFrom, setDeleteFrom] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const selected = projectedModel?.next ?? projectedModel?.lastUsed ?? defaultModel;
  const notify = useCallback((kind, text) => { if (kind === 'error') onError(text); }, [onError]);
  useEffect(() => {
    let active = true;
    model.readDefaultModel().then(value => { if (active) setDefaultModel(value); }).catch(error => { if (active) onError(error); });
    return () => { active = false; };
  }, [model, onError]);
  useEffect(() => { if (!session.running) void model.refresh().catch(error => onError(error)); }, [model, session.running, onError]);
  async function regenerate() {
    try { await model.regenerate(); } catch (error) { onError(error); }
  }
  async function openDelete() {
    try { setMessages(await model.messages()); setDeleteFrom(null); } catch (error) { onError(error); }
  }
  async function removeMessages() {
    if (!deleteFrom) return;
    setDeleting(true);
    try { await model.deleteMessagesFrom(deleteFrom.eventSeq, deleteFrom.role); setMessages(null); }
    catch (error) { onError(error); }
    finally { setDeleting(false); }
  }
  const menu = <RoleplayInputMenu purpose="creator" isSending={session.running}
    onSelectCharacter={onSelectCharacter} onCreateChat={onCreate} onOpenTools={() => setTools(true)}
    onEnterDeleteMode={openDelete} canDeleteMessages={!session.blank}
    onRegenerate={regenerate} regenerateTargetMessageId={session.blank ? null : sessionId} />;
  const picker = <ModelPicker configs={models.configs} selectedConfigId={selected?.provider}
    onSaveModelConfig={config => view.models.save(config)}
    selectedModel={selected?.model} onLoadModels={config => view.models.discover(config)} onNotify={notify}
    onSelect={selection => model.selectModel({ provider: selection.configId, model: selection.model })} />;
  const resident = renderSlot('eleckoi.creator-studio.composer.bar', {
    variant: 'composer', placeholder: tUi("输入消息"), submitOnEnter: false, leadingAccessory: menu, modelAccessory: picker,
  });
  const composer = renderSlotChain('eleckoi.creator-studio.composer', {
    sessionId, session, pendingInteraction,
  }, { fallback: resident, overlay: true });
  return <MobileConversationPage>
    {headerTarget && createPortal(renderHeaderSlot('eleckoi.creator-studio.session.header.actions', {}), headerTarget)}
    {cornerTarget && createPortal(renderHeaderSlot('eleckoi.creator-studio.session.header.corner', {}), cornerTarget)}
    <div className="creator-studio-session-body">
      <div className="creator-studio-view-header">
      <div className="chat-header-tabs creator-studio-view-tabs" role="tablist" aria-label={tUi("工作室视图")} data-conversation-tabs="">
        {tabs.filter(tab => !unpinned.includes(tab.id)).map(({ id, label }) => <button type="button" role="tab" key={id}
          aria-selected={active?.id === id} onClick={() => selectView(id)}>{label}</button>)}
      </div>
      {hasEntryActions ? <DshEntryActionsMenu region="conversation" renderActions={onDismiss => renderHeaderSlot('eleckoi.creator-studio.session.header.views.actions', {
        entries: tabs.filter(tab => unpinned.includes(tab.id)).map(tab => ({ id: tab.id, label: tab.label, pinned: false, active: tab.id === active?.id })),
        onOpen: selectView, onPinnedChange: setPinned, onDismiss,
      })} /> : null}
      </div>
      <div className={`creator-studio-chat-scroll${active?.id !== 'chat' ? ' creator-studio-panel-view' : ''}${active?.id === 'trajectory' ? ' creator-studio-trajectory trajectory-host' : ''}`} data-conversation-scroll={active?.id === 'chat' ? 'true' : undefined}>
        {active && renderSlot('eleckoi.creator-studio.view', viewOwner, { only: active.id })}
      </div>
      <div className="chat-composer-region" data-composer-seat="true" inert={editing ? true : undefined} aria-busy={editing || undefined}>
        {renderSlot('eleckoi.creator-studio.input.dock', { session, input })}
        {composer}
      </div>
    </div>
    {tools && <AgentToolsDialog purpose="creator" presetCatalog={view.presets} onNotify={notify}
      onClose={() => setTools(false)} onManage={view.openPresetTools} />}
    {messages && <MobileDialog title={tUi("删除消息")} busy={deleting} onClose={() => setMessages(null)} className="creator-studio-message-picker creator-studio-confirmation">
      <div className="creator-studio-message-list">
        {messages.map(message => <label key={message.eventSeq}><input type="radio" name="studio-delete-from"
          checked={deleteFrom?.eventSeq === message.eventSeq} onChange={() => setDeleteFrom(message)} />
          <span>{message.text}</span></label>)}
      </div>
      <p>{tUi("删除选中的消息及之后的内容")}</p>
      <div className="confirmation-actions">
        <button type="button" disabled={deleting} onClick={() => setMessages(null)}>{tUi("取消")}</button>
        <button type="button" className="is-destructive" disabled={!deleteFrom || deleting} onClick={removeMessages}>{deleting ? tUi("删除中…") : tUi("删除")}</button>
      </div>
    </MobileDialog>}
  </MobileConversationPage>;
}
