import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { readChatImage } from "../api/chatApi.js";

export function ChatImageGallery({ images = [], conversationId = "", compact = false, onRemove }) {
  if (!images.length) return null;
  return (
    <div className={`chat-image-gallery${compact ? " compact" : ""}`} aria-label={compact ? "待发送图片" : "消息图片"}>
      {images.map((image) => (
        <ChatImage
          key={image.localId || image.attachmentId}
          image={image}
          conversationId={conversationId}
          compact={compact}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function ChatImage({ image, conversationId, compact, onRemove }) {
  const [source, setSource] = useState(image.previewUrl || image.dataUrl || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSource(image.previewUrl || image.dataUrl || "");
    setFailed(false);
    if (image.previewUrl || image.dataUrl || !conversationId || !image.attachmentId) return undefined;
    let active = true;
    readChatImage(conversationId, image.attachmentId)
      .then((url) => { if (active) setSource(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [conversationId, image.attachmentId, image.dataUrl, image.previewUrl]);

  const label = image.name || "图片";
  return (
    <figure className={`chat-image-item${failed ? " failed" : ""}`}>
      {source ? <img src={source} alt={label} draggable="false" /> : <span aria-label={failed ? `${label}加载失败` : `${label}加载中`} />}
      {compact && onRemove ? (
        <button type="button" onClick={() => onRemove(image.localId)} aria-label={`移除${label}`} title="移除图片">
          <X size={12} weight="bold" aria-hidden="true" />
        </button>
      ) : null}
    </figure>
  );
}
