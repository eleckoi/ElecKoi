import { productLocaleTag, sourceText } from '../../../app/i18n/productCopy.js';
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { ConfirmationDialog } from '../../../ui/ui/ConfirmationDialog.jsx';
import '../../../ui/styles/product-dialogs.css';
import { useEffect, useMemo, useRef, useState } from "react";
import { HistoryExportIcon, TrashIcon } from "../../../ui/icons/index.jsx";
import { Avatar } from "../../../ui/ui/Avatar.jsx";
import { DshSearchField } from "../../../ui/ui/DshSearchField.jsx";
import { exportChatHistory, importChatHistory } from "../api/chatApi.js";
import { MobileConversationOverlay, isMobilePresentation } from '../../../mobile/MobileConversationOverlay.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';

function dateTitle(value, tUi = sourceText) {
  if (!value) return tUi("未知日期");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tUi("未知日期");
  return date.toLocaleDateString(productLocaleTag(tUi), { year: "numeric", month: "2-digit", day: "2-digit" }).replaceAll("/", "/");
}

function timeTitle(value, tUi = sourceText) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(productLocaleTag(tUi), { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function HistoryModal({ open, sessions, sessionId, chatCharacter, conversationModel, onClose, onLoadChat, onDeleteChat, onHistoryImported }) {
  const tUi = useProductTranslation();
  const mobile = isMobilePresentation();
  const [keyword, setKeyword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [transferError, setTransferError] = useState(null);
  const [transferring, setTransferring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyScope, setHistoryScope] = useState(null);
  const importInput = useRef(null);
  const currentSession = (sessions || []).find((item) => item.id === sessionId);
  const selectedCharacterId = currentSession?.character_id || chatCharacter?.character_id || "";
  const selectedCharacterName = currentSession?.character_name || chatCharacter?.assistant_name || chatCharacter?.character_name || "";
  const currentCharacterId = historyScope?.id || selectedCharacterId;
  const characterName = historyScope?.name || selectedCharacterName;

  useEffect(() => {
    if (!open) setHistoryScope(null);
    else if (!historyScope && selectedCharacterId) setHistoryScope({ id: selectedCharacterId, name: selectedCharacterName });
  }, [open, historyScope, selectedCharacterId, selectedCharacterName]);

  const filteredGroups = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    const filtered = (sessions || [])
      .filter((item) => item.character_id && item.character_id === currentCharacterId)
      .filter((item) => {
        const text = `${item.character_name || ""} ${item.title || ""} ${item.summary || ""} ${item.id || ""} ${dateTitle(item.updated_at, tUi)}`.toLowerCase();
        return !key || text.includes(key);
      })
      .sort((a, b) => {
        if (a.id === sessionId) return -1;
        if (b.id === sessionId) return 1;
        return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
      });
    const groups = new Map();
    for (const item of filtered) {
      const date = dateTitle(item.updated_at, tUi);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(item);
    }
    return [...groups.entries()];
  }, [currentCharacterId, sessions, keyword, sessionId, tUi]);

  async function exportHistory(item) {
    if (transferring) return;
    setTransferError(null);
    setTransferring(true);
    try {
      const { json } = await exportChatHistory(item.id, { model: conversationModel });
      const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `eleckoi-chat-${item.id}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setTransferError(error ?? tUi("导出聊天记录失败。"));
    } finally {
      setTransferring(false);
    }
  }

  async function importHistory(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || transferring) return;
    setTransferError(null);
    if (!currentCharacterId) {
      setTransferError(tUi("请先选择角色，再导入聊天记录。"));
      return;
    }
    setTransferring(true);
    try {
      const { conversationId } = await importChatHistory(currentCharacterId, await file.text(), { model: conversationModel });
      await onHistoryImported?.();
      await onLoadChat?.(conversationId);
      onClose?.();
    } catch (error) {
      setTransferError(error ?? tUi("导入聊天记录失败。"));
    } finally {
      setTransferring(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteTarget(null);
    setDeleting(true);
    setTransferError(null);
    try { await onDeleteChat?.(deleteTarget.id); }
    catch (error) { setTransferError(error); }
    finally { setDeleting(false); }
  }

  if (!open) return null;

  const body = <>
        <div className="history-toolbar">
          <DshSearchField
            className="history-search"
            value={keyword}
            onValueChange={setKeyword}
            placeholder={tUi("搜索历史对话…")}
            ariaLabel={tUi("搜索历史对话")}
            autoFocus={!mobile}
          />
          <input ref={importInput} type="file" accept=".json,.jsonl,application/json" hidden onChange={importHistory} />
          <Button data-dsh-control variant="outline" className="history-import" aria-label={tUi("导入聊天记录")}
            disabled={transferring} onClick={() => importInput.current?.click()}>{tUi("导入")}</Button>
        </div>

        <FailureAlert failure={transferError} className="history-transfer-error" />

        <div className="history-list" aria-busy={deleting || undefined}>
          {!deleting && !filteredGroups.length ? (
            <div className="history-empty">
              <strong>{tUi("暂无历史对话")}</strong>
              <span>{tUi("当前角色还没有本地保存的对话。")}</span>
            </div>
          ) : null}
          {filteredGroups.map(([date, items]) => (
            <section className="history-day" key={date}>
              <h3>{date}</h3>
              {items.map((item) => {
                const active = item.id === sessionId;
                const itemCharacterName = item.character_name || characterName || tUi("角色");
                const itemCharacterAvatar = item.character_avatar || "";
                return (
                  <div className={`history-item ${active ? "active" : ""}`} key={item.id}>
                    <button
                      className="history-item-main"
                      type="button"
                      onClick={() => {
                        onLoadChat(item.id);
                        onClose();
                      }}
                    >
                      <Avatar src={itemCharacterAvatar} name={itemCharacterName} />
                      <div>
                        <p>
                          <b>{active ? tUi("当前") : itemCharacterName}</b>
                          <time>{timeTitle(item.updated_at, tUi)}</time>
                        </p>
                        <span>{item.summary || item.title || tUi("新对话")}</span>
                      </div>
                    </button>
                    <button className="history-item-export" type="button" title={tUi("导出这条记录")} aria-label={tUi("导出这条记录")} disabled={transferring} onClick={() => exportHistory(item)}>
                      <HistoryExportIcon />
                    </button>
                    <button className="history-item-delete" type="button" title={tUi("删除这条记录")} aria-label={tUi("删除这条记录")} disabled={deleting} onClick={() => setDeleteTarget(item)}>
                      <TrashIcon />
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <ConfirmationDialog open={Boolean(deleteTarget)} title={tUi('删除历史对话')}
          description={tUi('这条历史记录会被删除，删除后无法恢复。')}
          confirmLabel={tUi('确认删除')} destructive onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
  </>;
  if (mobile) return <MobileConversationOverlay title={characterName || tUi("聊天记录")} subtitle={characterName ? tUi("聊天记录") : undefined} className="mobile-history"
    onClose={onClose} onBack={deleteTarget ? () => setDeleteTarget(null) : undefined} beforeClose={() => { if (deleteTarget) { setDeleteTarget(null); return false; } return true; }}>{body}</MobileConversationOverlay>;
  return <Modal open title={tUi('聊天记录')} description={characterName || undefined} closeLabel={tUi('关闭')} onClose={onClose}
    className="product-dialog history-modal" contentClassName="product-dialog-content">{body}</Modal>;
}
