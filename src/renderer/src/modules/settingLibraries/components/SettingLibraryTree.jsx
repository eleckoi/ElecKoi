import { createContext, useContext, useEffect } from "react";
import { ChatCircleDots, Code, LinkSimple } from "@phosphor-icons/react";
import { DshFolderClosedIcon, DshFolderOpenIcon, DshTriangleRightIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { SettingEntryGlyph } from "./SettingLibraryEntryEditor.jsx";

export const SettingTreeActionsContext = createContext(null);

function entryIcon(data) {
  if (data.entryKind === "opening") return ChatCircleDots;
  if (data.dynamicMode === "ejs_controller") return Code;
  if (data.dynamicMode === "ejs_reference") return LinkSimple;
  return null;
}

export function SettingTreeNode({ node, style, dragHandle }) {
  const actions = useContext(SettingTreeActionsContext);
  const data = node.data;
  const Icon = entryIcon(data);

  useEffect(() => {
    if (!node.willReceiveDrop || node.isLeaf || node.isOpen) return undefined;
    const timeout = window.setTimeout(() => node.open(), 500);
    return () => window.clearTimeout(timeout);
  }, [node.id, node.isLeaf, node.isOpen, node.willReceiveDrop]);

  return (
    <div
      ref={dragHandle}
      className={`setting-library-tree-row${data.nodeKind === "entry" ? " has-toggle" : ""}${data.enabled === false ? " is-disabled" : ""}${node.level > 0 ? " is-nested" : ""}${node.isSelected ? " is-selected" : ""}${node.willReceiveDrop ? " is-drop-target" : ""}${node.isDragging ? " is-dragging" : ""}`}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        node.handleClick(event);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (node.isInternal) node.toggle();
      }}
      onContextMenu={(event) => actions.openContextMenu(event, data)}
    >
      <span className="setting-library-tree-chevron">
        {data.nodeKind === "group" ? (
          <button
            type="button"
            className="setting-library-tree-expander"
            aria-label={node.isOpen ? "折叠文件夹" : "展开文件夹"}
            aria-expanded={node.isOpen}
            onClick={(event) => {
              event.stopPropagation();
              node.toggle();
            }}
          >
            <DshTriangleRightIcon className={node.isOpen ? "is-expanded" : ""} />
          </button>
        ) : null}
      </span>
      {data.nodeKind === "group" ? (
        <span className="setting-library-tree-folder" aria-hidden="true">
          {node.isOpen ? <DshFolderOpenIcon /> : <DshFolderClosedIcon />}
        </span>
      ) : <span className={`setting-library-tree-entry-icon${data.dynamicMode === "ejs_controller" ? " is-controller" : ""}${data.dynamicMode === "ejs_reference" ? " is-reference" : ""}`} aria-hidden="true">
        {Icon ? <Icon weight="regular" /> : <SettingEntryGlyph iconId={data.iconId} weight="regular" />}
      </span>}
      <span className="setting-library-tree-label">{data.label}</span>
      {data.nodeKind === "group" ? <span className="setting-library-tree-count">{data.childCount}</span> : (
        <button
          type="button"
          className="setting-library-tree-switch"
          role="switch"
          aria-checked={data.enabled}
          aria-label={`${data.enabled ? "停用" : "启用"}${data.label}`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            actions.updateEntryById(data.recordId, { enabled: !data.enabled });
          }}
        ><span aria-hidden="true" /></button>
      )}
    </div>
  );
}

export function SettingTreeCursor({ top, left }) {
  return (
    <div className="setting-library-tree-drop-cursor" style={{ top, width: "min(340px, calc(100% - 2px))", paddingLeft: left }}>
      <span />
    </div>
  );
}
