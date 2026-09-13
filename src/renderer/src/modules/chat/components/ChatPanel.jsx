import { ChatComposer } from "./ChatComposer.jsx";
import { ChatWaitingReply } from "./ChatWaitingReply.jsx";
import { AgentProcessDialog } from "./AgentProcessDialog.jsx";
import { TrajectoryDialog } from "./TrajectoryDialog.jsx";
import { VariableViewerDialog } from "./VariableViewerDialog.jsx";
import { AgentToolsDialog } from "./AgentToolsDialog.jsx";
import { MessageBubble } from "../../../ui/messages/MessageBubble.jsx";
import logoIcon from "../../../assets/eleckoi-app-icon.png";
import { DshNewChatIcon } from "../../../ui/icons/dshComposerIcons.jsx";
import { ImageSquare, Path, SlidersHorizontal } from "@phosphor-icons/react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getGenerationStats, listenGenerationStatsEvent } from "../api/chatApi.js";
import {
  chatDisplayCssVariables,
  chatTextColorCssVariables,
  resolveChatAvatar,
  resolveChatAvatarShape,
  resolveChatDisplayProfile,
} from "../../appearance/index.js";

export function ChatPanel({
  hasActiveChat,
  hasCharacters,
  currentTitle,
  conversationId,
  persona,
  messages,
  input,
  setInput,
  inputImages = [],
  onAddImages,
  onRemoveImage,
  isSending,
  modelConfigs,
  selectedModelConfigId,
  selectedModel,
  modelParameters,
  modelOptionsByKey,
  onLoadModelOptions,
  onSelectModel,
  onSaveModelConfig,
  onNotify,
  onSend,
  onStop,
  onCreateChat,
  onOpenHistory,
  onOpenChatBackground,
  onOpenPresetTools,
  onRegenerate,
  onEditMessage,
  onEditOpening,
  onSelectOpening,
  onGoCharacterSettings,
  scrollRef,
  scrollRequest = { revision: 0, behavior: "auto" },
  hasOlderMessages = false,
  isLoadingOlderMessages = false,
  onLoadOlderMessages,
  chatDisplay,
  composerStyle = "glass",
}) {
  const [messageAreaHovered, setMessageAreaHovered] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [processMessage, setProcessMessage] = useState(null);
  const [trajectoryOpen, setTrajectoryOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [messageScrollElement, setMessageScrollElement] = useState(null);
  const [generationStats, setGenerationStats] = useState(null);
  const headerMenuRef = useRef(null);
  const imageDragDepthRef = useRef(0);
  const previousMessageScrollTopRef = useRef(null);

  const bindMessageScrollElement = useCallback((element) => {
    scrollRef.current = element;
    setMessageScrollElement(element);
  }, [scrollRef]);

  useEffect(() => {
    previousMessageScrollTopRef.current = null;
  }, [scrollRequest.revision]);

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

  useEffect(() => {
    let active = true;
    setGenerationStats(null);
    if (!conversationId) return undefined;
    getGenerationStats(conversationId)
      .then((stats) => { if (active) setGenerationStats(stats); })
      .catch(() => {});
    const dispose = listenGenerationStatsEvent((event) => {
      if (active && event.conversationId === conversationId) setGenerationStats(event.stats);
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [conversationId]);

  const openingMessage = messages.find((item) => item.id === "opening" && item.openingOptions?.length > 1);
  useEffect(() => {
    if (!openingMessage || isSending || String(input || "").length || processMessage || headerMenuOpen) return undefined;
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
      if (pagerButton instanceof HTMLButtonElement && !pagerButton.disabled) {
        pagerButton.click();
        return;
      }
      onSelectOpening?.(openingMessage, options[nextIndex].id);
    };
    window.addEventListener("keydown", switchOpening);
    return () => window.removeEventListener("keydown", switchOpening);
  }, [headerMenuOpen, input, isSending, onSelectOpening, openingMessage, processMessage]);

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
  const regenerateTargetMessageId = [...messages]
    .reverse()
    .find((item) => item.role === "assistant" && item.id !== "opening" && !item.pending)?.id || "";
  const displayedMessages = messages.filter((item) => !(
    item.role === "assistant" && !String(item.content || "").trim() && !(item.process || []).length
  ));

  function openChatBackground(event) {
    event.preventDefault();
    event.stopPropagation();
    setHeaderMenuOpen(false);
    onOpenChatBackground?.();
  }

  function receiveImages(files) {
    try {
      Promise.resolve(onAddImages?.(files)).catch((error) => onNotify?.("error", error?.message || "图片添加失败"));
    } catch (error) {
      onNotify?.("error", error?.message || "图片添加失败");
    }
  }

  function hasFileDrag(event) {
    return [...(event.dataTransfer?.types || [])].includes("Files");
  }

  return (
    <section
      className={`chat-panel layout-${layoutMode}${profile?.assistant_bubble_enabled ? " assistant-bubble-enabled" : ""}`}
      style={displayStyle}
      onDragEnter={(event) => {
        if (!hasFileDrag(event)) return;
        event.preventDefault();
        imageDragDepthRef.current += 1;
        setImageDragActive(true);
      }}
      onDragOver={(event) => {
        if (!hasFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!hasFileDrag(event)) return;
        event.preventDefault();
        imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1);
        if (imageDragDepthRef.current === 0) setImageDragActive(false);
      }}
      onDrop={(event) => {
        if (!hasFileDrag(event)) return;
        event.preventDefault();
        imageDragDepthRef.current = 0;
        setImageDragActive(false);
        receiveImages([...(event.dataTransfer.files || [])]);
      }}
    >
      <header className="chat-header">
        <h1>{currentTitle}</h1>
        <div className="chat-header-actions" ref={headerMenuRef}>
          <button className="chat-header-action" type="button" aria-label="查看轨迹" title="查看轨迹" onClick={() => {
            setHeaderMenuOpen(false);
            setTrajectoryOpen(true);
          }}>
            <Path size={20} weight="bold" />
          </button>
          <button className="chat-header-action" type="button" aria-label="对话操作" title="对话操作" aria-haspopup="menu" aria-expanded={headerMenuOpen} onClick={() => setHeaderMenuOpen((value) => !value)}>
            <SlidersHorizontal size={20} weight="bold" />
          </button>
          <button className="chat-header-action chat-header-new" type="button" aria-label="新建对话" title="新建对话" onClick={onCreateChat}>
            <DshNewChatIcon size={20} />
          </button>
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
      </header>

      <div
        className={`message-area layout-${layoutMode} ${messageAreaHovered ? "scrollbar-visible" : ""}`}
        ref={bindMessageScrollElement}
        onPointerEnter={() => setMessageAreaHovered(true)}
        onPointerLeave={() => setMessageAreaHovered(false)}
        onScroll={(event) => {
          const previousScrollTop = previousMessageScrollTopRef.current;
          const scrollTop = event.currentTarget.scrollTop;
          previousMessageScrollTopRef.current = scrollTop;
          const movedUp = previousScrollTop !== null && scrollTop < previousScrollTop;
          if (movedUp && scrollTop <= 240 && hasOlderMessages && !isLoadingOlderMessages) {
            onLoadOlderMessages?.();
          }
        }}
        aria-busy={isLoadingOlderMessages || undefined}
      >
        <VirtualizedMessageList
          messages={displayedMessages}
          scrollElement={messageScrollElement}
          scrollRequest={scrollRequest}
          layoutMode={layoutMode}
          profile={profile}
          avatarShape={avatarShape}
          userAvatar={userAvatar}
          assistantAvatar={assistantAvatar}
          userName={persona.user_name}
          assistantName={persona.assistant_name}
          onOpenProcess={setProcessMessage}
          onEditMessage={onEditMessage}
          onEditOpening={onEditOpening}
          onSelectOpening={onSelectOpening}
          onRegenerate={onRegenerate}
        />
      </div>

      <div className="chat-composer-region">
        {isSending ? <div className="chat-waiting-slot"><ChatWaitingReply /></div> : null}
        <ChatComposer
          input={input}
          setInput={setInput}
          inputImages={inputImages}
          onAddImages={receiveImages}
          onRemoveImage={onRemoveImage}
          isSending={isSending}
          modelConfigs={modelConfigs}
          selectedModelConfigId={selectedModelConfigId}
          selectedModel={selectedModel}
          modelParameters={modelParameters}
          modelOptionsByKey={modelOptionsByKey}
          onLoadModelOptions={onLoadModelOptions}
          onSelectModel={onSelectModel}
          onSaveModelConfig={onSaveModelConfig}
          onNotify={onNotify}
          onSend={onSend}
          onStop={onStop}
          onCreateChat={onCreateChat}
          onOpenHistory={onOpenHistory}
          onOpenTools={() => setToolsOpen(true)}
          onOpenVariables={() => setVariablesOpen(true)}
          onRegenerate={onRegenerate}
          regenerateTargetMessageId={regenerateTargetMessageId}
          composerStyle={composerStyle}
          generationStats={generationStats}
          showGenerationStats={chatDisplay?.generation_stats_enabled !== false}
        />
      </div>
      {imageDragActive ? (
        <div className="chat-image-drop-overlay" role="status" aria-live="polite">
          <ImageSquare size={56} weight="duotone" aria-hidden="true" />
          <strong>松开即可添加图片</strong>
          <span>最多 4 张，单张及合计不超过 20 MB</span>
        </div>
      ) : null}
      {processMessage ? (
        <AgentProcessDialog
          message={messages.find((item) => item.id === processMessage.id) || processMessage}
          reasoningDisplayMode={chatDisplay?.reasoning_display_mode || "collapsed"}
          onClose={() => setProcessMessage(null)}
        />
      ) : null}
      {trajectoryOpen ? <TrajectoryDialog
        conversationId={conversationId}
        isSending={isSending}
        onClose={() => setTrajectoryOpen(false)}
      /> : null}
      {variablesOpen ? <VariableViewerDialog conversationId={conversationId} onClose={() => setVariablesOpen(false)} onNotify={onNotify} /> : null}
      {toolsOpen ? <AgentToolsDialog
        modelConfigs={modelConfigs}
        modelOptionsByKey={modelOptionsByKey}
        onLoadModels={onLoadModelOptions}
        onSaveModelConfig={onSaveModelConfig}
        onClose={() => setToolsOpen(false)}
        onManage={onOpenPresetTools}
        onNotify={onNotify}
      /> : null}
    </section>
  );
}

function VirtualizedMessageList({
  messages,
  scrollElement,
  scrollRequest,
  layoutMode,
  profile,
  avatarShape,
  userAvatar,
  assistantAvatar,
  userName,
  assistantName,
  onOpenProcess,
  onEditMessage,
  onEditOpening,
  onSelectOpening,
  onRegenerate,
}) {
  const activeMessageIndex = messages.findIndex((message) => message.pending);
  const getItemKey = useCallback(
    (index) => messages[index]?.id || `${messages[index]?.role || "message"}-${messages[index]?.created_at || index}`,
    [messages],
  );
  const rangeExtractor = useCallback((range) => {
    const visible = defaultRangeExtractor(range);
    if (activeMessageIndex < 0 || visible.includes(activeMessageIndex)) return visible;
    return [...visible, activeMessageIndex].sort((left, right) => left - right);
  }, [activeMessageIndex]);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElement,
    getItemKey,
    estimateSize: () => layoutMode === "roleplay" ? 102 : layoutMode === "agent" ? 82 : 88,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 0,
    overscan: 12,
    anchorTo: "end",
    followOnAppend: "auto",
    scrollEndThreshold: 96,
    rangeExtractor,
  });

  useLayoutEffect(() => {
    if (!scrollElement) return undefined;
    virtualizer.measure();
    const frame = window.requestAnimationFrame(() => virtualizer.measure());
    return () => window.cancelAnimationFrame(frame);
  }, [scrollElement, virtualizer]);

  useLayoutEffect(() => {
    if (!scrollRequest.revision) return undefined;
    const frame = window.requestAnimationFrame(() => {
      virtualizer.scrollToEnd({ behavior: scrollRequest.behavior || "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollRequest.behavior, scrollRequest.revision, virtualizer]);

  return (
    <div className="message-virtualizer" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = messages[virtualItem.index];
        const nextRole = messages[virtualItem.index + 1]?.role;
        const spacingAfter = nextRole
          ? layoutMode === "agent" && item.role === "user" && nextRole === "assistant"
            ? profile.reply_spacing
            : profile.turn_spacing
          : 0;
        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            className="message-virtual-row"
            data-index={virtualItem.index}
            style={{
              paddingBottom: `${spacingAfter}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <MessageBubble
              message={item}
              avatar={item.role === "user" ? userAvatar : assistantAvatar}
              name={item.role === "user" ? userName : assistantName}
              layoutMode={layoutMode}
              avatarShape={avatarShape}
              onOpenProcess={onOpenProcess}
              onEdit={item.id === "opening" ? onEditOpening : onEditMessage}
              onSelectOpening={onSelectOpening}
              onRegenerate={(message) => onRegenerate?.({ targetMessageId: message.id })}
            />
          </div>
        );
      })}
    </div>
  );
}
