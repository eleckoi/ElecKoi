import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { createContext, useContext } from "react";
import { BracketsCurly, CaretDown, CaretRight, Empty, HashStraight, ListBullets, ListDashes, TextT, ToggleRight, TreeStructure } from "@phosphor-icons/react";
import { HeadlessTree } from "../../../ui/tree/HeadlessTree.jsx";
import { EditorSelectionCheckbox } from '../../../ui/ui/EditorCollectionControls.jsx';
import { EditorToggle } from '../../../ui/ui/EditorToggle.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
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

const VARIABLE_TYPE_LABELS = { number: '数值', string: '文字', boolean: '布尔值', object: '对象', array: '数组', null: '空值' };

export function VariableGroupIcon({ initialization = false, size = 17, className = "" }) {
  const Icon = initialization ? ListDashes : TreeStructure;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

export function VariableEntryIcon({ type = "", size = 17, className = "" }) {
  const Icon = VARIABLE_TYPE_ICONS[type] || BracketsCurly;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

function VariableTreeNode({ item, data, itemProps, style, level, isSelected, isExpanded, isDropTarget, isDragging }) {
  const tUi = useProductTranslation();
  const actions = useContext(VariableTreeActionsContext);
  const { characterStudio } = useEditorPresentation();

  const expandable = data.nodeKind === 'object' && !data.fixed;
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
      {expandable ? (
        <button type="button" className="variable-tree-expander" aria-label={isExpanded ? tUi("折叠变量组") : tUi("展开变量组")} aria-expanded={isExpanded}
          onDoubleClick={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); if (isExpanded) item.collapse(); else item.expand(); }}>
          {isExpanded ? <CaretDown size={13} /> : <CaretRight size={13} />}
        </button>
      ) : <span className="variable-tree-expander" aria-hidden="true" />}
      <span className="variable-tree-leading">
        {data.nodeKind === "object"
          ? <VariableGroupIcon initialization={data.fixed} className="variable-tree-icon" />
          : <VariableEntryIcon type={data.valueType} className="variable-tree-icon" />}
      </span>
      <span className="variable-tree-label">{data.dynamicKey ? `<${data.label}>` : data.label}</span>
      {characterStudio && data.nodeKind === 'variable' && <>
        {data.defaultValue && <span className="variable-tree-default" title={data.defaultValue}>{data.defaultValue}</span>}
        <span className="variable-tree-type">{tUi(VARIABLE_TYPE_LABELS[data.valueType] ?? data.valueType)}</span>
      </>}
      {data.readMode === "required" ? <span className="variable-tree-required" title={tUi("必读")}>{tUi("必读")}</span> : null}
      {!data.fixed && !actions?.selection?.active ? (
        <EditorToggle className="variable-tree-switch" checked={data.enabled} label={`${data.ownEnabled ? tUi("停用") : tUi("启用")}${data.label}`} disabled={!data.ancestorEnabled} onChange={() => actions.toggleNode(data)} />
      ) : null}
    </div>
  );
}

export function VariableConfigTree({ nodes, query, selectedId, expandedIds, onSelectedIdChange, onExpandedIdsChange, onMove, touchReorder, dragEnabled }) {
  const tUi = useProductTranslation();
  return <HeadlessTree
    nodes={nodes}
    branchGuides
    indent={27}
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
