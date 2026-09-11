import { useEffect, useRef, useState } from "react";
import { DshNewChatIcon, DshRefreshIcon, DshSendIcon, DshStopIcon } from "../../../ui/icons/dshComposerIcons.jsx";
import { ChatHistoryIcon, MenuIcon, PictureFrameIcon, PlugIcon } from "../../../ui/icons/openSourceIcons.jsx";
import { Database } from "@phosphor-icons/react";
import { ChatModelPicker } from "./ChatModelPicker.jsx";
import { ChatImageGallery } from "./ChatImageGallery.jsx";
import { ContextMeter, GenerationStatsLine } from "./GenerationStats.jsx";

export function ChatComposer({
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
  onOpenTools,
  onOpenVariables,
  onRegenerate,
  regenerateTargetMessageId,
  composerStyle = "glass",
  generationStats,
  showGenerationStats = true,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function closeOnOutsidePointer(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  function runMenuAction(action) {
    setMenuOpen(false);
    action?.();
  }

  function submit(event) {
    setMenuOpen(false);
    onSend(event);
  }

  return (
    <form className={`composer composer-style-${composerStyle}`} onSubmit={submit}>
      <div className="composer-stack">
        <div className="composer-card">
        <input
          ref={imageInputRef}
          className="composer-image-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          disabled={isSending}
          onChange={(event) => {
            const files = [...(event.target.files || [])];
            event.target.value = "";
            onAddImages?.(files);
          }}
        />
        <ChatImageGallery images={inputImages} compact onRemove={onRemoveImage} />
        <textarea
          rows={1}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setMenuOpen(false);
          }}
          onPaste={(event) => {
            const files = clipboardFiles(event.clipboardData);
            if (!files.length) return;
            onAddImages?.(files);
            if (!event.clipboardData.getData("text/plain")) event.preventDefault();
          }}
          placeholder="输入消息"
          disabled={isSending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!isSending && (input.trim() || inputImages.length)) submit(event);
            }
          }}
        />

        <div className="composer-row">
          <div className="composer-tools">
            <div className="composer-more-anchor" ref={menuRef}>
              <button
                className={`composer-add composer-more-trigger ${menuOpen ? "active" : ""}`}
                type="button"
                aria-label={menuOpen ? "收起更多工具" : "更多工具"}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="更多工具"
                onClick={() => setMenuOpen((value) => !value)}
              >
                <MenuIcon size={17} weight="bold" />
              </button>
              {menuOpen ? (
                <div className="composer-more-menu" role="menu" aria-label="对话工具">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isSending}
                    onClick={() => runMenuAction(() => imageInputRef.current?.click())}
                  >
                    <PictureFrameIcon size={18} />
                    <span>图片</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => runMenuAction(onOpenHistory)}>
                    <ChatHistoryIcon size={18} />
                    <span>聊天记录</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => runMenuAction(onOpenTools)}>
                    <PlugIcon size={18} />
                    <span>工具</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => runMenuAction(onOpenVariables)}>
                    <Database size={18} weight="regular" />
                    <span>变量查看器</span>
                  </button>
                  <button className="composer-new-chat-item" type="button" role="menuitem" onClick={() => runMenuAction(onCreateChat)}>
                    <DshNewChatIcon size={18} />
                    <span>新建对话</span>
                  </button>
                  <i aria-hidden="true" />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!regenerateTargetMessageId || isSending}
                    onClick={() => runMenuAction(() => onRegenerate?.({ targetMessageId: regenerateTargetMessageId }))}
                  >
                    <DshRefreshIcon size={18} />
                    <span>重新生成</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="composer-trailing">
            <ChatModelPicker
              configs={modelConfigs}
              selectedConfigId={selectedModelConfigId}
              selectedModel={selectedModel}
              modelParameters={modelParameters}
              modelOptionsByKey={modelOptionsByKey}
              onLoadModels={onLoadModelOptions}
              onSelect={onSelectModel}
              onSaveModelConfig={onSaveModelConfig}
              onNotify={onNotify}
            />
            {showGenerationStats ? <ContextMeter stats={generationStats} /> : null}
            {isSending ? (
              <button className="send-button generating" type="button" onClick={onStop} aria-label="停止生成" title="停止生成">
                <DshStopIcon />
              </button>
            ) : (
              <button className="send-button" type="submit" disabled={!input.trim() && !inputImages.length} aria-label="发送消息" title="发送消息">
                <DshSendIcon />
              </button>
            )}
          </div>
        </div>
        </div>
        {showGenerationStats ? <GenerationStatsLine stats={generationStats} /> : null}
      </div>
    </form>
  );
}

function clipboardFiles(clipboardData) {
  const files = [...(clipboardData?.files || [])];
  if (files.length) return files;
  return [...(clipboardData?.items || [])]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean);
}
