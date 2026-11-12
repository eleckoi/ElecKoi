import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { Check, MagnifyingGlass } from '../../../ui/icons/interfaceIcons.jsx';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import defaultPresetAvatar from '../../../assets/eleckoi-app-icon.png';
import { ConversationActionDialog } from '../../../ui/ui/ConversationActionDialog.jsx';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';

export function ConversationPresetDialog({ catalog, purpose, onClose }) {
  const tUi = useProductTranslation();
  const snapshot = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot, catalog.getSnapshot);
  const [query, setQuery] = useState(''), [changing, setChanging] = useState(''), [error, setError] = useState(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void catalog.refresh().catch(cause => { if (alive.current) setError(cause); });
    return () => { alive.current = false; };
  }, [catalog]);
  const all = snapshot.catalog?.presets.filter(preset => preset.purpose === purpose) || [];
  const key = query.trim().toLocaleLowerCase();
  const visible = all.filter(preset => `${preset.name} ${preset.profile.authorName}`.toLocaleLowerCase().includes(key));
  async function choose(id) {
    if (changing) return;
    setChanging(id); setError(null);
    try { await catalog.setActive(id); if (alive.current) onClose(); }
    catch (cause) { if (alive.current) setError(cause); }
    finally { if (alive.current) setChanging(''); }
  }
  return <ConversationActionDialog title={tUi('切换预设')} onClose={onClose} busy={Boolean(changing)}>
    <Input className="conversation-action-search" type="search" icon={<MagnifyingGlass size={16} />} aria-label={tUi('搜索预设')} placeholder={tUi('搜索预设')} value={query} onChange={event => setQuery(event.target.value)} />
    <p className="conversation-action-scope">{purpose === 'creator' ? tUi('应用于全部创作对话') : tUi('应用于全部角色对话')}</p>
    <FailureAlert failure={error || snapshot.error} onRetry={() => { setError(null); void catalog.refresh().catch(cause => { if (alive.current) setError(cause); }); }} />
    {snapshot.status === 'loading' && !snapshot.catalog ? <p role="status" className="conversation-action-empty">{tUi('正在加载…')}</p> : visible.map(preset => <button type="button" className="conversation-preset-row" key={preset.id}
      aria-pressed={snapshot.catalog.activePresetIds[purpose] === preset.id} aria-busy={changing === preset.id} disabled={Boolean(changing)} onClick={() => void choose(preset.id)}>
      <Avatar src={preset.profile.authorAvatarPath || defaultPresetAvatar} name={preset.profile.authorName || preset.name} className="conversation-preset-avatar" />
      <span><strong>{preset.name}</strong>{preset.profile.authorName && <small>{preset.profile.authorName}</small>}</span>
      {snapshot.catalog.activePresetIds[purpose] === preset.id && <Check size={18} />}
    </button>)}
    {snapshot.status === 'ready' && !visible.length && <p role="status" className="conversation-action-empty">{tUi('没有匹配的预设')}</p>}
  </ConversationActionDialog>;
}
