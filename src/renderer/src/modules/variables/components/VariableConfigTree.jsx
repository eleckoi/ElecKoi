import { createContext, useContext, useEffect } from "react";
import { BracketsCurly, HashStraight, ListBullets, ListDashes, TextT, ToggleRight, TreeStructure } from "@phosphor-icons/react";
import { DshTriangleRightIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { VARIABLE_INITIALIZATION_OBJECT_ID } from "../../../../../shared/contracts/variables/schemas.ts";

export const VariableTreeActionsContext = createContext(null);

const VARIABLE_TYPE_ICONS = Object.freeze({
  number: HashStraight,
  string: TextT,
  boolean: ToggleRight,
  object: BracketsCurly,
  array: ListBullets,
});

export function VariableGroupIcon({ initialization = false, size = 17, className = "" }) {
  const Icon = initialization ? ListDashes : TreeStructure;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

export function VariableEntryIcon({ type = "", size = 17, className = "" }) {
  const Icon = VARIABLE_TYPE_ICONS[type] || BracketsCurly;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

export function VariableTreeNode({ node, style, dragHandle }) {
  const actions = useContext(VariableTreeActionsContext);
  const data = node.data;

  useEffect(() => {
    if (!node.willReceiveDrop || node.isLeaf || node.isOpen) return undefined;
    const timeout = window.setTimeout(() => node.open(), 500);
    return () => window.clearTimeout(timeout);
  }, [node.id, node.isLeaf, node.isOpen, node.willReceiveDrop]);

  return (
    <div
      ref={dragHandle}
      className={`variable-tree-row${data.enabled === false ? " is-disabled" : ""}${node.level > 0 ? " is-nested" : ""}${node.isSelected ? " is-selected" : ""}${node.willReceiveDrop ? " is-drop-target" : ""}${node.isDragging ? " is-dragging" : ""}`}
      style={style}
      onClick={(event) => { event.stopPropagation(); node.handleClick(event); }}
      onDoubleClick={(event) => { event.stopPropagation(); if (node.isInternal) node.toggle(); }}
      onContextMenu={(event) => actions.openContextMenu(event, data)}
    >
      <span className="variable-tree-chevron">
        {data.nodeKind === "object" && !data.fixed ? (
          <button type="button" className="variable-tree-expander" aria-label={node.isOpen ? "折叠变量组" : "展开变量组"} aria-expanded={node.isOpen} onClick={(event) => { event.stopPropagation(); node.toggle(); }}>
            <DshTriangleRightIcon className={node.isOpen ? "is-expanded" : ""} />
          </button>
        ) : null}
      </span>
      {data.nodeKind === "object"
        ? <VariableGroupIcon initialization={data.fixed} className="variable-tree-icon" />
        : <VariableEntryIcon type={data.valueType} className="variable-tree-icon" />}
      <span className="variable-tree-label">{data.dynamicKey ? `<${data.label}>` : data.label}</span>
      {data.readMode === "required" ? <span className="variable-tree-required" title="必读">必读</span> : null}
      {!data.fixed ? (
        <button type="button" className="variable-tree-switch" role="switch" aria-checked={data.enabled} aria-label={`${data.ownEnabled ? "停用" : "启用"}${data.label}`} disabled={!data.ancestorEnabled} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); actions.toggleNode(data); }}><span aria-hidden="true" /></button>
      ) : null}
    </div>
  );
}

export function VariableTreeCursor({ top, left }) {
  return <div className="variable-tree-drop-cursor" style={{ top, width: "min(380px, calc(100% - 2px))", paddingLeft: left }}><span /></div>;
}

export { VARIABLE_INITIALIZATION_OBJECT_ID };
