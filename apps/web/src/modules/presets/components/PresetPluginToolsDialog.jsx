import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useState } from 'react';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretRight, MagnifyingGlass } from '../../../ui/icons/interfaceIcons.jsx';
import { AgentToolGroupIcon } from '../../../ui/icons/index.jsx';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../../../ui/styles/product-dialogs.css';
import { MobileConversationOverlay } from '../../../mobile/MobileConversationOverlay.jsx';

export function PresetPluginToolsDialog({ plugin, compact, nested, closeBlocked, onClose, onOpenTool, inline = false }) {
  const tUi = useProductTranslation();
  const [query, setQuery] = useState('');
  const key = query.trim().toLocaleLowerCase();
  const tools = plugin.tools.filter(tool => !key || `${tool.name} ${tool.description} ${tool.members.map(member => member.name).join(' ')}`.toLocaleLowerCase().includes(key));


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
  return <Modal open title={plugin.name} closeLabel={tUi('关闭插件工具')} onClose={() => { if (!(nested || closeBlocked)) onClose(); }}
    className="product-dialog preset-tools-modal" contentClassName="product-dialog-content">{body}</Modal>;
}
