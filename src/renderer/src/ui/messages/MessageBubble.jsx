import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Streamdown } from "streamdown";
import { Avatar } from "../ui/Avatar.jsx";
import { CopyIcon, HistoryIcon, MessageChevronRightIcon, MessagePencilIcon, MoreDotsIcon, RefreshMessageIcon, SpeakerIcon } from "../icons/elecKoiMessageIcons.jsx";
import { AgentProcessIcon } from "../../modules/chat/components/AgentProcessIcon.jsx";
import { ChatImageGallery } from "../../modules/chat/components/ChatImageGallery.jsx";
import { liveProcessPresentation, shouldShowInlineAgentProcess } from "../../modules/chat/model/agentProcessPresentation.js";
import { RichMessageFrame } from "../../modules/authorFrontend/index.js";
import { detectRichMessagePresentation } from "@shared/foundation/richMessage";

const markdownComponents = {
  a({ children, href, node: _node, ...props }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  },
  table({ children, node: _node, ...props }) {
    return (
      <div className="message-table-scroll">
        <table {...props}>{children}</table>
      </div>
    );
  },
};

const DIALOGUE_QUOTE_PATTERN = /("[^"\n]*?")|(“[^”\n]*?”)|(«[^»\n]*?»)|(「[^」\n]*?」)|(『[^』\n]*?』)|(＂[^＂\n]*?＂)/g;

function quoteTextNodes(value) {
  const children = [];
  let cursor = 0;
  for (const match of value.matchAll(DIALOGUE_QUOTE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) children.push({ type: "text", value: value.slice(cursor, index) });
    children.push({
      type: "eleckoiQuote",
      data: { hName: "q" },
      children: [{ type: "text", value: match[0] }],
    });
    cursor = index + match[0].length;
  }
  if (cursor === 0) return null;
  if (cursor < value.length) children.push({ type: "text", value: value.slice(cursor) });
  return children;
}

function wrapUnderlineNodes(node) {
  if (!Array.isArray(node?.children)) return;
  for (let index = 0; index < node.children.length; index += 1) {
    const opening = node.children[index];
    if (opening?.type !== "html" || !/^<u\s*>$/i.test(opening.value || "")) continue;
    const closingIndex = node.children.findIndex((candidate, candidateIndex) => (
      candidateIndex > index
      && candidate?.type === "html"
      && /^<\/u\s*>$/i.test(candidate.value || "")
    ));
    if (closingIndex < 0) continue;
    node.children.splice(index, closingIndex - index + 1, {
      type: "eleckoiUnderline",
      data: { hName: "ins" },
      children: node.children.slice(index + 1, closingIndex),
    });
  }
}

export function remarkDialogueQuotes() {
  return (tree) => {
    const visitChildren = (node) => {
      if (!Array.isArray(node?.children)) return;
      wrapUnderlineNodes(node);
      for (let index = 0; index < node.children.length; index += 1) {
        const child = node.children[index];
        if (child?.type === "text") {
          const replacement = quoteTextNodes(child.value || "");
          if (replacement) {
            node.children.splice(index, 1, ...replacement);
            index += replacement.length - 1;
          }
        } else {
          visitChildren(child);
        }
      }
    };
    visitChildren(tree);
  };
}

const OPENING_SWIPE_DURATION = 125;

function nextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
}

async function animateOpeningSlide(article, fromX, toX, freezeAtEnd = false) {
  const elements = [
    article?.querySelector(":scope > .avatar"),
    article?.querySelector(":scope > .message-content"),
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

function MarkdownMessage({ content, streaming }) {
  return (
    <Streamdown
      className="eleckoi-streamdown"
      mode={streaming ? "streaming" : "static"}
      parseIncompleteMarkdown={streaming}
      isAnimating={false}
      controls={false}
      lineNumbers={false}
      codeBlockMaxHeight="none"
      linkSafety={{ enabled: false }}
      skipHtml
      remarkPlugins={[remarkGfm, remarkBreaks, remarkDialogueQuotes]}
      components={markdownComponents}
    >
      {content || ""}
    </Streamdown>
  );
}

function MessagePresentation({ message, content, streaming }) {
  const presentation = useMemo(
    () => message.role === "assistant"
      ? detectRichMessagePresentation(content || "", streaming)
      : null,
    [content, message.role, streaming],
  );
  if (message.role !== "assistant") return <MarkdownMessage content={content} streaming={streaming} />;
  if (!presentation) return <MarkdownMessage content={content} streaming={streaming} />;
  let rootIndex = 0;
  return <div className="rich-message-presentation">{presentation.parts.map((part) => {
    if (part.kind !== "rich") return <MarkdownMessage key={part.id} content={part.source} streaming={streaming} />;
    const currentRootIndex = rootIndex;
    rootIndex += 1;
    return <RichMessageFrame
      key={`${part.id}:${part.document.contentKey}`}
      message={message}
      document={part.document}
      rootIndex={currentRootIndex}
    />;
  })}</div>;
}

function MessageBubbleComponent({ message = {}, avatar, name, layoutMode = "roleplay", avatarShape = "portrait", spacingAfter, onOpenProcess, onSelectOpening, onEdit, onRegenerate }) {
  const { role, content, pending = false } = message;
  const displayContent = message.displayContent ?? content;
  const isUser = role === "user";
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content || "");
  const [jumpOpen, setJumpOpen] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const [openingSwitching, setOpeningSwitching] = useState(false);
  const articleRef = useRef(null);
  const editTextareaRef = useRef(null);
  const toolsRef = useRef(null);
  const jumpDialogRef = useRef(null);
  const jumpTriggerRef = useRef(null);
  const openingSwitchingRef = useRef(false);
  const selectedOpeningIdRef = useRef(message.selectedOpeningId);
  selectedOpeningIdRef.current = message.selectedOpeningId;
  const options = message.openingOptions || [];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === message.selectedOpeningId));
  const liveProcess = shouldShowInlineAgentProcess(message, displayContent)
    ? liveProcessPresentation(message.process)
    : null;
  const requestedPage = Number(pageInput);
  const requestedIndex = Number.isInteger(requestedPage) ? requestedPage - 1 : -1;
  const requestedPageValid = requestedIndex >= 0 && requestedIndex < options.length;

  useEffect(() => setDraft(content || ""), [content]);
  useLayoutEffect(() => {
    const textarea = editTextareaRef.current;
    if (!editing || !textarea) return;

    // Chromium versions that support field-sizing handle this in CSS. Keep a
    // scrollHeight fallback for older Electron runtimes so long messages never
    // stay trapped in the initial one-line box.
    if (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) {
      textarea.style.height = "";
      textarea.style.overflowY = "";
      return;
    }

    textarea.style.height = "0px";
    const computedMaxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight);
    const viewportMaxHeight = Math.min(620, window.innerHeight * 0.75);
    const maxHeight = Number.isFinite(computedMaxHeight) ? computedMaxHeight : viewportMaxHeight;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > nextHeight ? "auto" : "hidden";
  }, [draft, editing]);
  useEffect(() => {
    if (!expanded) return undefined;
    const close = (event) => { if (!toolsRef.current?.contains(event.target)) setExpanded(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
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

  function saveEdit() {
    const next = draft.trim();
    if (!next || next === content) { setEditing(false); return; }
    onEdit?.(message, next);
    setEditing(false);
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
    if (!targetOption?.id || targetIndex === selectedIndex || openingSwitchingRef.current) return;

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

      await Promise.resolve(onSelectOpening?.(message, targetOption.id));
      clearExit();
      await nextPaint();

      if (!reduceMotion && selectedOpeningIdRef.current === targetOption.id && articleRef.current) {
        const range = articleRef.current.getBoundingClientRect().width + 30;
        const clearEntry = await animateOpeningSlide(articleRef.current, movingForward ? range : -range, 0);
        clearEntry();
      }
    } catch (error) {
      console.error("Failed to switch opening message", error);
    } finally {
      clearExit();
      openingSwitchingRef.current = false;
      setOpeningSwitching(false);
    }
  }
  function submitPageJump(event) {
    event.preventDefault();
    if (!requestedPageValid) return;
    closePageJump(false);
    void selectOpeningAt(requestedIndex);
  }
  return (
    <article
      ref={articleRef}
      className={`message ${isUser ? "mine" : "theirs"} message-${layoutMode} avatar-shape-${avatarShape}${options.length > 1 ? " has-opening-pager" : ""}`}
      style={Number.isFinite(spacingAfter) ? { marginBottom: `${spacingAfter}px` } : undefined}
    >
      <Avatar src={avatar} name={name} />
      <div className="message-content">
        <div className="message-heading">
          <header className="message-author">{name || (isUser ? "你" : "助手")}</header>
          {!pending ? <div className={`message-tools${expanded ? ' expanded' : ''}`} ref={toolsRef}>
            {expanded ? <div className="message-tools-expanded">
              {message.process?.length ? <button type="button" onClick={openProcess} aria-label="查看过程" title="查看过程"><HistoryIcon /></button> : null}
              <button type="button" onClick={() => navigator.clipboard?.writeText(displayContent || '')} aria-label="复制" title="复制"><CopyIcon /></button>
              {!isUser && message.id !== 'opening' ? <button type="button" onClick={() => onRegenerate?.(message)} aria-label="重新生成" title="重新生成"><RefreshMessageIcon /></button> : null}
              <button type="button" onClick={speak} aria-label="朗读" title="朗读"><SpeakerIcon /></button>
            </div> : null}
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-label="更多" title="更多"><MoreDotsIcon /></button>
            <button type="button" onClick={() => setEditing(true)} aria-label="编辑" title="编辑"><MessagePencilIcon /></button>
          </div> : null}
        </div>
        {isUser ? <ChatImageGallery images={message.inputImageAttachments || []} conversationId={message.conversationId} /> : null}
        {editing ? <div className="message-inline-editor"><textarea
          ref={editTextareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(content || "");
              setEditing(false);
            } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              saveEdit();
            }
          }}
          autoFocus
          aria-label="编辑消息"
        /><div><button type="button" onClick={() => { setDraft(content || ''); setEditing(false); }}>取消</button><button type="button" className="primary" onClick={saveEdit}>保存</button></div></div> : liveProcess ? <button type="button" className="agent-process-inline" onClick={openProcess} aria-label={`查看处理过程：${liveProcess.title}`}>
          <AgentProcessIcon name={liveProcess.icon} size={liveProcess.icon === 'reasoning' ? 27 : 17} animated={liveProcess.icon === 'reasoning'} />
          <span className="agent-process-inline-label">{liveProcess.title}</span>
          <MessageChevronRightIcon size={14} />
        </button> : displayContent ? <div className="bubble markdown-message">
          <MessagePresentation message={message} content={displayContent} streaming={pending} />
        </div> : null}
      </div>
      {options.length > 1 ? <div className="opening-pager" aria-label="切换开场白" aria-busy={openingSwitching || undefined}>
        <button type="button" className="opening-pager-prev" disabled={openingSwitching || selectedIndex <= 0} onClick={() => { void selectOpeningAt(selectedIndex - 1); }} aria-label="上一条开场白"><FontAwesomeIcon icon={faChevronLeft} /></button>
        <button type="button" className="opening-pager-next" disabled={openingSwitching || selectedIndex >= options.length - 1} onClick={() => { void selectOpeningAt(selectedIndex + 1); }} aria-label="下一条开场白"><FontAwesomeIcon icon={faChevronRight} /></button>
        <button ref={jumpTriggerRef} type="button" className="opening-pager-index" disabled={openingSwitching} onClick={() => { setPageInput(String(selectedIndex + 1)); setJumpOpen(true); }} aria-label={`第 ${selectedIndex + 1} 条，共 ${options.length} 条开场白，点击跳转`}>{selectedIndex + 1}/{options.length}</button>
      </div> : null}
      {jumpOpen && typeof document !== "undefined" ? createPortal(
        <div className="opening-jump-backdrop" onPointerDown={() => closePageJump()}>
          <form ref={jumpDialogRef} className="opening-jump-dialog" role="dialog" aria-modal="true" aria-labelledby="opening-jump-title" onPointerDown={(event) => event.stopPropagation()} onSubmit={submitPageJump}>
            <h2 id="opening-jump-title">跳转开场白</h2>
            <label>页码（1–{options.length}）<input type="number" min="1" max={options.length} step="1" value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" autoFocus aria-invalid={Boolean(pageInput) && !requestedPageValid} aria-describedby={pageInput && !requestedPageValid ? "opening-jump-error" : undefined} /></label>
            {pageInput && !requestedPageValid ? <small id="opening-jump-error">请输入 1 到 {options.length}</small> : null}
            <div><button type="button" onClick={() => closePageJump()}>取消</button><button type="submit" className="primary" disabled={!requestedPageValid}>跳转</button></div>
          </form>
        </div>,
        document.body,
      ) : null}
    </article>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
