import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { readChatImage } from "../api/chatApi.js";

export function agentMessageImageSize(width, height) {
  if (!(width > 0) || !(height > 0)) return { width: 240, height: 240, objectPosition: "center" };
  const naturalRatio = width / height;
  const ratio = Math.min(4, Math.max(0.25, naturalRatio));
  const box = ratio >= 1 ? { width: 240, height: 240 / ratio } : { width: 240 * ratio, height: 240 };
  const scale = Math.min(1, width / box.width, height / box.height);
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: naturalRatio < 0.25 ? "center top" : naturalRatio > 4 ? "left center" : "center",
  };
}

export function ChatImageGallery({ images = [], conversationId = "", compact = false, agentMessage = false, onRemove }) {
  if (!images.length) return null;
  const agentVariant = agentMessage ? images.length > 1 ? "tile" : "single" : "";
  return (
    <div className={`chat-image-gallery${compact ? " compact" : ""}${agentMessage ? " agent-message-images" : ""}`} aria-label={compact ? "待发送图片" : "消息图片"}>
      {images.map((image) => (
        <ChatImage
          key={image.renderKey || image.localId || image.attachmentId}
          image={image}
          conversationId={conversationId}
          compact={compact}
          agentVariant={agentVariant}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function ChatImage({ image, conversationId, compact, agentVariant, onRemove }) {
  const [source, setSource] = useState(image.previewUrl || image.dataUrl || "");
  const [failed, setFailed] = useState(false);
  const [naturalSize, setNaturalSize] = useState(null);
  const fit = agentVariant === "single"
    ? agentMessageImageSize(image.width || naturalSize?.width, image.height || naturalSize?.height)
    : null;

  useEffect(() => {
    const immediateSource = image.previewUrl || image.dataUrl || "";
    setFailed(false);
    if (immediateSource) {
      setSource(immediateSource);
      return undefined;
    }
    if (!conversationId || !image.attachmentId) {
      setSource("");
      return undefined;
    }
    let active = true;
    readChatImage(conversationId, image.attachmentId)
      .then((url) => { if (active) setSource(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [conversationId, image.attachmentId, image.dataUrl, image.previewUrl]);

  const label = image.name || "图片";
  return (
    <figure
      className={`chat-image-item${failed ? " failed" : ""}${agentVariant ? ` agent-${agentVariant}` : ""}`}
      style={fit ? { width: `${fit.width}px`, aspectRatio: `${fit.width} / ${fit.height}` } : undefined}
    >
      {source ? <img src={source} alt={label} draggable="false" style={fit ? { objectPosition: fit.objectPosition } : undefined} onLoad={(event) => {
        if (agentVariant === "single") setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
      }} /> : <span aria-label={failed ? `${label}加载失败` : `${label}加载中`} />}
      {compact && onRemove ? (
        <button type="button" onClick={() => onRemove(image.localId)} aria-label={`移除${label}`} title="移除图片">
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      ) : null}
    </figure>
  );
}
