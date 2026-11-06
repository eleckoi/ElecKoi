import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { FileCode } from "../../../ui/icons/interfaceIcons.jsx";
import { EditorLibraryGroup } from '../../../ui/ui/EditorLibraryGroup.jsx';
import { REGEX_SCOPES, rulesForScope } from "../model/regexRulesEditing.js";
import { useTouchReorder } from '../../../ui/tree/useTouchReorder.js';
import { EditorSelectionCheckbox } from '../../../ui/ui/EditorCollectionControls.jsx';

function RuleSwitch({ checked, onChange, label, disabled }) {
  return (
    <label className="regex-rule-switch" aria-label={label} onDoubleClick={event => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export function RegexRuleList({
  collection,
  scopes = REGEX_SCOPES,
  query,
  selectedId,
  draggedId,
  onSelect,
  onOpen,
  onToggleRule,
  onToggleScope,
  onMove,
  onDragState,
  touchReorder = false,
  dragEnabled = true,
  selection,
  onContextMenu,
  busy,
}) {
  const tUi = useProductTranslation();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const touch = useTouchReorder({ enabled: touchReorder && dragEnabled && !normalizedQuery, onSelect,
    onMove: ({ dragId, parentId, destinationIndex }) => onMove(parentId, dragId, destinationIndex) });

  function matches(rule) {
    if (!normalizedQuery) return true;
    return [rule.name, rule.pattern, rule.replacement].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  }

  return (
    <div className="regex-rule-groups" {...touch.handlers}>
      {scopes.map((scope) => {
        const allRules = rulesForScope(collection, scope.id);
        const visibleRules = allRules.filter(matches);
        const scopeEnabled = collection[scope.enabledKey] !== false;
        return (
          <EditorLibraryGroup className="regex-rule-group" key={scope.id} title={scope.label}
            onContextMenu={event => onContextMenu?.(event, { scopeId: scope.id })}
            actions={!selection?.active && onToggleScope && <RuleSwitch checked={scopeEnabled} label={tUi("启用{value0}", {value0: scope.label})} disabled={busy} onChange={enabled => onToggleScope(scope.id, enabled)} />}>
                {visibleRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`regex-rule-row${selection?.active ? selection.selected.has(rule.id) ? ' is-selected' : '' : selectedId === rule.id ? " is-selected" : ""}${(draggedId === rule.id || touch.preview?.dragId === rule.id) ? " is-dragging" : ""}`}
                    data-reorder-id={rule.id} data-reorder-parent={scope.id} data-enabled={scopeEnabled && rule.enabled}
                    data-reorder-target={touch.preview?.targetId === rule.id ? (touch.preview.after ? 'after' : 'before') : undefined}
                    onClick={() => onSelect(rule.id)}
                    onContextMenu={event => onContextMenu?.(event, { scopeId: scope.id, ruleId: rule.id })}
                    onDoubleClick={() => onOpen?.(rule.id)}
                    onDragOver={(event) => {
                      if (!dragEnabled || query || !draggedId || draggedId === rule.id) return;
                      event.preventDefault();
                      const targetIndex = allRules.findIndex((item) => item.id === rule.id);
                      onMove(scope.id, draggedId, targetIndex);
                    }}
                  >
                    <EditorSelectionCheckbox selection={selection} id={rule.id} label={rule.name || tUi("未命名规则")} disabled={busy} />
                    <div
                      className="regex-rule-main"
                      draggable={dragEnabled && !query}
                      tabIndex={0}
                      aria-label={tUi("{value0}，拖动排序", {value0: rule.name || tUi("未命名规则")})}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", rule.id);
                        onDragState(rule.id);
                      }}
                      onDragEnd={() => onDragState("")}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(rule.id); return; }
                        if (!dragEnabled || normalizedQuery) return;
                        if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                        event.preventDefault();
                        const sourceIndex = allRules.findIndex((item) => item.id === rule.id);
                        onMove(scope.id, rule.id, sourceIndex + (event.key === "ArrowDown" ? 1 : -1));
                      }}
                    >
                      <FileCode size={18} aria-hidden="true" />
                      <span>{rule.name.trim() || tUi("未命名规则")}</span>
                    </div>
                    {!selection?.active && <RuleSwitch checked={rule.enabled} disabled={busy} label={tUi("{value0}启用状态", {value0: rule.name || tUi("未命名规则")})} onChange={(enabled) => onToggleRule(scope.id, rule.id, enabled)} />}
                  </div>
                ))}
                {visibleRules.length === 0 ? <p className="editor-library-empty">{normalizedQuery ? tUi("没有匹配的规则") : tUi("暂无规则")}</p> : null}
          </EditorLibraryGroup>
        );
      })}
    </div>
  );
}
