import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { X, Check, SquaresFour, MagnifyingGlass } from '../../../ui/icons/interfaceIcons.jsx';
import { AgentToolGroupIcon } from '../../../ui/icons/index.jsx';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { MobileConversationOverlay } from '../../../mobile/MobileConversationOverlay.jsx';

/** Edit the parent draft directly; retain the opening catalog so removed references remain selectable. */
export function PresetToolManagerDialog({ sources, includedIds, compact, closeBlocked, onClose, onMembershipChange }) {
  const [openingSources] = useState(() => sources);
  const [sourceId, setSourceId] = useState(sources[0]?.id || '');
  const [query, setQuery] = useState('');
  const openingTools = new Map(openingSources.flatMap(source => source.tools.map(tool => [tool.id, tool])));
  const currentTools = new Map(sources.flatMap(source => source.tools.map(tool => [tool.id, tool])));
  const catalog = new Map();
  for (const source of [...openingSources, ...sources]) {
    const previous = catalog.get(source.id);
    const tools = new Map([...(previous?.tools || []), ...source.tools].map(tool => [tool.id, {
      ...tool, available: currentTools.has(tool.id) ? currentTools.get(tool.id).available : false,
    }]));
    catalog.set(source.id, { ...source, tools: [...tools.values()] });
  }
  const allSources = [...catalog.values()];
  const selected = tool => includedIds.has(tool.id);
  const source = catalog.get(sourceId);
  const key = query.trim().toLocaleLowerCase();
  const tools = source?.tools.filter(tool => !key || `${tool.name} ${tool.description} ${tool.members.map(member => member.name).join(' ')}`.toLocaleLowerCase().includes(key)) || [];
  useEffect(() => {
    if (compact) return;
    const escape = event => { if (event.key === 'Escape' && !event.defaultPrevented && !closeBlocked) onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [compact, closeBlocked, onClose]);
  function select(tool, checked) {
    const original = openingTools.get(tool.id);
    onMembershipChange({ ...tool, enabled: checked ? original?.included ? original.enabled : true : tool.enabled }, checked);
  }
  const body = <div className="preset-tool-manager-body">
    <nav className="preset-tool-manager-sources" aria-label="工具来源">
      {allSources.map(item => <button type="button" key={item.id} aria-pressed={sourceId === item.id} onClick={() => { setSourceId(item.id); setQuery(''); }}>
        {item.id === 'built_in' ? <SquaresFour size={18} aria-hidden="true" /> : <AgentToolGroupIcon groupId={item.id} size={18} />}<span>{item.name}</span><small>{item.tools.filter(selected).length}/{item.tools.length}</small>
      </button>)}
    </nav>
    <section className="preset-tool-manager-content">
      {compact && <label className="preset-tool-manager-mobile-source">工具来源<select aria-label="工具来源" value={sourceId} onChange={event => { setSourceId(event.target.value); setQuery(''); }}><option value="" disabled>选择来源</option>{allSources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <Input data-dsh-control className="preset-tool-dialog-search" type="search" icon={<MagnifyingGlass size={16} />} aria-label="搜索来源中的工具" placeholder="搜索工具" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="preset-tool-manager-items">
        {tools.map(tool => <label className="preset-tool-manager-row" key={tool.id}>
          <span className="preset-tool-icon"><AgentToolGroupIcon groupId={tool.id} size={19} /></span>
          <span className="preset-tool-manager-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span>
          <span className="preset-tool-manager-check">
            <input type="checkbox" aria-label={`选择：${tool.name}`} checked={selected(tool)} disabled={closeBlocked} onChange={event => select(tool, event.target.checked)} />
            <Check size={13} weight="bold" aria-hidden="true" />
          </span>
        </label>)}
        {!source && <p className="preset-tool-dialog-empty">选择工具来源</p>}
        {source && !tools.length && <p className="preset-tool-dialog-empty">没有匹配的工具</p>}
      </div>
    </section>
  </div>;
  if (compact) return <MobileConversationOverlay title="管理预设工具" kind="page" className="mobile-preset-tool-manager" busy={closeBlocked} onClose={onClose}>{body}</MobileConversationOverlay>;
  return createPortal(<SystemBarOverlay className="preset-tool-config-backdrop" onMouseDown={() => { if (!closeBlocked) onClose(); }}>
    <section className="preset-tool-config-dialog preset-tool-manager-dialog" role="dialog" aria-modal="true" aria-label="管理预设工具" onMouseDown={event => event.stopPropagation()}>
      <header><h2>管理预设工具</h2><button type="button" aria-label="关闭管理窗口" onClick={onClose}><X size={19} /></button></header>
      {body}
    </section>
  </SystemBarOverlay>, document.body);
}
