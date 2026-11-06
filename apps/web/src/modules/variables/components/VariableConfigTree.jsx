import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { createContext, useContext } from "react";
import { BracketsCurly, Empty, HashStraight, ListBullets, ListDashes, TextT, ToggleRight, TreeStructure } from "@phosphor-icons/react";
import { DshTriangleRightIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { HeadlessTree } from "../../../ui/tree/HeadlessTree.jsx";
import { EditorSelectionCheckbox } from '../../../ui/ui/EditorCollectionControls.jsx';
import { VARIABLE_INITIALIZATION_OBJECT_ID } from "../../../../../../packages/shared/src/contracts/variables/schemas.ts";

export const VariableTreeActionsContext = createContext(null);

const VARIABLE_TYPE_ICONS = Object.freeze({
  number: HashStraight,
  string: TextT,
  boolean: ToggleRight,
  object: BracketsCurly,
  array: ListBullets,
  null: Empty,
});

export function VariableGroupIcon({ initialization = false, size = 17, className = "" }) {
  const Icon = initialization ? ListDashes : TreeStructure;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

export function VariableEntryIcon({ type = "", size = 17, className = "" }) {
  const Icon = VARIABLE_TYPE_ICONS[type] || BracketsCurly;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

export function VariableTreeNode({ item, data, itemProps, style, level, isSelected, isExpanded, isDropTarget, isDragging }) {
  const tUi = useProductTranslation();
  const actions = useContext(VariableTreeActionsContext);

  return (
    <div
      {...itemProps}
      className={`variable-tree-row${data.enabled === false ? " is-disabled" : ""}${level > 0 ? " is-nested" : ""}${actions?.selection?.active ? actions.selection.selected.has(data.id) ? ' is-selected' : '' : isSelected ? " is-selected" : ""}${isDropTarget ? " is-drop-target" : ""}${isDragging ? " is-dragging" : ""}`}
      style={style}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (actions?.openEditor) { actions.openEditor(data.id); return; }
        if (!item.isFolder()) return;
        if (item.isExpanded()) item.collapse();
        else item.expand();
      }}
      onContextMenu={(event) => actions?.openContextMenu(event, data)}
    >
      <EditorSelectionCheckbox selection={actions?.selection} id={data.id} label={data.label} disabled={actions?.saving || data.fixed} />
      <span className="variable-tree-chevron">
        {data.nodeKind === "object" && !data.fixed ? (
          <button type="button" className="variable-tree-expander" aria-label={isExpanded ? tUi("折叠变量组") : tUi("展开变量组")} aria-expanded={isExpanded} onDoubleClick={event => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (item.isExpanded()) item.collapse(); else item.expand(); }}>
            <DshTriangleRightIcon className={isExpanded ? "is-expanded" : ""} />
          </button>
        ) : null}
      </span>
      {data.nodeKind === "object"
        ? <VariableGroupIcon initialization={data.fixed} className="variable-tree-icon" />
        : <VariableEntryIcon type={data.valueType} className="variable-tree-icon" />}
      <span className="variable-tree-label">{data.dynamicKey ? `<${data.label}>` : data.label}</span>
      {data.readMode === "required" ? <span className="variable-tree-required" title={tUi("必读")}>{tUi("必读")}</span> : null}
      {!data.fixed && !actions?.selection?.active ? (
        <button type="button" className="variable-tree-switch" role="switch" aria-checked={data.enabled} aria-label={`${data.ownEnabled ? tUi("停用") : tUi("启用")}${data.label}`} disabled={!data.ancestorEnabled} onDoubleClick={event => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); actions.toggleNode(data); }}><span aria-hidden="true" /></button>
      ) : null}
    </div>
  );
}

export function VariableConfigTree({ nodes, query, selectedId, expandedIds, onSelectedIdChange, onExpandedIdsChange, onMove, touchReorder, dragEnabled }) {
  const tUi = useProductTranslation();
  return <HeadlessTree
    nodes={nodes}
    touchReorder={touchReorder}
    dragEnabled={dragEnabled}
    query={query}
    selectedId={selectedId}
    expandedIds={expandedIds}
    ariaLabel={tUi("变量配置树")}
    dragLineClassName="variable-tree-drop-cursor"
    onSelectedIdChange={onSelectedIdChange}
    onExpandedIdsChange={onExpandedIdsChange}
    onMove={onMove}
    renderItem={({ key, ...props }) => <VariableTreeNode key={key} {...props} />}
  />;
}

export { VARIABLE_INITIALIZATION_OBJECT_ID };
