import { CaretDown, FileCode } from "@phosphor-icons/react";
import { REGEX_SCOPES, rulesForScope } from "../model/regexRulesEditing.js";

function RuleSwitch({ checked, onChange, label }) {
  return (
    <label className="regex-rule-switch" aria-label={label} onClick={(event) => event.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export function RegexRuleList({
  collection,
  query,
  selectedId,
  collapsed,
  draggedId,
  onToggleSection,
  onSelect,
  onToggleRule,
  onMove,
  onDragState,
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  function matches(rule) {
    if (!normalizedQuery) return true;
    return [rule.name, rule.pattern, rule.replacement].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  }

  return (
    <div className="regex-rule-groups">
      {REGEX_SCOPES.map((scope) => {
        const allRules = rulesForScope(collection, scope.id);
        const visibleRules = allRules.filter(matches);
        const enabledCount = allRules.filter((rule) => rule.enabled).length;
        const isCollapsed = collapsed.has(scope.id) && !normalizedQuery;
        return (
          <section className="regex-rule-group" key={scope.id}>
            <button type="button" className="regex-group-heading" aria-expanded={!isCollapsed} onClick={() => onToggleSection(scope.id)}>
              <CaretDown size={15} className={isCollapsed ? "is-collapsed" : ""} />
              <strong>{scope.label}</strong>
              <span>{enabledCount} / {allRules.length}</span>
            </button>
            {!isCollapsed ? (
              <div className="regex-group-rows">
                {visibleRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`regex-rule-row${selectedId === rule.id ? " is-selected" : ""}${draggedId === rule.id ? " is-dragging" : ""}`}
                    onClick={() => onSelect(rule.id)}
                    onDragOver={(event) => {
                      if (query || !draggedId || draggedId === rule.id) return;
                      event.preventDefault();
                      const targetIndex = allRules.findIndex((item) => item.id === rule.id);
                      onMove(scope.id, draggedId, targetIndex);
                    }}
                  >
                    <div
                      className="regex-rule-main"
                      draggable={!query}
                      tabIndex={0}
                      aria-label={`${rule.name || "未命名规则"}，拖动排序`}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", rule.id);
                        onDragState(rule.id);
                      }}
                      onDragEnd={() => onDragState("")}
                      onKeyDown={(event) => {
                        if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                        event.preventDefault();
                        const sourceIndex = allRules.findIndex((item) => item.id === rule.id);
                        onMove(scope.id, rule.id, sourceIndex + (event.key === "ArrowDown" ? 1 : -1));
                      }}
                    >
                      <FileCode size={18} aria-hidden="true" />
                      <span>{rule.name.trim() || "未命名规则"}</span>
                    </div>
                    <RuleSwitch checked={rule.enabled} label={`${rule.name || "未命名规则"}启用状态`} onChange={(enabled) => onToggleRule(scope.id, rule.id, enabled)} />
                  </div>
                ))}
                {visibleRules.length === 0 ? <p className="regex-group-empty">{normalizedQuery ? "没有匹配的规则" : "暂无规则"}</p> : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
