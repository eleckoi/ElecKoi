import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { X, CaretRight, MagnifyingGlass } from '../../../ui/icons/interfaceIcons.jsx';
import { AgentToolGroupIcon } from '../../../ui/icons/index.jsx';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { MobileConversationOverlay } from '../../../mobile/MobileConversationOverlay.jsx';

export function PresetPluginToolsDialog({ plugin, compact, nested, closeBlocked, onClose, onOpenTool }) {
  const [query, setQuery] = useState('');
  const key = query.trim().toLocaleLowerCase();
  const tools = plugin.tools.filter(tool => !key || `${tool.name} ${tool.description} ${tool.members.map(member => member.name).join(' ')}`.toLocaleLowerCase().includes(key));
  useEffect(() => {
    if (compact) return;
    const escape = event => {
      if (event.key === 'Escape' && !event.defaultPrevented && !nested && !closeBlocked) onClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [compact, nested, closeBlocked, onClose]);

  const body = <div className="preset-plugin-tools-body">
    <Input data-dsh-control className="preset-tool-dialog-search" type="search" icon={<MagnifyingGlass size={16} />} aria-label="搜索插件工具" placeholder="搜索工具" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="preset-plugin-tools-items">
      {tools.map(tool => <button type="button" className="preset-plugin-tool-row preset-plugin-tool-open" key={tool.id} onClick={() => onOpenTool(tool.id)}>
        <span className="preset-plugin-tool-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span>
        <span className="preset-plugin-tool-state">{tool.available === false ? '未加载' : tool.included && !tool.enabled ? '预设已停用' : '可用'}</span>
        <CaretRight size={15} aria-hidden="true" />
      </button>)}
      {!tools.length && <p className="preset-tool-dialog-empty">没有匹配的工具</p>}
    </div>
  </div>;
  if (compact) return <MobileConversationOverlay title={plugin.name} subtitle={`${plugin.tools.length} 个工具`} kind="page" className="mobile-preset-plugin-tools" busy={closeBlocked || nested} onClose={onClose}>{body}</MobileConversationOverlay>;
  return createPortal(<SystemBarOverlay className="preset-tool-config-backdrop" onMouseDown={() => { if (!nested && !closeBlocked) onClose(); }}>
    <section className="preset-tool-config-dialog preset-plugin-tools-dialog" role="dialog" aria-modal="true" aria-label={`${plugin.name}的工具`} onMouseDown={event => event.stopPropagation()}>
      <header><span className="preset-tool-config-title-icon"><AgentToolGroupIcon groupId={plugin.id} size={18} /></span><div className="preset-tool-dialog-heading"><h2>{plugin.name}</h2><small>{plugin.tools.length} 个工具</small></div><button type="button" aria-label="关闭插件工具" onClick={onClose}><X size={19} /></button></header>
      {body}
    </section>
  </SystemBarOverlay>, document.body);
}
