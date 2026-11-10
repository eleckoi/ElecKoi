import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
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

export const OpeningEditor = forwardRef(function OpeningEditor({ entry, query = '', variableVersions = [], variableVersionsError = '', onChange, onRequestDelete }, ref) {
  const tUi = useProductTranslation();
  const messages = useMemo(() => primaryFirstOpeningMessages(entry), [entry]);
  const primary = messages[0];
  const backups = messages.slice(1);
  const keyword = query.trim().toLocaleLowerCase();
  const matches = message => !keyword || `${message.title}\n${message.content}`.toLocaleLowerCase().includes(keyword);
  const visibleBackups = backups.map((message, index) => ({ message, index })).filter(({ message }) => matches(message));
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
          <button type="button" className="setting-library-opening-toggle" aria-expanded={expanded} title={message.title || tUi("未命名开场白")} onClick={() => setExpandedId(expanded ? "" : message.id)}>
            <CaretRight className={expanded ? "is-expanded" : ""} size={14} aria-hidden="true" />
            <strong>{message.title || tUi("未命名开场白")}</strong>
            {isPrimary ? <span>{tUi("主开场白")}</span> : null}
          </button>
          <div className="setting-library-opening-tools">
            {!isPrimary ? <Button data-dsh-control variant="outline" type="button" aria-label={tUi("上移")} title={tUi("上移")} disabled={index === 1} onClick={() => onChange(moveBackupOpening(entry, message.id, -1))}><ArrowUp size={16} /></Button> : null}
            {!isPrimary ? <Button data-dsh-control variant="outline" type="button" aria-label={tUi("下移")} title={tUi("下移")} disabled={index === backups.length} onClick={() => onChange(moveBackupOpening(entry, message.id, 1))}><ArrowDown size={16} /></Button> : null}
            <Button data-dsh-control variant="outline" type="button" aria-label={tUi("复制开场白")} title={tUi("复制开场白")} onClick={() => duplicate(message.id)}><Copy size={16} /></Button>
            <Button data-dsh-control variant="outline" type="button" aria-label={tUi("删除开场白")} title={tUi("删除开场白")} disabled={messages.length <= 1} onClick={() => onRequestDelete(message)}><Trash size={16} /></Button>
          </div>
        </div>
        {expanded ? (
          <div className="setting-library-opening-fields">
            <label>
              <span>{tUi("标题")}</span>
              <input value={message.title} placeholder={tUi("未命名开场白")} onChange={(event) => onChange(updateOpening(entry, message.id, { title: event.target.value }))} />
            </label>
            <label>
              <span>{tUi("关联变量版本")}</span>
              <select value={message.variableVersionId || ''}
                onChange={(event) => onChange(updateOpening(entry, message.id, {
                  variableVersionId: event.target.value,
                }))}>
                <option value="">{tUi("不关联变量")}</option>
                {message.variableVersionId && !variableVersions.some((version) => version.id === message.variableVersionId)
                  ? <option value={message.variableVersionId} disabled>{tUi("版本不存在")}</option> : null}
                {variableVersions.map((version) => <option key={version.id} value={version.id}>{version.name || tUi("未命名版本")}</option>)}
              </select>
              <FailureAlert failure={variableVersionsError} />
            </label>
            <MarkdownTextareaField
              label={tUi("开场白正文")}
              value={message.content}
              placeholder={tUi("作为聊天记录中的第一条 Assistant 开场白使用。")}
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
        {matches(primary) && renderMessage(primary, 0, true)}
        {visibleBackups.length ? <div className="setting-library-opening-group-label">{tUi("备用开场白 ")}<span>{visibleBackups.length}</span></div> : null}
        {visibleBackups.map(({ message, index }) => renderMessage(message, index + 1, false))}
        {!matches(primary) && !visibleBackups.length && <p className="setting-library-empty" role="status">{tUi("没有匹配的开场白")}</p>}
      </div>
    </div>
  );
});
