import { FileCode } from '../../../ui/icons/interfaceIcons.jsx';
import { EditorSwitch } from '../../../ui/ui/EditorLibraryFields.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { rulesForScope } from '../model/regexRulesEditing.js';

export function RegexWorkspaceList({ collection, scope, query, selectedId, selection, busy, onSelect, onToggleRule, onToggleScope, onMove, draggedId, onDragState, onContextMenu }) {
  const tUi = useProductTranslation(), rules = rulesForScope(collection, scope.id), enabled = collection?.[scope.enabledKey] !== false;
  const search = query.trim().toLocaleLowerCase(), visible = rules.filter(rule => !search || [rule.name, rule.pattern, rule.replacement].some(value => value.toLocaleLowerCase().includes(search)));
  return <section className={`rs-directory-library${!visible.length ? ' is-empty' : ''}`} aria-label={scope.label}>
    <header className="rs-library-heading" onContextMenu={event => onContextMenu(event, { scopeId: scope.id })}><span>{scope.label}</span>{!selection.active && <EditorSwitch label={tUi('启用{value0}', { value0: scope.label })} checked={enabled} disabled={busy} onChange={value => onToggleScope(scope.id, value)} />}</header>
    <div role="tree" aria-label={tUi('正则条目列表')}>{visible.map(rule => <div key={rule.id} className={`rs-row regex-rule-row${(selection.active ? selection.selected.has(rule.id) : selectedId === rule.id) ? ' is-selected' : ''}${!enabled || !rule.enabled ? ' is-disabled' : ''}`}
      data-enabled={enabled && rule.enabled} onClick={() => onSelect(rule.id)} onContextMenu={event => onContextMenu(event, { scopeId: scope.id, ruleId: rule.id })}
      onDragOver={event => { if (busy || selection.active || search || !draggedId || draggedId === rule.id) return; event.preventDefault(); onMove(scope.id, draggedId, rules.findIndex(item => item.id === rule.id)); }}>
      {selection.active && <input type="checkbox" checked={selection.selected.has(rule.id)} disabled={busy} aria-label={tUi('选择{value0}', { value0: rule.name })} onClick={event => event.stopPropagation()} onChange={() => onSelect(rule.id)} />}
      <button type="button" className="rs-row-main regex-rule-main" draggable={!busy && !selection.active && !search} disabled={busy} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', rule.id); onDragState(rule.id); }} onDragEnd={() => onDragState('')}
        onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && !search && !selection.active) { event.preventDefault(); onMove(scope.id, rule.id, rules.findIndex(item => item.id === rule.id) + (event.key === 'ArrowDown' ? 1 : -1)); } }}>
        <span className="rs-row-indent" /><FileCode size={17} /><span className="rs-row-name">{rule.name || tUi('未命名规则')}</span>
      </button>
      {!selection.active && <EditorSwitch label={tUi('{value0}启用状态', { value0: rule.name })} checked={rule.enabled} disabled={busy} onChange={value => onToggleRule(scope.id, rule.id, value)} />}
    </div>)}{!visible.length && <p className="rs-directory-empty">{search ? tUi('没有匹配的规则') : tUi('暂无规则')}</p>}</div>
  </section>;
}
