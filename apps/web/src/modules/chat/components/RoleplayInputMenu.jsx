import { useEffect, useRef, useState } from "react";
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { DshNewChatIcon, DshRefreshIcon } from "../../../ui/icons/dshComposerIcons.jsx";
import { ChatHistoryIcon, MenuIcon, PlugIcon } from "../../../ui/icons/openSourceIcons.jsx";
import { TrashIcon } from "../../../ui/icons/index.jsx";
import { Code, Database, TextAlignLeft } from "../../../ui/icons/interfaceIcons.jsx";
import { UserCircle } from '@phosphor-icons/react';
import { ScriptButtonsDialog } from "../../scripts/index.js";

/** Roleplay-only actions placed immediately after the native DSH plus button. */
export function RoleplayInputMenu({
  isSending,
  onCreateChat,
  onOpenHistory,
  onOpenTools,
  onOpenVariables,
  onOpenRequestPreview,
  onEnterDeleteMode,
  canDeleteMessages = false,
  onRegenerate,
  regenerateTargetMessageId,
  scriptButtons = [],
  scriptsReady = false,
  onRunScriptButton,
  purpose = 'roleplay',
  onSelectCharacter,
}) {
  const creator = purpose === 'creator';
  const menuLabel = creator ? '工作室菜单' : '扮演菜单';
  const [open, setOpen] = useState(false);
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function run(action) {
    setOpen(false);
    rootRef.current?.querySelector("button")?.focus();
    action?.();
  }

  return (
    <div className="composer-more-anchor" ref={rootRef}>
      <button
        className={`roleplay-menu-trigger composer-more-trigger ${open ? "active" : ""}`}
        type="button"
        aria-label={open ? `收起${menuLabel}` : menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={menuLabel}
        onClick={() => setOpen((value) => !value)}
      >
        <MenuIcon size={17} weight="bold" />
      </button>
      {open ? (
        <MenuSurface className="composer-more-menu" role="menu" aria-label={menuLabel}>
          {creator && <button type="button" role="menuitem" onClick={() => run(onSelectCharacter)}><UserCircle size={18} /><span>选择角色</span></button>}
          {!creator &&
          <button type="button" role="menuitem" onClick={() => run(onOpenHistory)}>
            <ChatHistoryIcon size={18} /><span>聊天记录</span>
          </button>}
          <button type="button" role="menuitem" onClick={() => run(onOpenTools)}>
            <PlugIcon size={18} /><span>工具</span>
          </button>
          {!creator && <button type="button" role="menuitem" aria-haspopup="dialog" onClick={() => run(() => setScriptsOpen(true))}>
            <Code size={18} /><span>脚本</span>
          </button>}
          {onOpenRequestPreview && <button type="button" role="menuitem" onClick={() => run(onOpenRequestPreview)}>
            <TextAlignLeft size={18} weight="regular" /><span>请求上下文预览</span>
          </button>}
          {!creator && <button type="button" role="menuitem" onClick={() => run(onOpenVariables)}>
            <Database size={18} weight="regular" /><span>变量查看器</span>
          </button>}
          <button className="composer-new-chat-item" type="button" role="menuitem" onClick={() => run(onCreateChat)}>
            <DshNewChatIcon size={18} /><span>新建对话</span>
          </button>
          <button type="button" role="menuitem" disabled={isSending || !canDeleteMessages}
            onClick={() => run(onEnterDeleteMode)}>
            <TrashIcon size={18} /><span>删除消息</span>
          </button>
          <i aria-hidden="true" />
          <button type="button" role="menuitem" disabled={!regenerateTargetMessageId || isSending}
            onClick={() => run(() => onRegenerate?.({ targetMessageId: regenerateTargetMessageId }))}>
            <DshRefreshIcon size={18} /><span>重新生成</span>
          </button>
        </MenuSurface>
      ) : null}
      {scriptsOpen ? <ScriptButtonsDialog buttons={scriptButtons} ready={scriptsReady} onRun={onRunScriptButton}
        onClose={() => setScriptsOpen(false)} /> : null}
    </div>
  );
}
