import { useRef, useState, useSyncExternalStore } from 'react';
import { Button, IconEditOutlineRegular, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { resolveFailure } from '../../../utils/failureText.js';
import '../../../ui/styles/product-dialogs.css';
import '../styles/creator-user-message-edit.css';

/** The official user action seat carries the original durable input and sequence. */
export function CreatorStudioUserMessageEditAction({ sessionId, message, model, useSession }) {
  const tUi = useProductTranslation();
  const running = useSession(value => value.running);
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const [draft, setDraft] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const selectedSession = useRef('');
  const active = state.active?.sessionId === sessionId;
  const disabled = running || busy || !active || Boolean(state.editingSessionId);
  if (message.source?.kind !== 'user' || !Number.isSafeInteger(message.seq)) return null;
  const text = message.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
  const close = () => { if (!pending.current) { setDraft(null); setError(''); } };
  async function save() {
    if (pending.current || disabled || !draft?.trim() || draft === text) return;
    pending.current = true; setBusy(true); setError('');
    try { await model.editUserMessage(message.seq, draft); setDraft(null); }
    catch (cause) { setError(resolveFailure(cause, { fallback: tUi('修改消息失败') }).text); }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    <Tooltip label={tUi('修改')} side="bottom"><button type="button" className="creator-user-input-edit" aria-label={tUi('修改用户输入')} disabled={disabled}
      onClick={() => { selectedSession.current = sessionId; setDraft(text); setError(''); }}><IconEditOutlineRegular size={18} /></button></Tooltip>
    <Modal open={draft !== null && active && selectedSession.current === sessionId} title={tUi('修改用户输入')} closeLabel={tUi('关闭')} onClose={close}
      className="product-dialog creator-user-input-modal" contentClassName="product-dialog-content" footer={<div className="product-dialog-actions">
        <Button variant="outline" disabled={busy} onClick={close}>{tUi('取消')}</Button>
        <Button variant="primary" disabled={disabled || !draft?.trim() || draft === text} onClick={save}>{busy ? tUi('处理中…') : tUi('保存')}</Button>
      </div>}>
      <textarea className="creator-user-input-text" aria-label={tUi('用户输入')} value={draft ?? ''} disabled={disabled}
        onChange={event => setDraft(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void save(); }
        }} />
      {error && <p className="product-dialog-error" role="alert">{error}</p>}
    </Modal>
  </>;
}
