import { useMemo, useState } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { BookOpenText, MagnifyingGlass } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { useCharacterConfigurationDraft } from '../../../ui/hooks/useCharacterConfigurationDraft.js';
import { ConversationActionDialog } from '../../../ui/ui/ConversationActionDialog.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';

export function GlobalSettingLibrariesQuickDialog({ model, onClose }) {
  const tUi = useProductTranslation(), [query, setQuery] = useState(''), [confirm, setConfirm] = useState(false), [failure, setFailure] = useState(null);
  const adapter = useMemo(() => ({ getSnapshot: () => model.getSnapshot(), read: async () => { setFailure(null); try { return await model.read(); } catch (cause) { setFailure(cause); throw cause; } }, save: async (_address, value) => { setFailure(null); try { return await model.save(value); } catch (cause) { setFailure(cause); throw cause; } },
    subscribe: listener => model.subscribe((kind, _address, snapshot) => listener(kind, 'global', snapshot)) }), [model]);
  const draft = useCharacterConfigurationDraft({ characterId: 'global', configuration: adapter, label: tUi('全局设定库'), saveShortcut: false });
  const close = () => {
    if (draft.saving) return;
    if (confirm) setConfirm(false);
    else if (draft.dirty) setConfirm(true);
    else onClose();
  };
  async function save() { if (await draft.save()) onClose(); }
  const key = query.trim().toLocaleLowerCase(), visible = draft.library?.libraries.filter(library => library.name.toLocaleLowerCase().includes(key));
  return <ConversationActionDialog title={tUi('全局设定库')} onClose={close} busy={draft.saving} footer={confirm ? <>
    <Button variant="primary" disabled={draft.saving} onClick={() => void save()}>{tUi('保存')}</Button>
    <Button variant="outline" disabled={draft.saving} onClick={() => { draft.discard(); onClose(); }}>{tUi('不保存')}</Button>
    <Button variant="outline" disabled={draft.saving} onClick={() => setConfirm(false)}>{tUi('取消')}</Button>
  </> : <><Button variant="outline" disabled={draft.saving} onClick={close}>{tUi('取消')}</Button><Button variant="primary" disabled={draft.saving || !draft.dirty} onClick={() => void save()}>{draft.saving ? tUi('保存中') : tUi('保存')}</Button></>}>
    <FailureAlert failure={failure} onRetry={() => { draft.setError(''); if (draft.library) void save(); else void adapter.read().catch(setFailure); }} />
    {confirm ? <p className="conversation-action-scope">{tUi('全局设定库的启停尚未保存。')}</p> : <>
      <Input className="conversation-action-search" type="search" icon={<MagnifyingGlass size={16} />} aria-label={tUi('搜索全局设定库')} placeholder={tUi('搜索全局设定库')} value={query} onChange={event => setQuery(event.target.value)} />
      <p className="conversation-action-scope">{tUi('共享设置，影响所有使用这些设定的对话')}</p>
      {!draft.library && !draft.error && <p role="status" className="conversation-action-empty">{tUi('正在加载…')}</p>}
      {visible?.map(library => <label className="conversation-global-row" key={library.id}><BookOpenText size={20} /><span><strong>{library.name}</strong></span>
        <input type="checkbox" disabled={draft.saving} checked={library.enabled} aria-label={tUi('启用{value0}', { value0: library.name })} onChange={event => { const enabled = event.target.checked; setFailure(null); draft.changeLibrary(current => ({ ...current, libraries: current.libraries.map(item => item.id === library.id ? { ...item, enabled } : item) })); }} />
      </label>)}
      {visible?.length === 0 && <p role="status" className="conversation-action-empty">{tUi('没有匹配的设定库')}</p>}
    </>}
  </ConversationActionDialog>;
}
