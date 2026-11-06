import { productLocaleTag } from '../../app/i18n/productCopy.js';
import { sourceText } from "../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { SystemBarOverlay } from '../ui/SystemBarOverlay.jsx';
import { useRegexEjsDisplay } from '../../modules/regex/index.js';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { OfficialMarkdown } from "./OfficialMarkdown.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { AvatarPreviewDialog } from "./AvatarPreviewDialog.jsx";
import { ViewProcessIcon, AgentPencilIcon, CopyIcon, MessageChevronRightIcon, MessagePencilIcon, MoreDotsIcon, RefreshMessageIcon } from "../icons/elecKoiMessageIcons.jsx";
import { AgentProcessStatus } from "../../modules/chat/components/AgentProcessStatus.jsx";
import { ChatImageGallery } from "./ChatImageGallery.jsx";
import { generatedImageSegments } from './generatedImagePresentation.js';
import { ChatFileCards } from "../../modules/chat/components/ChatFileCards.jsx";
import { TurnUsage } from "../../modules/chat/components/TurnUsage.jsx";
import { liveProcessPresentation, processItemPresentation, shouldShowInlineAgentProcess } from "../../modules/chat/model/agentProcessPresentation.js";
import { RichMessageFrame } from "../../modules/authorFrontend/index.js";
import { detectRichMessagePresentation } from "@shared/foundation/richMessage";
import { finalReplyText } from "@shared/foundation/finalReply";
import { normalizeMarkdownForRendering } from "./normalizeMarkdownForRendering.js";
import { prepareMarkdownTextTones, registerMarkdownTextToneHighlights } from "./markdownTextTones.js";
import { useMessageToolbarMotion } from "../hooks/useMessageToolbarMotion.js";

const OPENING_SWIPE_DURATION = 125;
const timestampFormatters = new Map();
const timestampFormatter = tUi => {
  const locale = productLocaleTag(tUi);
  if (!timestampFormatters.has(locale)) timestampFormatters.set(locale, new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }));
  return timestampFormatters.get(locale);
};

function formatMessageTimestamp(value, tUi = sourceText) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? timestampFormatter(tUi).format(date) : "";
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
  const generation = useMemo(() => ({ key: crypto.randomUUID(), presentation, messageId: message.id,
    conversationId: message.conversationId, source: message.content }), [presentation, message.id, message.conversationId, message.content]);
  const [committed, setCommitted] = useState(null);
  const [settled, setSettled] = useState({ presentation: null, parts: [] });
  const ready = settled.presentation === presentation
    && presentation.parts.filter(part => part.kind === 'rich').every(part => settled.parts.includes(part.id));
  const markSettled = id => setSettled(previous => {
    const parts = previous.presentation === presentation ? previous.parts : [];
    return parts.includes(id) ? previous : { presentation, parts: [...parts, id] };
  });
  useLayoutEffect(() => { if (ready) setCommitted(generation); }, [ready, generation]);
  const previous = !ready && committed && committed !== generation && committed.messageId === message.id
    && committed.conversationId === message.conversationId && committed.source === message.content ? committed : null;
  const layers = previous ? [previous, generation] : [generation];
  return <div style={{ position: 'relative' }}>
    {!ready && !previous ? renderMarkdown(fallback, 'frontend-pending') : null}
    {layers.map(layer => {
      let rootIndex = 0;
      const visible = layer === previous || ready;
      return <div key={layer.key} className="rich-message-presentation rich-message-staging" aria-hidden={!visible} inert={!visible}
        style={visible ? undefined : { position: 'absolute', insetInline: 0, top: 0, visibility: 'hidden' }}>
        {layer.presentation.parts.map(part => {
          if (part.kind !== 'rich') return renderMarkdown(part.source, part.id);
          return <RichMessageFrame key={part.id} message={message} document={part.document} rootIndex={rootIndex++}
            onSettled={layer === generation ? () => markSettled(part.id) : undefined} />;
        })}
      </div>;
    })}</div>;
}

function MessageBubbleComponent({ message = {}, avatar, pinSrc, name, layoutMode = "roleplay", avatarShape = "portrait", spacingAfter, floorNumber, showRoleplayTimestamp = true, showRoleplayFloor = true, isLatestAssistant = true, onOpenProcess, onPinAvatar, onSelectOpening, onEdit, onRegenerate, onRegenerateImage, onOpenFile, pluginActions, pluginAfter, renderMessageContent, loadImage }) {
  const tUi = useProductTranslation();
  const { role, content, pending = false } = message;
  const renderedDisplay = useRegexEjsDisplay(message, message.displayContent ?? content ?? '');
  const displayContent = renderedDisplay.content;
  const isUser = role === "user";
  const editableContent = !isUser && message.generatedImageAttachments?.length ? message.displayContent ?? content : content;
  const roleplayTimestamp = layoutMode === "roleplay" && showRoleplayTimestamp
    ? formatMessageTimestamp(message.created_at ?? message.createdAt, tUi)
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
    ? liveProcessPresentation(message.process, tUi)
    : null;
  const terminalItem = !isUser && !pending && message.process?.findLast(item =>
    item.toolName === 'turn_error' || item.toolName === 'turn_max_tokens');
  const terminalProcess = terminalItem ? { ...processItemPresentation(terminalItem, tUi), running: false } : null;
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
  const openingPager = showOpeningPager ? <div className="opening-pager" aria-label={tUi("切换开场白")} aria-busy={openingSwitching || undefined}>
    <button type="button" className="opening-pager-prev" disabled={!openingEnabled || openingSwitching || pagerSelectedIndex <= 0} onClick={() => { void selectOpeningAt(selectedIndex - 1); }} aria-label={tUi("上一条开场白")}><FontAwesomeIcon icon={faChevronLeft} /></button>
    <button type="button" className="opening-pager-next" disabled={!openingEnabled || openingSwitching || pagerSelectedIndex >= options.length - 1} onClick={() => { void selectOpeningAt(selectedIndex + 1); }} aria-label={tUi("下一条开场白")}><FontAwesomeIcon icon={faChevronRight} /></button>
    <button ref={jumpTriggerRef} type="button" className="opening-pager-index" disabled={!openingEnabled || openingSwitching} onClick={() => { setPageInput(String(pagerSelectedIndex + 1)); setJumpOpen(true); }} aria-label={tUi("第 {value0} 条，共 {value1} 条开场白，点击跳转", {value0: pagerSelectedIndex + 1, value1: options.length})}>{pagerSelectedIndex + 1}/{options.length}</button>
  </div> : null;
  const messageTools = !pending && layoutMode !== "agent" ? <div className={`message-tools${toolbar.presentedExpanded ? ' expanded' : ''}${toolbar.swapping ? ' swapping' : ''}`} ref={toolsRef}>
    <div className="message-tools-leading">
      {pluginActions}
      {toolbar.presentedExpanded ? <div className="message-tools-expanded">
        {!isUser && message.process?.length ? <button type="button" onClick={openProcess} aria-label={tUi("查看过程")} title={tUi("查看过程")}><ViewProcessIcon /></button> : null}
        {!isUser ? <TurnUsage usage={message.turnUsage} compact /> : null}
        <button type="button" onClick={() => navigator.clipboard?.writeText(displayContent || '')} aria-label={tUi("复制")} title={tUi("复制")}><CopyIcon emphasized={layoutMode === 'roleplay'} /></button>
        {!isUser && message.id !== 'opening' ? <button type="button" onClick={() => onRegenerate?.(message)} aria-label={tUi("重新生成")} title={tUi("重新生成")}><RefreshMessageIcon emphasized={layoutMode === 'roleplay'} /></button> : null}
      </div> : null}
      {!mobileRoleplay || !toolbar.presentedExpanded ? <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={tUi("更多")} aria-expanded={expanded} title={tUi("更多")}><MoreDotsIcon /></button> : null}
    </div>
    <button type="button" onClick={() => setEditing(true)} aria-label={tUi("编辑")} title={tUi("编辑")} disabled={!editingEnabled}><MessagePencilIcon /></button>
  </div> : null;
  return (
    <article
      ref={articleRef}
      className={`message ${isUser ? "mine" : "theirs"} message-${layoutMode} avatar-shape-${avatarShape}${toolbar.reserved ? " mobile-tools-reserved" : ""}${showOpeningPager ? " has-opening-pager" : ""}${layoutMode === "agent" && !isUser && isLatestAssistant ? " is-latest-assistant" : ""}`}
      style={Number.isFinite(spacingAfter) ? { marginBottom: `${spacingAfter}px` } : undefined}
    >
      {avatar
        ? <Avatar as="button" type="button" src={avatar} name={name} className="avatar-preview-trigger" onClick={() => setAvatarPreviewOpen(true)} aria-label={tUi("放大{value0}的头像", {value0: name || (isUser ? tUi("你") : tUi("助手"))})} title={tUi("放大头像")} />
        : <Avatar src={avatar} name={name} />}
      {roleplayFloor ? <span className="message-floor" aria-label={tUi("消息楼层 {value0}", {value0: floorNumber})}>#{floorNumber}</span> : null}
      <div className="message-content">
        <div className="message-heading">
          {layoutMode === "roleplay" ? <div className="message-author-line">
            <header className="message-author">{name || (isUser ? tUi("你") : tUi("助手"))}</header>
            {roleplayTimestamp ? <time className="message-timestamp" dateTime={message.created_at ?? message.createdAt}>{roleplayTimestamp}</time> : null}
          </div> : <header className="message-author">{name || (isUser ? tUi("你") : tUi("助手"))}</header>}
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
          aria-label={tUi("编辑消息")}
        /><div><button type="button" onClick={() => { setDraft(editableContent || ''); setEditing(false); }}>{tUi("取消")}</button><button type="button" className="primary" onClick={saveEdit}>{tUi("保存")}</button></div></div> : liveProcess ? <AgentProcessStatus presentation={liveProcess} onClick={openProcess} /> : displayContent ? <div ref={markdownRef} className="bubble markdown-message">
          {!isUser && message.generatedImageAttachments?.length ? generatedImageSegments(markdownTonePresentation.markdown, message.generatedImageAttachments, pending).map((segment, index) => segment.type === 'images'
            ? <ChatImageGallery key={`images-${index}`} images={segment.images} conversationId={message.conversationId} agentMessage={layoutMode === 'agent'} loadImage={loadImage} onRegenerateImage={onRegenerateImage} />
            : <MessagePresentation key={`text-${index}`} message={message} content={segment.content} streaming={pending || renderedDisplay.pending} renderMessageContent={renderMessageContent} />) : <MessagePresentation
            message={message}
            content={markdownTonePresentation.markdown}
            streaming={pending || renderedDisplay.pending}
            renderMessageContent={renderMessageContent}
          />}
        </div> : null}
        {!editing && terminalProcess ? <AgentProcessStatus presentation={terminalProcess} onClick={openProcess} /> : null}
        {!isUser && !pending && !displayContent && !editing ? <ChatImageGallery images={message.generatedImageAttachments || []} conversationId={message.conversationId} agentMessage={layoutMode === "agent"} loadImage={loadImage} onRegenerateImage={onRegenerateImage} /> : null}
        {renderedDisplay.error ? <pre className="script-execution-error" role="alert">{renderedDisplay.error}</pre> : null}
        {pluginAfter}
        {layoutMode === "agent" && isUser && !pending && !editing ? <div className="agent-user-actions" aria-label={tUi("用户消息操作")}>
          <button type="button" onClick={() => navigator.clipboard?.writeText(displayContent || "")} aria-label={tUi("复制")} title={tUi("复制")} disabled={!displayContent}><CopyIcon /></button>
          <button type="button" onClick={() => setEditing(true)} aria-label={tUi("编辑")} title={tUi("编辑")} disabled={!editingEnabled}><AgentPencilIcon /></button>
        </div> : null}
        {layoutMode === "agent" && !isUser && !pending && !editing ? <div className="agent-message-footer" aria-label={tUi("消息操作")}>
          <div className="agent-message-footer-leading">
            {openingPager}
            <button type="button" onClick={() => navigator.clipboard?.writeText(displayContent || "")} aria-label={tUi("复制")} title={tUi("复制")} disabled={!displayContent}><CopyIcon /></button>
            {message.id !== "opening" ? <button type="button" onClick={() => onRegenerate?.(message)} aria-label={tUi("重新生成")} title={tUi("重新生成")} disabled={!onRegenerate}><RefreshMessageIcon /></button> : null}
            {message.process?.length ? <button type="button" onClick={openProcess} aria-label={tUi("查看过程")} title={tUi("查看过程")}><ViewProcessIcon /></button> : null}
            <TurnUsage usage={message.turnUsage} compact />
            <button type="button" onClick={() => setEditing(true)} aria-label={tUi("编辑")} title={tUi("编辑")} disabled={!editingEnabled}><AgentPencilIcon /></button>
          </div>
        </div> : null}
      </div>
      {layoutMode === "roleplay" ? messageTools : null}
      {layoutMode !== "agent" ? openingPager : null}
      {avatarPreviewOpen && avatar ? <AvatarPreviewDialog src={avatar} name={name} onClose={() => setAvatarPreviewOpen(false)} onPin={onPinAvatar ? () => { onPinAvatar({ src: pinSrc || avatar, name }); setAvatarPreviewOpen(false); } : undefined} /> : null}
      {jumpOpen && typeof document !== "undefined" ? createPortal(
        <SystemBarOverlay className="opening-jump-backdrop" onPointerDown={() => closePageJump()}>
          <form ref={jumpDialogRef} className="opening-jump-dialog" role="dialog" aria-modal="true" aria-labelledby="opening-jump-title" onPointerDown={(event) => event.stopPropagation()} onSubmit={submitPageJump}>
            <h2 id="opening-jump-title">{tUi("跳转开场白")}</h2>
            <label>{tUi("页码（1–")}{options.length}）<input type="number" min="1" max={options.length} step="1" value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ''))} inputMode="numeric" autoFocus aria-invalid={Boolean(pageInput) && !requestedPageValid} aria-describedby={pageInput && !requestedPageValid ? "opening-jump-error" : undefined} /></label>
            {pageInput && !requestedPageValid ? <small id="opening-jump-error">{tUi("请输入 1 到 ")}{options.length}</small> : null}
            <div><button type="button" onClick={() => closePageJump()}>{tUi("取消")}</button><button type="submit" className="primary" disabled={!openingEnabled || !requestedPageValid}>{tUi("跳转")}</button></div>
          </form>
        </SystemBarOverlay>,
        document.body,
      ) : null}
    </article>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
