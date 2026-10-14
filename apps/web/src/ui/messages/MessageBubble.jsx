import { SystemBarOverlay } from '../ui/SystemBarOverlay.jsx';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { OfficialMarkdown } from "./OfficialMarkdown.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { AvatarPreviewDialog } from "./AvatarPreviewDialog.jsx";
import { AgentHistoryIcon, AgentPencilIcon, AgentSpeakerIcon, CopyIcon, HistoryIcon, MessageChevronRightIcon, MessagePencilIcon, MoreDotsIcon, RefreshMessageIcon, SpeakerIcon } from "../icons/elecKoiMessageIcons.jsx";
import { AgentProcessIcon } from "../../modules/chat/components/AgentProcessIcon.jsx";
import { ChatImageGallery } from "./ChatImageGallery.jsx";
import { generatedImageSegments } from './generatedImagePresentation.js';
import { ChatFileCards } from "../../modules/chat/components/ChatFileCards.jsx";
import { TurnUsage } from "../../modules/chat/components/TurnUsage.jsx";
import { liveProcessPresentation, shouldShowInlineAgentProcess } from "../../modules/chat/model/agentProcessPresentation.js";
import { RichMessageFrame } from "../../modules/authorFrontend/index.js";
import { detectRichMessagePresentation } from "@shared/foundation/richMessage";
import { finalReplyText } from "@shared/foundation/finalReply";
import { normalizeMarkdownForRendering } from "./normalizeMarkdownForRendering.js";
import { prepareMarkdownTextTones, registerMarkdownTextToneHighlights } from "./markdownTextTones.js";
import { useMessageToolbarMotion } from "../hooks/useMessageToolbarMotion.js";

const OPENING_SWIPE_DURATION = 125;
const timestampFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});

function formatMessageTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? timestampFormatter.format(date) : "";
}

function nextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
}

async function animateOpeningSlide(article, fromX, toX, freezeAtEnd = false) {
  const content = article?.querySelector(":scope > .message-content");
  const elements = [
    article?.querySelector(":scope > .avatar"),
    article?.querySelector(":scope > .message-floor"),
    ...(content && window.getComputedStyle(content).display === "contents" ? [...content.children] : [content]),
  ].filter(Boolean);
  if (!elements.length) return () => {};

  elements.forEach((element) => { element.style.willChange = "transform"; });
  const animations = elements.map((element) => element.animate(
    [
      { transform: `translateX(${fromX}px)` },
      { transform: `translateX(${toX}px)` },
    ],
    {
      duration: OPENING_SWIPE_DURATION,
      easing: "ease-in-out",
      fill: freezeAtEnd ? "forwards" : "none",
    },
  ));

  await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  return () => {
    animations.forEach((animation) => animation.cancel());
    elements.forEach((element) => { element.style.willChange = ""; });
  };
}

function MessagePresentation({ message, content, streaming, renderMessageContent }) {
  const presentation = useMemo(
    () => message.role === "assistant" && !streaming
      ? detectRichMessagePresentation(content || "", false)
      : null,
    [content, message.role, streaming],
  );
  const renderMarkdown = (source, key) => {
    const markdown = normalizeMarkdownForRendering(source || "");
    const content = <OfficialMarkdown key={key} content={markdown} streaming={streaming} />;
    if (!renderMessageContent) return content;
    return renderMessageContent({
      conversationId: message.conversationId,
      productMessageId: message.id,
      messageId: message.dshMessageId || null,
      role: message.role,
      content: markdown,
      streaming,
    }, content);
  };
  if (message.role !== "assistant") return renderMarkdown(content, "message");
  if (!presentation) return renderMarkdown(content, "message");
  const fallback = message.generatedImageAttachments?.length
    ? presentation.parts.filter(part => part.kind === 'markdown').map(part => part.source).join('\n')
    : finalReplyText(message.content || '');
  return <SettledRichPresentation message={message} presentation={presentation} renderMarkdown={renderMarkdown} fallback={fallback} />;
}

function SettledRichPresentation({ message, presentation, renderMarkdown, fallback }) {
  const [settled, setSettled] = useState({ presentation: null, parts: [] });
  const ready = settled.presentation === presentation
    && presentation.parts.filter(part => part.kind === 'rich').every(part => settled.parts.includes(part.id));
  const markSettled = id => setSettled(previous => {
    const parts = previous.presentation === presentation ? previous.parts : [];
    return parts.includes(id) ? previous : { presentation, parts: [...parts, id] };
  });
  let rootIndex = 0;
  return <div style={{ position: 'relative' }}>
    {!ready ? renderMarkdown(fallback, 'frontend-pending') : null}
    <div className="rich-message-presentation rich-message-staging" aria-hidden={!ready}
      style={ready ? undefined : { position: 'absolute', insetInline: 0, top: 0, visibility: 'hidden' }}>
      {presentation.parts.map((part) => {
    if (part.kind !== "rich") return renderMarkdown(part.source, part.id);
    const currentRootIndex = rootIndex;
    rootIndex += 1;
    return <RichMessageFrame
      key={part.id}
      message={message}
      document={part.document}
      rootIndex={currentRootIndex}
      onSettled={() => markSettled(part.id)}
    />;
  })}</div></div>;
}

function MessageBubbleComponent({ message = {}, avatar, pinSrc, name, layoutMode = "roleplay", avatarShape = "portrait", spacingAfter, floorNumber, showRoleplayTimestamp = true, showRoleplayFloor = true, isLatestAssistant = true, onOpenProcess, onPinAvatar, onSelectOpening, onEdit, onRegenerate, onRegenerateImage, onOpenFile, pluginActions, pluginAfter, renderMessageContent, loadImage }) {
  const { role, content, pending = false } = message;
  const displayContent = message.displayContent ?? content;
  const isUser = role === "user";
  const editableContent = !isUser && message.generatedImageAttachments?.length ? displayContent : content;
  const roleplayTimestamp = layoutMode === "roleplay" && showRoleplayTimestamp
    ? formatMessageTimestamp(message.created_at ?? message.createdAt)
    : "";
  const roleplayFloor = layoutMode === "roleplay" && showRoleplayFloor
    && Number.isSafeInteger(floorNumber) && floorNumber >= 0;
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editableContent || "");
  const [jumpOpen, setJumpOpen] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const [openingSwitching, setOpeningSwitching] = useState(false);
  const [pagerOpeningId, setPagerOpeningId] = useState(message.selectedOpeningId);
  const [presentationRevision, setPresentationRevision] = useState(0);
  const articleRef = useRef(null);
  const toolsRef = useRef(null);
  const mobileRoleplay = layoutMode === "roleplay" && typeof document !== "undefined" && document.documentElement.dataset.eleckoiMobile === "true";
  const toolbar = useMessageToolbarMotion(expanded, mobileRoleplay, toolsRef, articleRef, !pending);
  const jumpDialogRef = useRef(null);
  const jumpTriggerRef = useRef(null);
  const openingSwitchingRef = useRef(false);
  const selectedOpeningIdRef = useRef(message.selectedOpeningId);
  selectedOpeningIdRef.current = message.selectedOpeningId;
  const options = message.openingOptions || [];
  const openingEnabled = message.canChangeOpening === true && Boolean(onSelectOpening);
  const showOpeningPager = openingEnabled && options.length > 1;
  const openingEnabledRef = useRef(openingEnabled);
  openingEnabledRef.current = openingEnabled;
  const editingEnabled = Boolean(onEdit) && (message.id !== "opening" || message.canChangeOpening === true);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === message.selectedOpeningId));
  const pagerSelectedIndex = Math.max(0, options.findIndex((option) => option.id === pagerOpeningId));
  const liveProcess = shouldShowInlineAgentProcess(message, displayContent)
    ? liveProcessPresentation(message.process)
    : null;
  const markdownTonePresentation = useMemo(
    () => prepareMarkdownTextTones(displayContent || ""),
    [displayContent],
  );
  const markdownRef = useRef(null);
  const requestedPage = Number(pageInput);
  const requestedIndex = Number.isInteger(requestedPage) ? requestedPage - 1 : -1;
  const requestedPageValid = requestedIndex >= 0 && requestedIndex < options.length;

  useEffect(() => setDraft(editableContent || ""), [editableContent]);
  useEffect(() => {
    const article = articleRef.current;
    const refresh = () => setPresentationRevision(value => value + 1);
    article.addEventListener('eleckoi:refresh-message', refresh);
    return () => article.removeEventListener('eleckoi:refresh-message', refresh);
  }, []);
  useLayoutEffect(() => {
    if (message.conversationId && message.id && !pending) window.dispatchEvent(new CustomEvent('eleckoi:message-rendered', {
      detail: { conversationId: message.conversationId, messageId: message.id, role },
    }));
  }, [message.conversationId, message.id, displayContent, pending, presentationRevision, role]);
  useEffect(() => {
    if (!openingEnabled) setJumpOpen(false);
    if (!editingEnabled) setEditing(false);
  }, [openingEnabled, editingEnabled]);
  useEffect(() => {
    if (!openingSwitchingRef.current) setPagerOpeningId(message.selectedOpeningId);
  }, [message.selectedOpeningId]);
  useLayoutEffect(() => {
    if (!displayContent || editing || liveProcess) return undefined;
    return registerMarkdownTextToneHighlights(
      markdownRef.current,
      markdownTonePresentation.underlineTexts,
    );
  }, [displayContent, editing, liveProcess, markdownTonePresentation, pending]);
  useEffect(() => {
    if (!expanded) return undefined;
    const close = (event) => { if (!toolsRef.current?.contains(event.target)) setExpanded(false); };
    const escape = (event) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); };
  }, [expanded]);
  useEffect(() => {
    if (!jumpOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePageJump();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(jumpDialogRef.current?.querySelectorAll("input, button:not(:disabled)") || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [jumpOpen]);

  function speak() {
    if (!displayContent || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(displayContent));
  }

  async function saveEdit() {
    if (!editingEnabled) return;
    const next = draft.trim();
    if (!next || next === content) { setEditing(false); return; }
    if (await onEdit?.(message, next)) setEditing(false);
  }
  function openProcess() {
    setExpanded(false);
    onOpenProcess?.(message);
  }
  function closePageJump(restoreFocus = true) {
    setJumpOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => jumpTriggerRef.current?.focus());
    }
  }
  async function selectOpeningAt(targetIndex) {
    const targetOption = options[targetIndex];
    if (!openingEnabledRef.current || !targetOption?.id || targetIndex === selectedIndex || openingSwitchingRef.current) return;

    openingSwitchingRef.current = true;
    setOpeningSwitching(true);
    const movingForward = targetIndex > selectedIndex;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let clearExit = () => {};

    try {
      const article = articleRef.current;
      if (!reduceMotion && article) {
        const range = article.getBoundingClientRect().width + 30;
        clearExit = await animateOpeningSlide(article, 0, movingForward ? -range : range, true);
      }

      if (!openingEnabledRef.current) return;
      await Promise.resolve(onSelectOpening?.(message, targetOption.id));
      await nextPaint();

      if (!reduceMotion && selectedOpeningIdRef.current === targetOption.id && articleRef.current) {
        const range = articleRef.current.getBoundingClientRect().width + 30;
        clearExit();
        clearExit = () => {};
        const clearEntry = await animateOpeningSlide(articleRef.current, movingForward ? range : -range, 0);
        clearEntry();
      }
    } catch (error) {
      console.error("Failed to switch opening message", error);
    } finally {
      clearExit();
      setPagerOpeningId(selectedOpeningIdRef.current);
      openingSwitchingRef.current = false;
      setOpeningSwitching(false);
    }
  }
  function submitPageJump(event) {
    event.preventDefault();
    if (!openingEnabled || !requestedPageValid) return;
    closePageJump(false);
    void selectOpeningAt(requestedIndex);
  }
  const openingPager = showOpeningPager ? <div className="opening-pager" aria-label="切换开场白" aria-busy={openingSwitching || undefined}>
    <button type="button" className="opening-pager-prev" disabled={!openingEnabled || openingSwitching || pagerSelectedIndex <= 0} onClick={() => { void selectOpeningAt(selectedIndex - 1); }} aria-label="上一条开场白"><FontAwesomeIcon icon={faChevronLeft} /></button>
    <button type="button" className="opening-pager-next" disabled={!openingEnabled || openingSwitching || pagerSelectedIndex >= options.length - 1} onClick={() => { void selectOpeningAt(selectedIndex + 1); }} aria-label="下一条开场白"><FontAwesomeIcon icon={faChevronRight} /></button>
    <button ref={jumpTriggerRef} type="button" className="opening-pager-index" disabled={!openingEnabled || openingSwitching} onClick={() => { setPageInput(String(pagerSelectedIndex + 1)); setJumpOpen(true); }} aria-label={`第 ${pagerSelectedIndex + 1} 条，共 ${options.length} 条开场白，点击跳转`}>{pagerSelectedIndex + 1}/{options.length}</button>
  </div> : null;
  const messageTools = !pending && layoutMode !== "agent" ? <div className={`message-tools${toolbar.presentedExpanded ? ' expanded' : ''}${toolbar.swapping ? ' swapping' : ''}`} ref={toolsRef}>
    <div className="message-tools-leading">
      {pluginActions}
      {toolbar.presentedExpanded ? <div className="message-tools-expanded">
        {!isUser && message.process?.length ? <button type="button" onClick={openProcess} aria-label="查看过程" title="查看过程"><HistoryIcon /></button> : null}
        {!isUser ? <TurnUsage usage={message.turnUsage} compact /> : null}
        <button type="button" onClick={() => navigator.clipboard?.writeText(displayContent || '')} aria-label="复制" title="复制"><CopyIcon /></button>
        {!isUser && message.id !== 'opening' ? <button type="button" onClick={() => onRegenerate?.(message)} aria-label="重新生成" title="重新生成"><RefreshMessageIcon /></button> : null}
        <button type="button" onClick={speak} aria-label="朗读" title="朗读"><SpeakerIcon /></button>
      </div> : null}
      {!mobileRoleplay || !toolbar.presentedExpanded ? <button type="button" onClick={() => setExpanded((value) => !value)} aria-label="更多" aria-expanded={expanded} title="更多"><MoreDotsIcon /></button> : null}
    </div>
    <button type="button" onClick={() => setEditing(true)} aria-label="编辑" title="编辑" disabled={!editingEnabled}><MessagePencilIcon /></button>
  </div> : null;
  return (
    <article
      ref={articleRef}
      data-message-id={message.id || undefined}
      className={`message ${isUser ? "mine" : "theirs"} message-${layoutMode} avatar-shape-${avatarShape}${toolbar.reserved ? " mobile-tools-reserved" : ""}${showOpeningPager ? " has-opening-pager" : ""}${layoutMode === "agent" && !isUser && isLatestAssistant ? " is-latest-assistant" : ""}`}
      style={Number.isFinite(spacingAfter) ? { marginBottom: `${spacingAfter}px` } : undefined}
    >
      {avatar
        ? <Avatar as="button" type="button" src={avatar} name={name} className="avatar-preview-trigger" onClick={() => setAvatarPreviewOpen(true)} aria-label={`放大${name || (isUser ? "你" : "助手")}的头像`} title="放大头像" />
        : <Avatar src={avatar} name={name} />}
      {roleplayFloor ? <span className="message-floor" aria-label={`消息楼层 ${floorNumber}`}>#{floorNumber}</span> : null}
      <div className="message-content">
        <div className="message-heading">
          {layoutMode === "roleplay" ? <div className="message-author-line">
            <header className="message-author">{name || (isUser ? "你" : "助手")}</header>
            {roleplayTimestamp ? <time className="message-timestamp" dateTime={message.created_at ?? message.createdAt}>{roleplayTimestamp}</time> : null}
          </div> : <header className="message-author">{name || (isUser ? "你" : "助手")}</header>}
          {layoutMode !== "roleplay" ? messageTools : null}
        </div>
        {isUser ? <ChatImageGallery images={message.inputImageAttachments || []} conversationId={message.conversationId} agentMessage={layoutMode === "agent"} loadImage={loadImage} /> : null}
        {isUser ? <ChatFileCards files={message.inputFileAttachments || []}
          onOpen={(file) => onOpenFile?.(message.conversationId, file.attachmentId, file.name)} /> : null}
        {editing ? <div className="message-inline-editor"><textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(editableContent || "");
              setEditing(false);
            } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              saveEdit();
            }
          }}
          autoFocus={typeof document === "undefined" || document.documentElement.dataset.eleckoiMobile !== "true"}
          aria-label="编辑消息"
        /><div><button type="button" onClick={() => { setDraft(editableContent || ''); setEditing(false); }}>取消</button><button type="button" className="primary" onClick={saveEdit}>保存</button></div></div> : liveProcess ? <button type="button" className="agent-process-inline" onClick={openProcess} aria-label={`查看处理过程：${liveProcess.title}`}>
          <AgentProcessIcon name={liveProcess.icon} size={liveProcess.icon === 'reasoning' ? 27 : 17} animated={liveProcess.icon === 'reasoning'} />
          <span className="agent-process-inline-label">{liveProcess.title}</span>
          <MessageChevronRightIcon size={14} />
        </button> : displayContent ? <div key={presentationRevision} ref={markdownRef} className="bubble markdown-message">
          {!isUser && message.generatedImageAttachments?.length ? generatedImageSegments(markdownTonePresentation.markdown, message.generatedImageAttachments, pending).map((segment, index) => segment.type === 'images'
            ? <ChatImageGallery key={`images-${index}`} images={segment.images} conversationId={message.conversationId} agentMessage={layoutMode === 'agent'} loadImage={loadImage} onRegenerateImage={onRegenerateImage} />
            : <MessagePresentation key={`text-${index}`} message={message} content={segment.content} streaming={pending} renderMessageContent={renderMessageContent} />) : <MessagePresentation
            message={message}
            content={markdownTonePresentation.markdown}
            streaming={pending}
            renderMessageContent={renderMessageContent}
          />}
        </div> : null}
        {!isUser && !pending && !displayContent && !editing ? <ChatImageGallery images={message.generatedImageAttachments || []} conversationId={message.conversationId} agentMessage={layoutMode === "agent"} loadImage={loadImage} onRegenerateImage={onRegenerateImage} /> : null}
        {pluginAfter}
        {layoutMode === "agent" && isUser && !pending && !editing ? <div className="agent-user-actions" aria-label="用户消息操作">
          <button type="button" onClick={() => navigator.clipboard?.writeText(displayContent || "")} aria-label="复制" title="复制" disabled={!displayContent}><CopyIcon /></button>
          <button type="button" onClick={() => setEditing(true)} aria-label="编辑" title="编辑" disabled={!editingEnabled}><AgentPencilIcon /></button>
        </div> : null}
        {layoutMode === "agent" && !isUser && !pending && !editing ? <div className="agent-message-footer" aria-label="消息操作">
          <div className="agent-message-footer-leading">
            {openingPager}
            <button type="button" onClick={() => navigator.clipboard?.writeText(displayContent || "")} aria-label="复制" title="复制" disabled={!displayContent}><CopyIcon /></button>
            {message.id !== "opening" ? <button type="button" onClick={() => onRegenerate?.(message)} aria-label="重新生成" title="重新生成" disabled={!onRegenerate}><RefreshMessageIcon /></button> : null}
            {message.process?.length ? <button type="button" onClick={openProcess} aria-label="查看过程" title="查看过程"><AgentHistoryIcon /></button> : null}
            <button type="button" onClick={speak} aria-label="朗读" title="朗读" disabled={!displayContent}><AgentSpeakerIcon /></button>
            <TurnUsage usage={message.turnUsage} compact />
            <button type="button" onClick={() => setEditing(true)} aria-label="编辑" title="编辑" disabled={!editingEnabled}><AgentPencilIcon /></button>
          </div>
        </div> : null}
      </div>
      {layoutMode === "roleplay" ? messageTools : null}
      {layoutMode !== "agent" ? openingPager : null}
      {avatarPreviewOpen && avatar ? <AvatarPreviewDialog src={avatar} name={name} onClose={() => setAvatarPreviewOpen(false)} onPin={onPinAvatar ? () => { onPinAvatar({ src: pinSrc || avatar, name }); setAvatarPreviewOpen(false); } : undefined} /> : null}
      {jumpOpen && typeof document !== "undefined" ? createPortal(
        <SystemBarOverlay className="opening-jump-backdrop" onPointerDown={() => closePageJump()}>
          <form ref={jumpDialogRef} className="opening-jump-dialog" role="dialog" aria-modal="true" aria-labelledby="opening-jump-title" onPointerDown={(event) => event.stopPropagation()} onSubmit={submitPageJump}>
            <h2 id="opening-jump-title">跳转开场白</h2>
            <label>页码（1–{options.length}）<input type="number" min="1" max={options.length} step="1" value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" autoFocus aria-invalid={Boolean(pageInput) && !requestedPageValid} aria-describedby={pageInput && !requestedPageValid ? "opening-jump-error" : undefined} /></label>
            {pageInput && !requestedPageValid ? <small id="opening-jump-error">请输入 1 到 {options.length}</small> : null}
            <div><button type="button" onClick={() => closePageJump()}>取消</button><button type="submit" className="primary" disabled={!openingEnabled || !requestedPageValid}>跳转</button></div>
          </form>
        </SystemBarOverlay>,
        document.body,
      ) : null}
    </article>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
