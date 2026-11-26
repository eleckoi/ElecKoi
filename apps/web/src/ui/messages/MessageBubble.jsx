import { productLocaleTag } from '../../app/i18n/productCopy.js';
import { sourceText } from "../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../styles/product-dialogs.css';
import { useRegexEjsDisplay } from '../../modules/regex/index.js';
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { OfficialMarkdown } from "./OfficialMarkdown.jsx";
import { groupRoleplayReplyBlocks, messageRoleplayBlocks, roleplayGroupText } from './roleplayReplyGroups.js';
import { Avatar } from "../ui/Avatar.jsx";
import { AvatarPreviewDialog } from "./AvatarPreviewDialog.jsx";
import { AvatarActionsMenu } from "./AvatarActionsMenu.jsx";
import { ViewProcessIcon, AgentMessageActionIcon, CopyIcon, MessagePencilIcon, MoreDotsIcon, RefreshMessageIcon } from "../icons/elecKoiMessageIcons.jsx";
import { AgentProcessStatus } from "../../modules/chat/components/AgentProcessStatus.jsx";
import { ChatImageGallery } from "./ChatImageGallery.jsx";
import { generatedImagesByBlock, generatedImageSegments } from './generatedImagePresentation.js';
import { ChatFileCards } from "../../modules/chat/components/ChatFileCards.jsx";
import { TurnUsage } from "../../modules/chat/components/TurnUsage.jsx";
import { processItemPresentation } from "../../modules/chat/model/agentProcessPresentation.js";
import { RichMessageFrame } from "../../modules/authorFrontend/index.js";
import { detectRichMessagePresentation } from "@shared/foundation/richMessage";
import { finalReplyText } from "@shared/foundation/finalReply";
import { characterAssetBaseUrl } from "@shared/foundation/characterAssetReference";
import { resolveChatAvatar } from "../../modules/appearance/preferences/chatDisplay.js";
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

async function animateOpeningSlide(article, followups, fromX, toX, freezeAtEnd = false) {
  const rows = [article, ...Array.from(followups?.children ?? [])];
  const elements = rows.flatMap(row => {
    const content = row.querySelector(":scope > .message-content");
    return [
      row.querySelector(":scope > .avatar"),
      row.querySelector(":scope > .message-floor"),
      ...(content && window.getComputedStyle(content).display === "contents" ? [...content.children] : [content]),
    ];
  }).filter(Boolean);
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
    : message.roleplayReply ? message.content || '' : finalReplyText(message.content || '');
  return <SettledRichPresentation message={message} presentation={presentation} renderMarkdown={renderMarkdown} fallback={fallback} />;
}

function MessageSegmentText({ message, segment, renderMessageContent, images, layoutMode, loadImage, onRegenerateImage }) {
  const segmentMessage = { ...message, content: segment.text };
  const display = useRegexEjsDisplay(segmentMessage, segment.displayContent ?? segment.text);
  const ref = useRef(null);
  const { markdown, underlineTexts } = useMemo(() => prepareMarkdownTextTones(display.content), [display.content]);
  useLayoutEffect(() => registerMarkdownTextToneHighlights(ref.current, underlineTexts), [underlineTexts]);
  const streaming = message.pending || display.pending;
  return <div ref={ref} className="bubble markdown-message">
    {images?.length ? generatedImageSegments(markdown, images, streaming).map((part, index) => part.type === 'images'
      ? <ChatImageGallery key={`images-${index}`} images={part.images} conversationId={message.conversationId}
        agentMessage={layoutMode === 'agent'} loadImage={loadImage} onRegenerateImage={onRegenerateImage} />
      : <MessagePresentation key={`text-${index}`} message={segmentMessage} content={part.content} streaming={streaming}
        renderMessageContent={renderMessageContent} />)
      : <MessagePresentation message={segmentMessage} content={markdown} streaming={streaming}
        renderMessageContent={renderMessageContent} />}
    {display.error && <pre className="script-execution-error" role="alert">{display.error}</pre>}
  </div>;
}

function openingSpeaker(segment, character, avatarShape, fallback, tUi) {
  if (!segment) return fallback;
  if (segment.kind === 'cover') return {
    name: segment.speakerName || fallback.name,
    avatar: fallback.avatar || segment.speakerAvatar,
    pinSrc: fallback.pinSrc || segment.speakerAvatar,
  };
  const matches = segment.speakerId ? undefined : character?.cast?.filter(member => member.name === segment.speakerName);
  const role = segment.speakerId ? character?.cast?.find(member => member.id === segment.speakerId)
    : matches?.length === 1 ? matches[0] : undefined;
  if (!role && !segment.speakerId && segment.speakerName && segment.speakerName === fallback.name) return fallback;
  const name = segment.speakerName || role?.name || tUi('角色已移除');
  if (!role || !character.id) return {
    name, avatar: segment.speakerAvatar, crop: avatarShape !== 'portrait' ? segment.speakerCrop : undefined,
  };
  const base = characterAssetBaseUrl(character.id);
  const asUrl = assetId => assetId ? base + assetId : '';
  const portrait = asUrl(role.portraitAssetId);
  const circle = asUrl(role.circleAssetId);
  const square = asUrl(role.squareAssetId);
  const avatar = resolveChatAvatar({ assistant_cover: portrait, assistant_avatar: circle, assistant_square: square }, 'assistant', avatarShape)
    || portrait || segment.speakerAvatar;
  return { name, avatar, pinSrc: portrait || avatar,
    crop: avatarShape !== 'portrait' && avatar && avatar === portrait && !circle && !square ? role.crop : undefined };
}

function MessageAvatar({ identity, isUser, onEditCharacter, onPinAvatar }) {
  const tUi = useProductTranslation();
  const [anchor, setAnchor] = useState(null);
  const [preview, setPreview] = useState(false);
  if (!identity) return null;
  const { avatar, name, crop, pinSrc } = identity;
  return <>
    {avatar || onEditCharacter
      ? <Avatar as="button" type="button" src={avatar} name={name} crop={crop} className="avatar-preview-trigger"
        onClick={event => { const trigger = event.currentTarget; onEditCharacter ? setAnchor(current => current ? null : trigger) : setPreview(true); }}
        aria-haspopup={onEditCharacter ? 'menu' : undefined} aria-expanded={onEditCharacter ? Boolean(anchor) : undefined}
        aria-label={onEditCharacter ? tUi("{name}的快捷入口", { name: name || tUi('角色') })
          : tUi("放大{value0}的头像", { value0: name || tUi(isUser ? '你' : '助手') })}
        title={onEditCharacter ? tUi("角色快捷入口") : tUi("放大头像")} />
      : <Avatar src={avatar} name={name} />}
    {anchor && onEditCharacter ? <AvatarActionsMenu anchor={anchor} canView={Boolean(avatar)}
      onClose={() => setAnchor(null)} onView={() => setPreview(true)} onEdit={onEditCharacter} /> : null}
    {preview && avatar ? <AvatarPreviewDialog src={avatar} name={name} onClose={() => setPreview(false)}
      onPin={onPinAvatar ? () => { onPinAvatar({ src: pinSrc || avatar, name }); setPreview(false); } : undefined} /> : null}
  </>;
}

function MessageHeading({ layoutMode, name, timestamp, createdAt, children }) {
  if (!name && !timestamp && !children) return null;
  const author = name ? <header className="message-author">{name}</header> : null;
  return <div className="message-heading">
    {layoutMode === 'roleplay' ? <div className="message-author-line">
      {author}{timestamp ? <time className="message-timestamp" dateTime={createdAt}>{timestamp}</time> : null}
    </div> : author}
    {children}
  </div>;
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

function MessageBubbleComponent({ message = {}, avatar, pinSrc, name, openingCharacter, layoutMode = "roleplay", avatarShape = "portrait", spacingAfter, floorNumber, showRoleplayTimestamp = true, showRoleplayFloor = true, isLatestAssistant = true, onOpenProcess, onPinAvatar, onEditCharacter, onSelectOpening, onEdit, onRegenerate, onRegenerateImage, onOpenFile, pluginActions, pluginAfter, renderMessageContent, renderMessageEditor, loadImage }) {
  const tUi = useProductTranslation();
  const { role, content, pending = false } = message;
  const renderedDisplay = useRegexEjsDisplay(message, message.displayContent ?? content ?? '');
  const displayContent = renderedDisplay.content;
  const isUser = role === "user";
  const replyBlocks = message.roleplayBlocks;
  const multipart = (replyBlocks?.length ?? 0) > 1;
  const editableContent = replyBlocks?.length === 1 ? replyBlocks[0].text
    : !isUser && message.generatedImageAttachments?.length ? message.displayContent ?? content : content;
  const roleplayTimestamp = layoutMode === "roleplay" && showRoleplayTimestamp
    ? formatMessageTimestamp(message.created_at ?? message.createdAt, tUi)
    : "";
  const roleplayFloor = layoutMode === "roleplay" && showRoleplayFloor
    && Number.isSafeInteger(floorNumber) && floorNumber >= 0;
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editableContent || "");
  const [draftBlocks, setDraftBlocks] = useState([]);
  const [jumpOpen, setJumpOpen] = useState(false);
  const editCharacterFromAvatar = (layoutMode === 'roleplay' || layoutMode === 'agent') && !isUser ? onEditCharacter : undefined;
  const [pageInput, setPageInput] = useState("");
  const [openingSwitching, setOpeningSwitching] = useState(false);
  const [pagerOpeningId, setPagerOpeningId] = useState(message.selectedOpeningId);
  const articleRef = useRef(null);
  const followupsRef = useRef(null);
  const toolsRef = useRef(null);
  const mobileRoleplay = layoutMode === "roleplay" && typeof document !== "undefined" && document.documentElement.dataset.eleckoiMobile === "true";
  const toolbar = useMessageToolbarMotion(expanded, mobileRoleplay, toolsRef, articleRef, !pending);
  const jumpTriggerRef = useRef(null);
  const openingSwitchingRef = useRef(false);
  const selectedOpeningIdRef = useRef(message.selectedOpeningId);
  selectedOpeningIdRef.current = message.selectedOpeningId;
  const options = message.openingOptions || [];
  const openingScene = message.id === 'opening' ? messageRoleplayBlocks(message) : undefined;
  const groupedReply = layoutMode === 'roleplay' && Boolean(replyBlocks);
  const groups = groupRoleplayReplyBlocks(openingScene ?? replyBlocks, pending);
  if (replyBlocks && !openingScene) {
    const displays = new Map(message.roleplayGroups?.map(display => [display.id, display]));
    for (const group of groups) {
      const { id } = group.blocks[0];
      const text = roleplayGroupText(group.blocks);
      const display = displays.get(id);
      group.mergedSegment = { id, text, displayContent: !pending && display?.sourceText === text ? display.displayText : undefined };
    }
  }
  const segments = (openingScene ?? groups.map(group => group.mergedSegment)).filter(segment => segment?.text.trim());
  const [firstGroup, ...laterGroups] = groups;
  const firstSegment = firstGroup?.blocks[0];
  const imagesByBlock = generatedImagesByBlock(segments, message.generatedImageAttachments, pending);
  const renderSegment = segment => <MessageSegmentText message={message} segment={segment} renderMessageContent={renderMessageContent}
    images={imagesByBlock.get(segment.id)} layoutMode={layoutMode} loadImage={loadImage} onRegenerateImage={onRegenerateImage} />;
  const fallbackIdentity = { avatar, pinSrc, name };
  const identity = openingSpeaker(firstGroup?.speaker, openingCharacter, avatarShape, fallbackIdentity, tUi);
  const messageClass = `message ${isUser ? 'mine' : 'theirs'} message-${layoutMode} avatar-shape-${avatarShape}${groupedReply ? ' roleplay-reply-part' : ''}`;
  const openingEnabled = message.canChangeOpening === true && Boolean(onSelectOpening);
  const showOpeningPager = openingEnabled && options.length > 1;
  const openingEnabledRef = useRef(openingEnabled);
  openingEnabledRef.current = openingEnabled;
  const editingEnabled = Boolean(onEdit)
    && (message.id !== "opening" || message.canChangeOpening === true && (openingScene?.length ?? 0) <= 1);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === message.selectedOpeningId));
  const pagerSelectedIndex = Math.max(0, options.findIndex((option) => option.id === pagerOpeningId));
  const terminalItem = !isUser && !pending && message.process?.findLast(item =>
    item.toolName === 'turn_error' || item.toolName === 'turn_max_tokens');
  const terminalProcess = terminalItem ? { ...processItemPresentation(terminalItem, tUi), running: false } : null;
  const markdownTonePresentation = useMemo(
    () => prepareMarkdownTextTones(displayContent || ""),
    [displayContent],
  );
  const markdownRef = useRef(null);
  const toneHighlightsRef = useRef(null);
  const toneHighlightsEnabled = Boolean(displayContent && !editing && !firstSegment);
  const requestedPage = Number(pageInput);
  const requestedIndex = Number.isInteger(requestedPage) ? requestedPage - 1 : -1;
  const requestedPageValid = requestedIndex >= 0 && requestedIndex < options.length;

  useEffect(() => { if (editing && !multipart) setDraft(editableContent || ""); }, [editableContent, editing, multipart]);
  useEffect(() => {
    if (!openingEnabled) setJumpOpen(false);
    if (!editingEnabled) setEditing(false);
  }, [openingEnabled, editingEnabled]);
  useEffect(() => {
    if (!openingSwitchingRef.current) setPagerOpeningId(message.selectedOpeningId);
  }, [message.selectedOpeningId]);
  useLayoutEffect(() => {
    if (!toneHighlightsEnabled) return undefined;
    const dispose = registerMarkdownTextToneHighlights(
      markdownRef.current,
      markdownTonePresentation.underlineTexts,
    );
    toneHighlightsRef.current = dispose;
    return () => { dispose();toneHighlightsRef.current = null; };
  }, [toneHighlightsEnabled]);
  useLayoutEffect(() => { toneHighlightsRef.current?.update?.(markdownTonePresentation.underlineTexts); }, [markdownTonePresentation.underlineTexts]);
  useEffect(() => {
    if (!expanded) return undefined;
    const close = (event) => { if (!toolsRef.current?.contains(event.target)) setExpanded(false); };
    const escape = (event) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); };
  }, [expanded]);


  function beginEdit() {
    if (editing) return;
    if (multipart) setDraftBlocks(replyBlocks.map(({ id, text }) => ({ id, text })));
    else setDraft(editableContent || '');
    setEditing(true);
  }
  async function saveEdit() {
    if (!editingEnabled) return;
    if (multipart) {
      if (draftBlocks.some(block => !block.text.trim())) return;
      if (draftBlocks.every((block, index) => block.text === replyBlocks[index]?.text) || await onEdit(message, draftBlocks)) {
        setEditing(false);
      }
      return;
    }
    const next = draft.trim();
    if (!next || next === editableContent) { setEditing(false); return; }
    if (await onEdit?.(message, next)) setEditing(false);
  }
  function cancelEdit() {
    setDraft(editableContent || '');
    setEditing(false);
  }
  function editKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void saveEdit();
    }
  }
  const focusEditor = typeof document === 'undefined' || document.documentElement.dataset.eleckoiMobile !== 'true';
  const editActions = <div><button type="button" onClick={cancelEdit}>{tUi('取消')}</button>
    <button type="button" className="primary" onClick={saveEdit}
      disabled={multipart && draftBlocks.some(block => !block.text.trim())}>{tUi('保存')}</button></div>;
  function renderBlockEditor(segment, speaker, first, last) {
    return <div className="message-inline-editor"><textarea
      value={draftBlocks.find(block => block.id === segment.id)?.text ?? segment.text}
      onChange={event => {
        const text = event.target.value;
        setDraftBlocks(blocks => blocks.map(block => block.id === segment.id ? { ...block, text } : block));
      }}
      onKeyDown={editKeyDown}
      autoFocus={first && focusEditor}
      aria-label={speaker?.name ? `${tUi('编辑消息')} · ${speaker.name}` : tUi('编辑消息')}
    />{last ? editActions : null}</div>;
  }
  function renderEditor() {
    const fallback = <div className="message-inline-editor"><textarea
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onKeyDown={editKeyDown}
      autoFocus={focusEditor}
      aria-label={tUi('编辑消息')}
    />{editActions}</div>;
    const editor = renderMessageEditor?.(message, { draft, onDraftChange: setDraft, onSave: saveEdit, onCancel: cancelEdit }, fallback) ?? fallback;
    return layoutMode === "agent" ? <div className="message-editor-seat">{editor}</div> : editor;
  }
  function openProcess() {
    if (mobileRoleplay) toolbar.collapseBeforeDialog();
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
        clearExit = await animateOpeningSlide(article, followupsRef.current, 0, movingForward ? -range : range, true);
      }

      if (!openingEnabledRef.current) return;
      await Promise.resolve(onSelectOpening?.(message, targetOption.id));
      await nextPaint();

      if (!reduceMotion && selectedOpeningIdRef.current === targetOption.id && articleRef.current) {
        const range = articleRef.current.getBoundingClientRect().width + 30;
        clearExit();
        clearExit = () => {};
        const clearEntry = await animateOpeningSlide(articleRef.current, followupsRef.current, movingForward ? range : -range, 0);
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
    <button type="button" onClick={beginEdit} aria-label={tUi("编辑")} title={tUi("编辑")} disabled={!editingEnabled}><MessagePencilIcon /></button>
  </div> : null;
  const assistantFooter = layoutMode === "agent" && !isUser && !pending && !editing ? <div className="agent-message-footer" aria-label={tUi("消息操作")}>
    <div className="agent-message-footer-leading">
      {openingPager}
      <button type="button" onClick={() => navigator.clipboard?.writeText(displayContent || "")} aria-label={tUi("复制")} title={tUi("复制")} disabled={!displayContent}><AgentMessageActionIcon action="copy" /></button>
      {message.id !== "opening" ? <button type="button" onClick={() => onRegenerate?.(message)} aria-label={tUi("重新生成")} title={tUi("重新生成")} disabled={!onRegenerate}><AgentMessageActionIcon action="refresh" /></button> : null}
      {message.process?.length ? <button type="button" onClick={openProcess} aria-label={tUi("查看过程")} title={tUi("查看过程")}><ViewProcessIcon /></button> : null}
      <TurnUsage usage={message.turnUsage} compact emphasized />
      <button type="button" onClick={beginEdit} aria-label={tUi("编辑")} title={tUi("编辑")} disabled={!editingEnabled}><AgentMessageActionIcon action="edit" /></button>
    </div>
  </div> : null;
  const renderFloor = number => roleplayFloor
    ? <span className="message-floor" aria-label={tUi("消息楼层 {value0}", {value0: number})}>#{number}</span> : null;
  const renderGroup = (group, speaker, first, last) => {
    if (!editing && group.mergedSegment) {
      if (group.mergedSegment.text) return renderSegment(group.mergedSegment);
      if (!isUser && pending && last) {
        return <div className="chat-reply-waiting" role="status" aria-label={tUi("正在回复...")}>
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </div>;
      }
      return null;
    }
    return group.blocks.map((segment, index) => <Fragment key={segment.id}>
      {editing && multipart ? renderBlockEditor(segment, speaker, first && index === 0, last && index === group.blocks.length - 1)
        : segment.text.trim() ? renderSegment(segment) : null}
    </Fragment>);
  };
  const hasFollowups = laterGroups.length > 0;
  const hasPagerClass = showOpeningPager ? " has-opening-pager" : "";
  const SegmentContainer = groupedReply ? 'div' : 'article';
  const markup = (
    <>
    <SegmentContainer
      ref={articleRef}
      className={`${messageClass}${toolbar.reserved ? " mobile-tools-reserved" : ""}${hasFollowups ? "" : hasPagerClass}${layoutMode === "agent" && !isUser && isLatestAssistant ? " is-latest-assistant" : ""}`}
      data-opening-segment={openingScene ? firstGroup?.speaker?.kind ?? 'cover' : undefined}
      data-roleplay-block={replyBlocks ? firstGroup?.speaker?.kind ?? 'cover' : undefined}
      style={!groupedReply && !hasFollowups && Number.isFinite(spacingAfter) ? { marginBottom: `${spacingAfter}px` } : undefined}
    >
      <MessageAvatar key={JSON.stringify([message.conversationId, message.id, message.selectedOpeningId, firstSegment?.id])}
        identity={identity} isUser={isUser} onEditCharacter={editCharacterFromAvatar} onPinAvatar={onPinAvatar} />
      {renderFloor(floorNumber)}
      <div className="message-content">
        <MessageHeading layoutMode={layoutMode} name={identity ? identity.name || tUi(isUser ? '你' : '助手') : undefined}
          timestamp={roleplayTimestamp} createdAt={message.created_at ?? message.createdAt}>
          {layoutMode !== "roleplay" ? messageTools : null}
        </MessageHeading>
        {isUser ? <ChatImageGallery images={message.inputImageAttachments || []} conversationId={message.conversationId} agentMessage={layoutMode === "agent"} loadImage={loadImage} /> : null}
        {isUser ? <ChatFileCards files={message.inputFileAttachments || []}
          onOpen={(file) => onOpenFile?.(message.conversationId, file.attachmentId, file.name)} /> : null}
        {editing && !multipart ? renderEditor() : firstGroup ? renderGroup(firstGroup, identity, true, !hasFollowups)
          : displayContent ? <div ref={markdownRef} className="bubble markdown-message">
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
        {!firstSegment && renderedDisplay.error ? <pre className="script-execution-error" role="alert">{renderedDisplay.error}</pre> : null}
        {pluginAfter}
        {layoutMode === "agent" && isUser && !pending && !editing ? <div className="agent-user-actions" aria-label={tUi("用户消息操作")}>
          <button type="button" onClick={() => navigator.clipboard?.writeText(displayContent || "")} aria-label={tUi("复制")} title={tUi("复制")} disabled={!displayContent}><AgentMessageActionIcon action="copy" /></button>
          <button type="button" onClick={beginEdit} aria-label={tUi("编辑")} title={tUi("编辑")} disabled={!editingEnabled}><AgentMessageActionIcon action="edit" /></button>
        </div> : null}
        {!hasFollowups ? assistantFooter : null}
      </div>
      {layoutMode === "roleplay" ? messageTools : null}
      {!hasFollowups && layoutMode !== "agent" ? openingPager : null}
      <Modal open={jumpOpen} title={tUi('跳转开场白')} closeLabel={tUi('关闭')} onClose={() => closePageJump()}
        className="product-dialog" contentClassName="product-dialog-content" footer={<div className="product-dialog-actions">
          <Button variant="outline" onClick={() => closePageJump()}>{tUi('取消')}</Button>
          <Button variant="primary" disabled={!openingEnabled || !requestedPageValid} onClick={submitPageJump}>{tUi('跳转')}</Button>
        </div>}>
        <form className="product-dialog-fields" onSubmit={submitPageJump}><label><span>{tUi('页码（1–')}{options.length}）</span>
          <Input className="product-dialog-field" data-modal-autofocus type="number" min="1" max={options.length} step="1" value={pageInput} onChange={event => setPageInput(event.target.value.replace(/\D/g, ''))} inputMode="numeric" aria-invalid={Boolean(pageInput) && !requestedPageValid} aria-describedby={pageInput && !requestedPageValid ? 'opening-jump-error' : undefined} />
        </label>{pageInput && !requestedPageValid ? <small className="product-dialog-error" id="opening-jump-error">{tUi('请输入 1 到 ')}{options.length}</small> : null}</form>
      </Modal>
    </SegmentContainer>
    {hasFollowups && <div ref={followupsRef} className={groupedReply ? 'roleplay-reply-followups' : 'opening-message-followups'}
      style={!groupedReply && Number.isFinite(spacingAfter) ? { marginBottom: `${spacingAfter}px` } : undefined}>
      {laterGroups.map((group, index) => {
        const segment = group.blocks[0];
        const speaker = openingSpeaker(group.speaker, openingCharacter, avatarShape, fallbackIdentity, tUi);
        const last = index === laterGroups.length - 1;
        return <SegmentContainer key={segment.id} data-opening-segment={openingScene ? group.speaker?.kind ?? 'cover' : undefined}
          data-roleplay-block={replyBlocks ? group.speaker?.kind ?? 'cover' : undefined}
          className={`${messageClass}${last ? hasPagerClass : ""}${layoutMode === "agent" && isLatestAssistant ? " is-latest-assistant" : ""}`}>
          <MessageAvatar identity={speaker} onEditCharacter={editCharacterFromAvatar} onPinAvatar={onPinAvatar} />
          {renderFloor(floorNumber + index + 1)}
          <div className="message-content">
            <MessageHeading layoutMode={layoutMode} name={speaker?.name}
              timestamp={roleplayTimestamp} createdAt={message.created_at ?? message.createdAt} />
            {renderGroup(group, speaker, false, last)}
            {last ? assistantFooter : null}
          </div>
          {last && layoutMode !== "agent" ? openingPager : null}
        </SegmentContainer>;
      })}
    </div>}
    </>
  );
  return groupedReply ? <article className="roleplay-reply-turn"
    style={Number.isFinite(spacingAfter) ? { marginBottom: `${spacingAfter}px` } : undefined}>{markup}</article> : markup;
}

export const MessageBubble = memo(MessageBubbleComponent);
