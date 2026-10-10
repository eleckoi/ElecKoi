import { RoleplayInputMenu } from "./RoleplayInputMenu.jsx";
import { ChatModelPicker } from "./ChatModelPicker.jsx";
import { ConversationWidthControls } from "./ConversationWidthControls.tsx";
import conversationWidthCss from "./ConversationWidthControls.module.css";
import { PinnedAvatar } from "./PinnedAvatar.jsx";
import { AgentProcessDialog } from "./AgentProcessDialog.jsx";
import { VariableViewerDialog } from "./VariableViewerDialog.jsx";
import { RequestPreviewDialog } from "./RequestPreviewDialog.jsx";
import { AgentToolsDialog } from "./AgentToolsDialog.jsx";
import { MessageBubble } from "../../../ui/messages/MessageBubble.jsx";
import { ConfirmationDialog } from "../../../ui/ui/ConfirmationDialog.jsx";
import logoIcon from "../../../assets/eleckoi-app-icon.png";
import { DshAgentPresetIcon, DshNewChatIcon } from "../../../ui/icons/dshComposerIcons.jsx";
import { SlidersHorizontal } from "@phosphor-icons/react";
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  chatDisplayCssVariables,
  chatTextColorCssVariables,
  messageFloorNumber,
  resolveChatAvatar,
  resolveChatAvatarShape,
  resolveChatDisplayProfile,
} from "../../appearance/index.js";
import { findLatestRegenerateTargetMessageId } from "../model/chatRegeneration.js";
import { selectRoleplayChatSeat, selectRoleplayPendingInput } from "../model/chatViewSeats.js";
import { revealChatFile } from "../api/chatApi.js";
import { useSharedFrontendRuntime } from '../../../ui/hooks/useSharedFrontendRuntime.js';

const TrajectoryView = lazy(() => import("./TrajectoryDialog.jsx").then((module) => ({
  default: module.TrajectoryView,
})));
export function ChatPanel({
  hasActiveChat,
  hasCharacters,
  currentTitle,
  conversationId,
  conversationModel,
  presetCatalog,
  persona,
  messages,
  input,
  setInput,
  inputImages = [],
  onAddImages,
  onRemoveImage,
  inputFiles = [],
  onAddFiles,
  onRemoveFile,
  filesUploading = false,
  fileUploadProgress = null,
  isSending,
  modelConfigs,
  selectedModelConfigId,
  selectedModel,
  modelOptionsByKey,
  onLoadModelOptions,
  onSelectModel,
  onNotify,
  onSend,
  onStop,
  onCreateChat,
  onOpenHistory,
  onOpenChatBackground,
  onOpenPresetTools,
  onRegenerate,
  onDeleteMessages,
  onEditMessage,
  onEditOpening,
  onSelectOpening,
  onGoCharacterSettings,
  scrollRef,
  isLoadingOlderMessages = false,
  chatDisplay,
  runtimeSessionId = "",
  renderRoleplaySlot,
  renderRoleplaySlotChain,
  renderRoleplayMessage,
  dshComposerOwner,
  dshInputZone,
  dshConversation,
  isSwitchingChat = false,
  conversationTransitionRevision = 0,
}) {
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [processMessage, setProcessMessage] = useState(null);
  const [fallbackView, setFallbackView] = useState("chat");
  const activeView = dshConversation ? dshConversation.activeView : fallbackView;
  const viewTabs = dshConversation?.tabs ?? [{ id: "chat", label: "对话" }, { id: "trajectory", label: "轨迹" }];
  const selectView = (id) => {
    setHeaderMenuOpen(false);
    setDeleteMode(false);
    setDeleteFromMessageId("");
    if (dshConversation) dshConversation.selectView(id);
    else setFallbackView(id);
  };
  const [activePresetName, setActivePresetName] = useState("");
  const [trajectoryRevision, setTrajectoryRevision] = useState(0);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [requestPreviewOpen, setRequestPreviewOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const loadImage = useCallback((id, image) => {
    if (!conversationModel) return Promise.reject(new Error('DSH 图片服务尚未就绪。'));
    return conversationModel.readImage(id, image);
  }, [conversationModel]);
  const openFile = useCallback((id, attachmentId, name) => {
    return revealChatFile(id, attachmentId, name, { model: conversationModel });
  }, [conversationModel]);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteFromMessageId, setDeleteFromMessageId] = useState("");
  const [deletingMessages, setDeletingMessages] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [pinnedAvatar, setPinnedAvatar] = useState(null);
  const [conversationBody, setConversationBody] = useState(null);
  const [runningStatusTarget, setRunningStatusTarget] = useState(null);
  const chatPanelRef = useRef(null);
  const composerRegionRef = useRef(null);
  const headerMenuRef = useRef(null);
  const { runtime: sharedRuntime } = useSharedFrontendRuntime();
  const inputStateRef = useRef(input);
  inputStateRef.current = input;
  useEffect(() => {
    if (!sharedRuntime || !conversationId) return undefined;
    const handlers = {
      'input.get': () => ({ text: inputStateRef.current || '' }),
      'input.set': params => { const text = String(params.text ?? ''); inputStateRef.current = text; setInput(text); return { text }; },
      'input.append': params => { const text = String(inputStateRef.current || '') + String(params.text ?? ''); inputStateRef.current = text; setInput(text); return { text }; },
      'input.clear': () => { inputStateRef.current = ''; setInput(''); return { text: '' }; },
      'input.send': async () => {
        const text = inputStateRef.current;
        if (!String(text || '').trim() && !inputImages.length && !inputFiles.length) return { submitted: false };
        if (!onSend) throw new Error('当前对话没有发送入口。');
        return { submitted: await onSend({ preventDefault() {} }, text) !== false };
      },
      'presentation.current': () => ({ conversationId, title: currentTitle, messages, isGenerating: isSending, persona, chatDisplay }),
      'ui.showProcess': params => {
        const message = messages.find(value => value.id === params.id);
        if (!message) throw new Error(`显示消息不存在：${params.id}`);
        setProcessMessage(message); return null;
      }
    };
    if (onOpenChatBackground) handlers['ui.openBackground'] = () => { onOpenChatBackground(); return null; };
    if (onOpenHistory) {
      handlers['ui.openHistory'] = () => { onOpenHistory(); return null; };
      handlers['chats.openHistory'] = handlers['ui.openHistory'];
    }
    return sharedRuntime.registerChatUi(conversationId, handlers);
  }, [sharedRuntime, conversationId, currentTitle, messages, isSending, persona, chatDisplay, setInput, onSend, onOpenChatBackground, onOpenHistory, inputImages.length, inputFiles.length]);

  useLayoutEffect(() => {
    const panel = chatPanelRef.current;
    const composerRegion = composerRegionRef.current;
    const scroller = composerRegion?.parentElement;
    if (!panel || !composerRegion || !scroller || typeof ResizeObserver === "undefined") return undefined;
    const updateComposerHeight = () => {
      scroller.style.setProperty("--dsh-composer-height", `${composerRegion.offsetHeight}px`);
      scroller.style.setProperty("--dsh-conversation-viewport-height", `${scroller.clientHeight}px`);
    };
    const observer = new ResizeObserver(updateComposerHeight);
    observer.observe(composerRegion);
    observer.observe(scroller);
    updateComposerHeight();
    return () => {
      observer.disconnect();
      scroller.style.removeProperty("--dsh-composer-height");
      scroller.style.removeProperty("--dsh-conversation-viewport-height");
    };
  }, [conversationBody]);
  const displayedMessages = useMemo(() => messages.filter((item) => !(
    item.role === "assistant" && !item.pending && !String(item.content || "").trim() && !(item.process || []).length
  )), [messages]);
  const regenerateFrom = useCallback(async (message) => {
    const result = await onRegenerate?.(message);
    if (result !== false) setTrajectoryRevision((revision) => revision + 1);
    return result;
  }, [onRegenerate]);
  const bindMessageScrollElement = useCallback((element) => {
    scrollRef.current = element;
  }, [scrollRef]);

  useEffect(() => {
    setFallbackView("chat");
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    const load = () => presetCatalog.refresh()
      .then((catalog) => {
        if (!active) return;
        setActivePresetName(catalog.presets.find((preset) => preset.id === catalog.activePresetId)?.name || "");
      })
      .catch(() => {
        if (active) setActivePresetName("");
      });
    void load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [conversationId, presetCatalog]);

  useEffect(() => {
    setDeleteMode(false);
    setDeleteFromMessageId("");
    setDeletingMessages(false);
    setDeleteConfirmationOpen(false);
  }, [conversationId]);

  useEffect(() => setPinnedAvatar(null), [conversationId]);

  useEffect(() => {
    if (!deleteMode || deleteConfirmationOpen) return undefined;
    const cancelDelete = (event) => {
      if (event.key !== "Escape" || deletingMessages) return;
      setDeleteMode(false);
      setDeleteFromMessageId("");
    };
    window.addEventListener("keydown", cancelDelete);
    return () => window.removeEventListener("keydown", cancelDelete);
  }, [deleteConfirmationOpen, deleteMode, deletingMessages]);

  useEffect(() => {
    if (!headerMenuOpen) return undefined;
    const close = (event) => {
      if (!headerMenuRef.current?.contains(event.target)) {
        setHeaderMenuOpen(false);
      }
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [headerMenuOpen]);

  const openingMessage = messages.find((item) => item.id === "opening" && item.openingOptions?.length > 1);
  useEffect(() => {
    if (!openingMessage?.canChangeOpening || isSending || deleteMode || String(input || "").length || processMessage || headerMenuOpen) return undefined;
    const options = openingMessage.openingOptions || [];
    const selectedIndex = options.findIndex((item) => item.id === openingMessage.selectedOpeningId);
    const switchOpening = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return;
      const nextIndex = event.key === "ArrowLeft" ? selectedIndex - 1 : selectedIndex + 1;
      if (nextIndex < 0 || nextIndex >= options.length) return;
      event.preventDefault();
      const pagerButton = scrollRef.current?.querySelector(
        event.key === "ArrowLeft" ? ".has-opening-pager .opening-pager-prev" : ".has-opening-pager .opening-pager-next",
      );
      if (pagerButton instanceof HTMLButtonElement) {
        if (!pagerButton.disabled) pagerButton.click();
        return;
      }
      onSelectOpening?.(openingMessage, options[nextIndex].id);
    };
    window.addEventListener("keydown", switchOpening);
    return () => window.removeEventListener("keydown", switchOpening);
  }, [deleteMode, headerMenuOpen, input, isSending, onSelectOpening, openingMessage, processMessage]);

  if (!hasActiveChat) {
    return (
      <section className="chat-panel chat-panel-empty-state" aria-label="未选择聊天">
        <div className="chat-empty-guide">
          <img src={logoIcon} alt="" draggable="false" />
          {hasCharacters ? (
            <>
              <strong>选择一个角色开始聊天</strong>
              <span>从左侧角色列表中打开一个角色后，这里会显示对话内容。</span>
            </>
          ) : (
            <>
              <strong>还没有聊天角色</strong>
              <span>先创建一个角色，再开始第一段对话。</span>
              <button type="button" onClick={onGoCharacterSettings}>去创建角色</button>
            </>
          )}
        </div>
      </section>
    );
  }

  const { layout: layoutMode, profile } = resolveChatDisplayProfile(chatDisplay);
  const avatarShape = resolveChatAvatarShape(layoutMode, profile?.avatar_shape || "portrait");
  const displayStyle = {
    ...chatDisplayCssVariables(layoutMode, profile),
    ...chatTextColorCssVariables(chatDisplay?.text_colors),
  };
  const userAvatar = resolveChatAvatar(persona, "user", avatarShape);
  const assistantAvatar = resolveChatAvatar(persona, "assistant", avatarShape);
  const regenerateTargetMessageId = findLatestRegenerateTargetMessageId(messages);

  function openChatBackground(event) {
    event.preventDefault();
    event.stopPropagation();
    setHeaderMenuOpen(false);
    onOpenChatBackground?.();
  }

  function enterDeleteMode(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (isSending || !displayedMessages.some((message) => message.id !== "opening")) return;
    setHeaderMenuOpen(false);
    setProcessMessage(null);
    setDeleteFromMessageId("");
    setDeleteMode(true);
  }

  function cancelDeleteMode() {
    if (deletingMessages) return;
    setDeleteMode(false);
    setDeleteFromMessageId("");
    setDeleteConfirmationOpen(false);
  }

  async function confirmDeleteMessages() {
    if (!deleteFromMessageId || deletingMessages) return;
    setDeletingMessages(true);
    const deleted = await onDeleteMessages?.(deleteFromMessageId);
    if (deleted !== false) {
      setTrajectoryRevision((revision) => revision + 1);
      setDeleteMode(false);
      setDeleteFromMessageId("");
      setDeleteConfirmationOpen(false);
    }
    setDeletingMessages(false);
  }

  const deleteFromIndex = displayedMessages.findIndex((message) => message.id === deleteFromMessageId);
  const selectedDeleteCount = deleteFromIndex < 0 ? 0 : displayedMessages.length - deleteFromIndex;

  const roleplayMenu = <RoleplayInputMenu
    isSending={isSending}
    onCreateChat={onCreateChat}
    onOpenHistory={onOpenHistory}
    onOpenTools={() => setToolsOpen(true)}
    onOpenVariables={() => setVariablesOpen(true)}
    onOpenRequestPreview={() => setRequestPreviewOpen(true)}
    onEnterDeleteMode={enterDeleteMode}
    canDeleteMessages={displayedMessages.some((message) => message.id !== "opening")}
    onRegenerate={regenerateFrom}
    regenerateTargetMessageId={regenerateTargetMessageId}
  />;
  const roleplayModel = <ChatModelPicker
    configs={modelConfigs}
    selectedConfigId={selectedModelConfigId}
    selectedModel={selectedModel}
    modelOptionsByKey={modelOptionsByKey}
    onLoadModels={onLoadModelOptions}
    onSelect={onSelectModel}
    onNotify={onNotify}
  />;
  const roleplayDock = chatDisplay?.generation_stats_enabled === false
    ? renderRoleplaySlot?.("eleckoi.roleplay.conversation.composer.dock", { generationStatsEnabled: false })
    : undefined;
  const residentComposer = renderRoleplaySlot?.(
    "eleckoi.roleplay.conversation.composer.bar",
    {
      variant: "composer",
      placeholder: "输入消息",
      leadingAccessory: roleplayMenu,
      modelAccessory: roleplayModel,
      dockAccessory: roleplayDock,
      renderBridgeSlot: renderRoleplaySlot,
    },
  ) ?? null;
  const composedInput = renderRoleplaySlotChain && dshComposerOwner
    ? renderRoleplaySlotChain(
      "eleckoi.roleplay.conversation.composer",
      { ...dshComposerOwner, renderBridgeSlot: renderRoleplaySlot },
      { fallback: residentComposer, overlay: true },
    ) ?? residentComposer
    : residentComposer;

  const rowProps = {
    conversationId, messages: displayedMessages, layoutMode, profile, avatarShape,
    userAvatar, assistantAvatar,
    userPinImage: persona.user_portrait || persona.user_square || userAvatar,
    assistantPinImage: persona.assistant_cover || persona.assistant_square || assistantAvatar,
    onPinAvatar: setPinnedAvatar, userName: persona.user_name, assistantName: persona.assistant_name,
    showRoleplayTimestamp: chatDisplay?.roleplay_timestamps_enabled !== false,
    showRoleplayFloor: chatDisplay?.roleplay_message_floors_enabled !== false,
    onOpenProcess: setProcessMessage, onEditMessage,
    onEditOpening: isSending ? undefined : onEditOpening,
    onSelectOpening: isSending ? undefined : onSelectOpening,
    onRegenerate: regenerateFrom, deleteMode, deleteFromMessageId,
    onSelectDeleteFrom: setDeleteFromMessageId, runtimeSessionId,
    renderRoleplaySlot, renderRoleplayMessage, loadImage, onOpenFile: openFile,
  };
  const opening = <MessageList {...rowProps} openingOnly />;
  const officialChat = isSwitchingChat ? null : renderRoleplaySlot?.("eleckoi.roleplay.chat", {
    ...dshConversation?.viewOwner,
    before: opening,
    runningStatusTarget,
    renderChatNode: ({ node }) => {
      const seat = selectRoleplayChatSeat(displayedMessages, runtimeSessionId, node);
      if (seat && !seat.item.conversationId) seat.item = { ...seat.item, conversationId };
      return seat === undefined ? undefined : seat ? <MessageList {...rowProps} seat={seat} officialNode /> : null;
    },
    renderPendingInput: ({ input: pendingInput }) => {
      const seat = selectRoleplayPendingInput(displayedMessages, runtimeSessionId, pendingInput);
      return <MessageList {...rowProps} seat={{ ...seat, item: { ...seat.item, conversationId } }} />;
    },
  });

  return (
    <section
      ref={chatPanelRef}
      className={`chat-panel layout-${layoutMode} view-${activeView}${profile?.assistant_bubble_enabled ? " assistant-bubble-enabled" : ""}${deleteMode ? " message-delete-mode" : ""}`}
      style={displayStyle}
    >
      <header className="chat-header">
        <div className="chat-header-title-row">
          <div className="chat-header-title-cluster">
            <h1>{currentTitle}</h1>
            {activePresetName ? <span className="chat-header-preset" title={activePresetName}>
              <DshAgentPresetIcon size={14} className="chat-header-preset-icon" />
              <span>{activePresetName}</span>
            </span> : null}
          </div>
          <div className="chat-header-actions" ref={headerMenuRef}>
            <button className="chat-header-action" type="button" aria-label="对话操作" title="对话操作" aria-haspopup="menu" aria-expanded={headerMenuOpen} onClick={() => setHeaderMenuOpen((value) => !value)}>
              <SlidersHorizontal size={20} weight="bold" />
            </button>
            <button className="chat-header-action chat-header-new" type="button" aria-label="新建对话" title="新建对话" onClick={onCreateChat}>
              <DshNewChatIcon size={20} />
            </button>
            {renderRoleplaySlot?.("eleckoi.roleplay.conversation.header.corner", {})}
            {headerMenuOpen ? (
              <div
                className="chat-header-menu"
                role="menu"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={openChatBackground}
                >
                  自定义背景
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="chat-header-tabs" role="tablist" aria-label="对话视图" data-conversation-tabs="">
          {viewTabs.map((view) => <button key={view.id} type="button" role="tab" aria-selected={activeView === view.id} onClick={() => selectView(view.id)}>{view.label}</button>)}
        </div>
      </header>

      <div className={`chat-conversation-body ${conversationWidthCss.root}`} ref={setConversationBody}>
        <div
          className={`message-area layout-${layoutMode}`}
          ref={bindMessageScrollElement}
          data-conversation-scroll=""
          aria-busy={isSwitchingChat || isLoadingOlderMessages || undefined}
        >
          <div className="chat-transcript-region">
            {activeView === "chat" ? officialChat ?? (isSwitchingChat ? null : opening) : activeView === "trajectory" ? <Suspense fallback={<div className="trajectory-state">正在加载轨迹...</div>}>
              <TrajectoryView
                key={`${conversationId}:${trajectoryRevision}`}
                conversationId={conversationId}
                isSending={isSending}
                refreshRevision={trajectoryRevision}
                renderSlot={renderRoleplaySlot}
                viewOwner={dshConversation?.viewOwner}
              />
            </Suspense> : activeView === undefined ? null : dshConversation?.renderView(activeView)}
          </div>

          <div className="chat-composer-region" ref={composerRegionRef} data-composer-seat="">
            {deleteMode ? (
              <div className="chat-message-delete-bar" aria-label="删除消息">
                <button
                  className="delete-confirm"
                  type="button"
                  disabled={!deleteFromMessageId || deletingMessages}
                  onClick={() => setDeleteConfirmationOpen(true)}
                >
                  {deletingMessages ? "删除中" : "删除"}
                </button>
                <button type="button" disabled={deletingMessages} onClick={cancelDeleteMode}>取消</button>
              </div>
            ) : (
              <>
                <div className="chat-running-seat" ref={setRunningStatusTarget} data-chat-running-seat="" />
                {dshInputZone
                  ? renderRoleplaySlot?.("eleckoi.roleplay.conversation.input.dock", dshInputZone)
                  : null}
                {composedInput}
              </>
            )}
          </div>
        </div>
        <ConversationWidthControls
          container={conversationBody}
          phase={activeView === "chat" ? "active" : "hero"}
        />
      </div>
      {activeView === "chat" && pinnedAvatar ? <PinnedAvatar src={pinnedAvatar.src} name={pinnedAvatar.name} containerRef={chatPanelRef} onClose={() => setPinnedAvatar(null)} /> : null}
      {processMessage ? (
        <AgentProcessDialog
          message={messages.find((item) => (
            item.id === processMessage.id
            || item.renderKey === (processMessage.renderKey || processMessage.id)
          )) || processMessage}
          reasoningDisplayMode={chatDisplay?.reasoning_display_mode || "collapsed"}
          onClose={() => setProcessMessage(null)}
        />
      ) : null}
      {variablesOpen ? <VariableViewerDialog conversationId={conversationId} conversationModel={conversationModel} onClose={() => setVariablesOpen(false)} onNotify={onNotify} /> : null}
      {requestPreviewOpen ? <RequestPreviewDialog key={conversationId} conversationId={conversationId} conversationModel={conversationModel} onClose={() => setRequestPreviewOpen(false)} /> : null}
      {toolsOpen ? <AgentToolsDialog
        presetCatalog={presetCatalog}
        onClose={() => setToolsOpen(false)}
        onManage={onOpenPresetTools}
        onNotify={onNotify}
      /> : null}
      <ConfirmationDialog
        open={deleteConfirmationOpen}
        title="删除这些消息？"
        description={`将删除选中消息及其后的全部内容，共 ${selectedDeleteCount} 条。相关变量、设定状态、工具调用和媒体记录也会一起回退或清理。`}
        confirmLabel="删除消息"
        destructive
        busy={deletingMessages}
        onCancel={() => setDeleteConfirmationOpen(false)}
        onConfirm={confirmDeleteMessages}
      />
    </section>
  );
}

export function MessageList({
  conversationId,
  entering,
  messages,
  seat,
  officialNode = false,
  openingOnly = false,
  layoutMode,
  profile,
  avatarShape,
  userAvatar,
  assistantAvatar,
  userPinImage,
  assistantPinImage,
  onPinAvatar,
  userName,
  assistantName,
  showRoleplayTimestamp,
  showRoleplayFloor,
  onOpenProcess,
  onEditMessage,
  onEditOpening,
  onSelectOpening,
  onRegenerate,
  deleteMode,
  deleteFromMessageId,
  onSelectDeleteFrom,
  runtimeSessionId,
  renderRoleplaySlot,
  renderRoleplayMessage,
  loadImage,
  onOpenFile,
}) {
  const [isEntering, setIsEntering] = useState(Boolean(entering));
  const latestAssistantIndex = messages.findLastIndex((message) => message.role === "assistant" && !message.pending);
  const regenerateMessage = useCallback((message) => onRegenerate?.({
    targetMessageId: message.turnId || message.id,
  }), [onRegenerate]);
  const deleteFromIndex = deleteMode
    ? messages.findIndex((message) => message.id === deleteFromMessageId)
    : -1;

  useEffect(() => {
    if (!entering) {
      setIsEntering(false);
      return undefined;
    }
    setIsEntering(true);
    const timer = window.setTimeout(() => setIsEntering(false), 220);
    return () => window.clearTimeout(timer);
  }, [conversationId, entering]);

  return (
    <div
      className={`message-flow${isEntering ? " is-conversation-entering" : ""}`}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setIsEntering(false);
      }}
    >
      {(seat ? [seat] : messages.map((item, index) => ({ item, index }))
        .filter(({ item }) => !openingOnly || item.id === "opening")).map(({ item, index }) => {
        const rowKey = item.renderKey || item.id || `${item.role || "message"}-${item.created_at || index}`;
        const selectedForDelete = deleteFromIndex >= 0 && index >= deleteFromIndex;
        const nextRole = messages[index + 1]?.role;
        const spacingAfter = nextRole
          ? layoutMode === "agent" && item.role === "user" && nextRole === "assistant"
            ? profile.reply_spacing
            : profile.turn_spacing
          : 0;
        return <MessageRow
          key={rowKey}
          item={item}
          anchorKey={officialNode ? undefined : String(rowKey)}
          index={index}
          spacingAfter={spacingAfter}
          selectedForDelete={selectedForDelete}
          deleteMode={deleteMode}
          layoutMode={layoutMode}
          avatarShape={avatarShape}
          userAvatar={userAvatar}
          assistantAvatar={assistantAvatar}
          userPinImage={userPinImage}
          assistantPinImage={assistantPinImage}
          userName={userName}
          assistantName={assistantName}
          isLatestAssistant={index === latestAssistantIndex}
          floorNumber={messageFloorNumber(messages, index)}
          showRoleplayTimestamp={showRoleplayTimestamp}
          showRoleplayFloor={showRoleplayFloor}
          onOpenProcess={onOpenProcess}
          onPinAvatar={onPinAvatar}
          onEditMessage={onEditMessage}
          onEditOpening={onEditOpening}
          onSelectOpening={onSelectOpening}
          onRegenerate={regenerateMessage}
          onSelectDeleteFrom={onSelectDeleteFrom}
          runtimeSessionId={runtimeSessionId}
          renderRoleplaySlot={renderRoleplaySlot}
          renderRoleplayMessage={renderRoleplayMessage}
          loadImage={loadImage}
          onOpenFile={onOpenFile}
        />;
      })}
    </div>
  );
}

const MessageRow = memo(function MessageRow({
  item,
  anchorKey,
  index,
  spacingAfter,
  selectedForDelete,
  deleteMode,
  layoutMode,
  avatarShape,
  userAvatar,
  assistantAvatar,
  userPinImage,
  assistantPinImage,
  userName,
  assistantName,
  isLatestAssistant,
  floorNumber,
  showRoleplayTimestamp,
  showRoleplayFloor,
  onOpenProcess,
  onPinAvatar,
  onEditMessage,
  onEditOpening,
  onSelectOpening,
  onRegenerate,
  onSelectDeleteFrom,
  runtimeSessionId,
  renderRoleplaySlot,
  renderRoleplayMessage,
  loadImage,
  onOpenFile,
}) {
  const pluginScopeActive = !deleteMode && item.runtimeSessionId === runtimeSessionId;
  const pluginMessage = pluginScopeActive && renderRoleplaySlot && !item.pending;
  const pluginActions = pluginMessage && item.role === "assistant" && item.dshMessageId
    ? renderRoleplaySlot("eleckoi.roleplay.message.actions", {
      conversationId: item.conversationId, productMessageId: item.id, messageId: item.dshMessageId,
    }) : null;
  const pluginAfter = pluginMessage
    ? renderRoleplaySlot("eleckoi.roleplay.message.after", {
      conversationId: item.conversationId, productMessageId: item.id,
      messageId: item.dshMessageId || null, role: item.role,
    }) : null;
  const renderMessageContent = pluginScopeActive ? renderRoleplayMessage : undefined;
  // Rewind/edit/delete target the durable Session event. Historical rows can
  // legitimately have no projected turn until a closing tail is rebound.
  const canMutate = item.id === "opening" ? item.canChangeOpening === true : Number.isSafeInteger(item.sessionEventSeq);
  const bubble = <MessageBubble
    message={item}
    avatar={item.role === "user" ? userAvatar : assistantAvatar}
    pinSrc={item.role === "user" ? userPinImage : assistantPinImage}
    name={item.role === "user" ? userName : assistantName}
    layoutMode={layoutMode}
    avatarShape={avatarShape}
    isLatestAssistant={isLatestAssistant}
    floorNumber={floorNumber}
    showRoleplayTimestamp={showRoleplayTimestamp}
    showRoleplayFloor={showRoleplayFloor}
    onOpenProcess={onOpenProcess}
    onPinAvatar={onPinAvatar}
    onEdit={deleteMode || !canMutate ? undefined : item.id === "opening" ? onEditOpening : onEditMessage}
    onSelectOpening={deleteMode || !canMutate ? undefined : onSelectOpening}
    onRegenerate={deleteMode || !canMutate ? undefined : onRegenerate}
    pluginActions={pluginActions}
    pluginAfter={pluginAfter}
    renderMessageContent={renderMessageContent}
    loadImage={loadImage}
    onOpenFile={onOpenFile}
  />;

  return (
    <div
      className="message-flow-row"
      data-index={index}
      data-chat-anchor-key={anchorKey}
      data-chat-paging-anchor={anchorKey ? "true" : undefined}
      style={{ paddingBottom: `${spacingAfter}px` }}
    >
      {deleteMode ? (
        <div className={`message-delete-selection-row layout-${layoutMode}${selectedForDelete ? " is-selected" : ""}`}>
          <input
            className="message-delete-checkbox"
            type="checkbox"
            checked={selectedForDelete}
            disabled={item.id === "opening" || !canMutate}
            aria-label={`从这条消息开始删除${selectedForDelete ? "，已选中" : ""}`}
            onChange={() => onSelectDeleteFrom(item.id)}
          />
          {bubble}
        </div>
      ) : bubble}
    </div>
  );
});
