import { Button, MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CaretRight, Copy, Trash } from "../../../ui/icons/interfaceIcons.jsx";
import {
  createBackupOpening,
  duplicateOpening,
  moveBackupOpening,
  primaryFirstOpeningMessages,
  updateOpening,
} from "../model/openingEditing.js";
import { MarkdownTextareaField } from "../../settingLibraries/index.js";
import { FailureAlert } from "../../../ui/ui/FailureAlert.jsx";

export const OpeningEditor = forwardRef(function OpeningEditor({ entry, variableVersions = [], variableVersionsError = '', onChange, onRequestDelete }, ref) {
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
  useImperativeHandle(ref, () => ({ createBackup }), [entry, onChange]);

  function duplicate(messageId) {
    const result = duplicateOpening(entry, messageId);
    onChange(result.entry);
    setExpandedId(result.createdId);
  }

  function renderMessage(message, index, isPrimary) {
    const expanded = expandedId === message.id;
    return (
      <MenuSurface role="article" className={`setting-library-opening-item${expanded ? " is-expanded" : ""}`} key={message.id}>
        <div className="setting-library-opening-summary">
          <button type="button" className="setting-library-opening-toggle" aria-expanded={expanded} title={message.title || '未命名开场白'} onClick={() => setExpandedId(expanded ? "" : message.id)}>
            <CaretRight className={expanded ? "is-expanded" : ""} size={14} aria-hidden="true" />
            <strong>{message.title || "未命名开场白"}</strong>
            {isPrimary ? <span>主开场白</span> : null}
          </button>
          <div className="setting-library-opening-tools">
            {!isPrimary ? <Button data-dsh-control variant="outline" type="button" aria-label="上移" title="上移" disabled={index === 1} onClick={() => onChange(moveBackupOpening(entry, message.id, -1))}><ArrowUp size={16} /></Button> : null}
            {!isPrimary ? <Button data-dsh-control variant="outline" type="button" aria-label="下移" title="下移" disabled={index === backups.length} onClick={() => onChange(moveBackupOpening(entry, message.id, 1))}><ArrowDown size={16} /></Button> : null}
            <Button data-dsh-control variant="outline" type="button" aria-label="复制开场白" title="复制开场白" onClick={() => duplicate(message.id)}><Copy size={16} /></Button>
            <Button data-dsh-control variant="outline" type="button" aria-label="删除开场白" title="删除开场白" disabled={messages.length <= 1} onClick={() => onRequestDelete(message)}><Trash size={16} /></Button>
          </div>
        </div>
        {expanded ? (
          <div className="setting-library-opening-fields">
            <label>
              <span>标题</span>
              <input value={message.title} placeholder="未命名开场白" onChange={(event) => onChange(updateOpening(entry, message.id, { title: event.target.value }))} />
            </label>
            <label>
              <span>绑定变量版本</span>
              <select value={message.variableVersionId || ''} disabled={!variableVersions.length}
                onChange={(event) => onChange(updateOpening(entry, message.id, {
                  variableVersionId: event.target.value, initialVariableStateJson: '',
                }))}>
                <option value="" disabled hidden>{variableVersions.length ? '请选择变量版本' : '暂无变量版本'}</option>
                {message.variableVersionId && !variableVersions.some((version) => version.id === message.variableVersionId)
                  ? <option value={message.variableVersionId} disabled>版本不存在</option> : null}
                {variableVersions.map((version) => <option key={version.id} value={version.id}>{version.name || '未命名版本'}</option>)}
              </select>
              <FailureAlert failure={variableVersionsError} />
            </label>
            <MarkdownTextareaField
              label="开场白正文"
              value={message.content}
              placeholder="作为聊天记录中的第一条 Assistant 开场白使用。"
              onChange={(content) => onChange(updateOpening(entry, message.id, { content }))}
            />
          </div>
        ) : null}
      </MenuSurface>
    );
  }

  return (
    <div className="setting-library-opening-editor">
      <div className="setting-library-opening-list">
        {renderMessage(primary, 0, true)}
        {backups.length ? <div className="setting-library-opening-group-label">备用开场白 <span>{backups.length}</span></div> : null}
        {backups.map((message, index) => renderMessage(message, index + 1, false))}
      </div>
    </div>
  );
});
