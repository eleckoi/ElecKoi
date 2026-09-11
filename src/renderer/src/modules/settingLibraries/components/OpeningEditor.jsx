import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CaretRight, Copy, Plus, Trash } from "@phosphor-icons/react";
import {
  createBackupOpening,
  duplicateOpening,
  moveBackupOpening,
  primaryFirstOpeningMessages,
  updateOpening,
} from "../model/settingLibraryEditing.js";
import { MarkdownTextareaField } from "./MarkdownTextareaField.jsx";

export function OpeningEditor({ entry, onChange, onRequestDelete }) {
  const messages = useMemo(() => primaryFirstOpeningMessages(entry), [entry]);
  const primary = messages[0];
  const backups = messages.slice(1);
  const [expandedId, setExpandedId] = useState(primary.id);

  useEffect(() => {
    if (expandedId && !messages.some((message) => message.id === expandedId)) setExpandedId(primary.id);
  }, [expandedId, messages, primary.id]);

  function createBackup() {
    const result = createBackupOpening(entry);
    onChange(result.entry);
    setExpandedId(result.createdId);
  }

  function duplicate(messageId) {
    const result = duplicateOpening(entry, messageId);
    onChange(result.entry);
    setExpandedId(result.createdId);
  }

  function renderMessage(message, index, isPrimary) {
    const expanded = expandedId === message.id;
    return (
      <article className={`setting-library-opening-item${expanded ? " is-expanded" : ""}`} key={message.id}>
        <div className="setting-library-opening-summary">
          <button type="button" className="setting-library-opening-toggle" onClick={() => setExpandedId(expanded ? "" : message.id)}>
            <CaretRight className={expanded ? "is-expanded" : ""} size={14} aria-hidden="true" />
            <strong>{message.title || "未命名开场白"}</strong>
            {isPrimary ? <span>主开场白</span> : null}
          </button>
          <div className="setting-library-opening-tools">
            {!isPrimary ? <button type="button" aria-label="上移" disabled={index === 1} onClick={() => onChange(moveBackupOpening(entry, message.id, -1))}><ArrowUp size={15} /></button> : null}
            {!isPrimary ? <button type="button" aria-label="下移" disabled={index === backups.length} onClick={() => onChange(moveBackupOpening(entry, message.id, 1))}><ArrowDown size={15} /></button> : null}
            <button type="button" aria-label="复制开场白" onClick={() => duplicate(message.id)}><Copy size={15} /></button>
            <button type="button" aria-label="删除开场白" disabled={messages.length <= 1} onClick={() => onRequestDelete(message)}><Trash size={15} /></button>
          </div>
        </div>
        {expanded ? (
          <div className="setting-library-opening-fields">
            <label>
              <span>标题</span>
              <input value={message.title} maxLength={40} placeholder="未命名开场白" onChange={(event) => onChange(updateOpening(entry, message.id, { title: event.target.value }))} />
            </label>
            <MarkdownTextareaField
              label="开场白正文"
              value={message.content}
              placeholder="作为聊天记录中的第一条 Assistant 开场白使用。"
              onChange={(content) => onChange(updateOpening(entry, message.id, { content }))}
            />
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="setting-library-opening-editor">
      <div className="setting-library-opening-bar">
        <button type="button" onClick={createBackup}><Plus size={15} />新建备用开场白</button>
      </div>
      <div className="setting-library-opening-list">
        {renderMessage(primary, 0, true)}
        {backups.length ? <div className="setting-library-opening-group-label">备用开场白 <span>{backups.length}</span></div> : null}
        {backups.map((message, index) => renderMessage(message, index + 1, false))}
      </div>
    </div>
  );
}
