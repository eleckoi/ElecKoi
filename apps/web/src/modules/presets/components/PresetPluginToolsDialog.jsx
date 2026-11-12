import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { X, CaretRight, MagnifyingGlass } from '../../../ui/icons/interfaceIcons.jsx';
import { AgentToolGroupIcon } from '../../../ui/icons/index.jsx';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { MobileConversationOverlay } from '../../../mobile/MobileConversationOverlay.jsx';

export function PresetPluginToolsDialog({ plugin, compact, nested, closeBlocked, onClose, onOpenTool, inline = false }) {
  const tUi = useProductTranslation();
  const [query, setQuery] = useState('');
  const key = query.trim().toLocaleLowerCase();
  const tools = plugin.tools.filter(tool => !key || `${tool.name} ${tool.description} ${tool.members.map(member => member.name).join(' ')}`.toLocaleLowerCase().includes(key));
  useEffect(() => {
    if (compact || inline) return;
    const escape = event => {
      if (event.key === 'Escape' && !event.defaultPrevented && !nested && !closeBlocked) onClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [compact, inline, nested, closeBlocked, onClose]);

  const body = <div className="preset-plugin-tools-body">
    <Input data-dsh-control className="preset-tool-dialog-search" type="search" icon={<MagnifyingGlass size={16} />} aria-label={tUi("搜索插件工具")} placeholder={tUi("搜索工具")} value={query} onChange={event => setQuery(event.target.value)} />
    <div className="preset-plugin-tools-items">
      {tools.map(tool => <button type="button" className="preset-plugin-tool-row preset-plugin-tool-open" key={tool.id} onClick={() => onOpenTool(tool.id)}>
        <span className="preset-plugin-tool-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span>
        <span className="preset-plugin-tool-state">{tool.available === false ? tUi("未加载") : tool.included && !tool.enabled ? tUi("预设已停用") : tUi("可用")}</span>
        <CaretRight size={15} aria-hidden="true" />
      </button>)}
      {!tools.length && <p className="preset-tool-dialog-empty">{tUi("没有匹配的工具")}</p>}
    </div>
  </div>;
  if (inline) return <section className="preset-plugin-inline"><header className="preset-document-heading"><AgentToolGroupIcon groupId={plugin.id} size={21} /><h1>{plugin.name}</h1></header>{body}</section>;
  if (compact) return <MobileConversationOverlay title={plugin.name} subtitle={tUi("{value0} 个工具", {value0: plugin.tools.length})} kind="page" className="mobile-preset-plugin-tools" busy={closeBlocked || nested} onClose={onClose}>{body}</MobileConversationOverlay>;
  return createPortal(<SystemBarOverlay className="preset-tool-config-backdrop" onMouseDown={() => { if (!nested && !closeBlocked) onClose(); }}>
    <section className="preset-tool-config-dialog preset-plugin-tools-dialog" role="dialog" aria-modal="true" aria-label={tUi("{value0}的工具", {value0: plugin.name})} onMouseDown={event => event.stopPropagation()}>
      <header><span className="preset-tool-config-title-icon"><AgentToolGroupIcon groupId={plugin.id} size={18} /></span><div className="preset-tool-dialog-heading"><h2>{plugin.name}</h2><small>{plugin.tools.length}{tUi(" 个工具")}</small></div><button type="button" aria-label={tUi("关闭插件工具")} onClick={onClose}><X size={19} /></button></header>
      {body}
    </section>
  </SystemBarOverlay>, document.body);
}
