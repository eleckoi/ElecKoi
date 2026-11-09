import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { RoleplayInputMenu, AgentToolsDialog } from '../../chat/index.js';
import { openPresetManagerWindow } from '../../presets/index.js';
import { DshEntryActionsMenu } from '../../../ui/ui/DshEntryActionsMenu.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { CreatorStudioHero } from './CreatorStudioHero.jsx';

/** Desktop assembly of the shared Studio Session with native views and resident input. */
export function CreatorStudioConversation({ model, editing = false, presetCatalog, title, onCreate, onSelectCharacter, onError,
  sessionId, useSession, useInput, useWorkspaces, useSessionStatus, useProjection, useInspectCall, useConversationViews, useEntryPins, useEntryActions, setPinned, useStore, actions, openView, selectView, renderHeaderSlot, renderSlot, renderSlotChain }) {
  const tUi = useProductTranslation();
  const session = useSession(value => value), input = useInput(value => value);
  // A log rewrite can publish an empty baseline before its replacement turn.
  // Only settle into the new-chat layout after the message operation finishes.
  const hero = session.blank && !editing;
  const pendingInteraction = useSessionStatus(value => value.get(sessionId)?.pendingInteraction);
  const projectedTitle = useProjection('title');
  const inspectCall = useInspectCall(value => value), activeView = useStore(value => value.view);
  const tabs = useConversationViews(value => value);
  const unpinned = useEntryPins(value => value), hasEntryActions = useEntryActions(value => value);
  const active = tabs.find(tab => tab.id === activeView) ?? tabs.find(tab => tab.id === 'chat') ?? tabs[0];
  const viewRequest = useStore(value => value.viewRequest ?? null);
  const owner = { inspectCall, viewRequest, openView, completeViewRequest: actions.completeViewRequest };
  const [tools, setTools] = useState(false);
  const [messages, setMessages] = useState(null), [selectedMessage, setSelectedMessage] = useState(null), [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState(null);
  const body = useRef(null), composer = useRef(null);
  const notify = useCallback((kind, text) => { if (kind === 'error') onError(text); }, [onError]);
  useEffect(() => { if (!session.running) void model.refresh().catch(error => onError(error)); }, [model, session.running, onError]);
  useLayoutEffect(() => {
    if (!body.current || !composer.current) return;
    const scroller = body.current, seat = composer.current;
    const update = () => scroller.style.setProperty('--dsh-composer-height', `${seat.offsetHeight}px`);
    const observer = new ResizeObserver(update); observer.observe(seat); update();
    return () => { observer.disconnect(); scroller.style.removeProperty('--dsh-composer-height'); };
  }, []);
  async function regenerate() { try { await model.regenerate(); } catch (error) { onError(error); } }
  async function showMessages() { try { setMessages(await model.messages()); setSelectedMessage(null); setDeleteError(null); } catch (error) { onError(error); } }
  async function removeMessages() {
    if (!selectedMessage) return;
    setDeleting(true); setDeleteError(null);
    try { await model.deleteMessagesFrom(selectedMessage.eventSeq, selectedMessage.role); setMessages(null); }
    catch (error) { setDeleteError(error); onError(error); }
    finally { setDeleting(false); }
  }
  const menu = <RoleplayInputMenu purpose="creator" isSending={session.running} onCreateChat={onCreate} onSelectCharacter={onSelectCharacter}
    onOpenTools={() => setTools(true)} onEnterDeleteMode={showMessages} canDeleteMessages={!session.blank}
    onRegenerate={regenerate} regenerateTargetMessageId={session.blank ? null : sessionId} />;
  const resident = renderSlot('eleckoi.creator-studio.composer.bar', { variant: hero ? 'hero' : 'composer', placeholder: hero ? tUi("发消息或创建任务，/ 调用指令，@ 文件或对话") : tUi("输入消息"), leadingAccessory: menu });
  const inputSeat = renderSlotChain('eleckoi.creator-studio.composer', { sessionId, session, pendingInteraction }, { fallback: resident, overlay: true });
  return <div className="creator-simple-conversation" data-phase={hero ? 'hero' : 'active'}>
    {hero ? <div className="creator-studio-hero-corner">{renderHeaderSlot('eleckoi.creator-studio.session.header.corner', {})}</div> : <header className="creator-simple-chat-header">
      <div className="creator-simple-chat-heading"><h1 title={projectedTitle || title}>{projectedTitle || title}</h1>
        {renderHeaderSlot('eleckoi.creator-studio.session.header.actions', {})}
        <div className="creator-simple-header-actions">
          {renderHeaderSlot('eleckoi.creator-studio.session.header.utilities', {})}
          {renderHeaderSlot('eleckoi.creator-studio.session.header.corner', {})}
        </div>
      </div>
      <div className="creator-simple-view-row">
        <div role="tablist" aria-label={tUi("工作室视图")} data-conversation-tabs="">{tabs.filter(tab => !unpinned.includes(tab.id)).map(({ id, label }) => <button type="button" role="tab" key={id}
          aria-selected={active?.id === id} onClick={() => selectView(id)}><span className="creator-simple-view-label">{label}</span></button>)}</div>
        {hasEntryActions ? <DshEntryActionsMenu region="conversation" renderActions={onDismiss => renderHeaderSlot('eleckoi.creator-studio.session.header.views.actions', {
          entries: tabs.filter(tab => unpinned.includes(tab.id)).map(tab => ({ id: tab.id, label: tab.label, pinned: false, active: tab.id === active?.id })),
          onOpen: selectView, onPinnedChange: setPinned, onDismiss
        })} /> : null}
      </div>
    </header>}
    <div ref={body} className="creator-simple-conversation-scroll" data-conversation-scroll="true">
      {!hero && <div className={`creator-simple-transcript${active?.id !== 'chat' ? ' is-panel-view' : ''}${active?.id === 'trajectory' ? ' is-trajectory' : ''}`}>{active && renderSlot('eleckoi.creator-studio.view', owner, { only: active.id })}</div>}
      <div ref={composer} className="chat-composer-region creator-simple-composer" data-composer-seat="true" inert={editing ? true : undefined} aria-busy={editing || undefined}>
        {hero && <CreatorStudioHero model={model} sessionId={sessionId} presetCatalog={presetCatalog} useWorkspaces={useWorkspaces} renderSlot={renderSlot} onError={onError} />}
        {renderSlot('eleckoi.creator-studio.input.dock', { session, input })}{inputSeat}
      </div>
    </div>
    {tools && <AgentToolsDialog purpose="creator" presetCatalog={presetCatalog} onNotify={notify} onClose={() => setTools(false)} onManage={() => openPresetManagerWindow('creator')} />}
    <Modal open={!!messages} title={tUi("删除消息")} closeLabel={tUi("关闭")} onClose={() => !deleting && setMessages(null)} className="creator-simple-message-dialog"
      footer={<button type="button" disabled={!selectedMessage || deleting} onClick={removeMessages}>{tUi("删除")}</button>}>
      <FailureAlert failure={deleteError} className="creator-simple-error" />
      <div className="creator-simple-message-list">{messages?.filter(message => message.text.trim()).map(message => <label key={message.eventSeq}>
        <input type="radio" name="creator-message-delete" checked={selectedMessage?.eventSeq === message.eventSeq} onChange={() => setSelectedMessage(message)} /><span>{message.text}</span>
      </label>)}</div><p>{tUi("删除选中的消息及之后的内容")}</p>
    </Modal>
  </div>;
}
