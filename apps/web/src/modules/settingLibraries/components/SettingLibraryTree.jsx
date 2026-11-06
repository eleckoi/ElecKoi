import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { createContext, useContext } from "react";
import { ChatCircleDots, Code, LinkSimple } from "../../../ui/icons/interfaceIcons.jsx";
import { DshFolderClosedIcon, DshFolderOpenIcon, DshTriangleRightIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { HeadlessTree } from "../../../ui/tree/HeadlessTree.jsx";
import { SettingEntryGlyph } from "./SettingLibraryEntryEditor.jsx";
import { EditorSelectionCheckbox } from '../../../ui/ui/EditorCollectionControls.jsx';

export const SettingTreeActionsContext = createContext(null);

function entryIcon(data) {
  if (data.entryKind === "opening") return ChatCircleDots;
  if (data.contentMode === "ejs") return Code;
  if (data.dynamicMode === "ejs_reference") return LinkSimple;
  return null;
}

export function SettingTreeNode({ item, data, itemProps, style, level, isSelected, isExpanded, isDropTarget, isDragging }) {
  const tUi = useProductTranslation();
  const actions = useContext(SettingTreeActionsContext);
  const Icon = entryIcon(data);

  return (
    <div
      {...itemProps}
      className={`setting-library-tree-row${data.nodeKind === "entry" ? " has-toggle" : ""}${data.enabled === false ? " is-disabled" : ""}${level > 0 ? " is-nested" : ""}${actions?.selection?.active ? actions.selection.selected.has(data.id) ? ' is-selected' : '' : isSelected ? " is-selected" : ""}${isDropTarget ? " is-drop-target" : ""}${isDragging ? " is-dragging" : ""}`}
      style={style}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (actions?.openEditor) { actions.openEditor(String(data.key)); return; }
        if (!item.isFolder()) return;
        if (item.isExpanded()) item.collapse();
        else item.expand();
      }}
      onContextMenu={(event) => actions?.openContextMenu(event, data)}
    >
      <div className="setting-library-tree-row-content">
        <EditorSelectionCheckbox selection={actions?.selection} id={data.id} label={data.label} disabled={actions?.saving || data.fixed} />
        {data.nodeKind === "group" ? (
          <button
            type="button"
            className="setting-library-tree-expander"
            aria-label={isExpanded ? tUi("折叠文件夹") : tUi("展开文件夹")}
            aria-expanded={isExpanded}
            onDoubleClick={event => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (item.isExpanded()) item.collapse();
              else item.expand();
            }}
          >
            <span className="setting-library-tree-folder" aria-hidden="true">
              {isExpanded ? <DshFolderOpenIcon /> : <DshFolderClosedIcon />}
            </span>
            <DshTriangleRightIcon className={`setting-library-tree-arrow${isExpanded ? " is-expanded" : ""}`} />
          </button>
        ) : <span className={`setting-library-tree-entry-icon${data.contentMode === "ejs" ? " is-controller" : ""}${data.dynamicMode === "ejs_reference" ? " is-reference" : ""}`} aria-hidden="true">
          {Icon ? <Icon weight="regular" /> : <SettingEntryGlyph iconId={data.iconId} weight="regular" />}
        </span>}
        <span className="setting-library-tree-label">{data.label}</span>
        {!actions?.selection?.active && (data.nodeKind === "group" ? <span className="setting-library-tree-count">{data.childCount}</span> : (
          <button
            type="button"
            className="setting-library-tree-switch"
            role="switch"
            aria-checked={data.enabled}
            disabled={actions?.saving}
            aria-label={`${data.enabled ? tUi("停用") : tUi("启用")}${data.label}`}
            onDoubleClick={event => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              actions.updateEntryById(data.recordId, { enabled: !data.enabled });
            }}
          ><span aria-hidden="true" /></button>
        ))}
      </div>
    </div>
  );
}

export function SettingLibraryTree({ nodes, query, selectedId, expandedIds, onSelectedIdChange, onExpandedIdsChange, onMove, ariaLabel, touchReorder, dragEnabled }) {
  return <HeadlessTree
    nodes={nodes}
    touchReorder={touchReorder}
    dragEnabled={dragEnabled}
    query={query}
    selectedId={selectedId}
    expandedIds={expandedIds}
    ariaLabel={ariaLabel}
    dragLineClassName="setting-library-tree-drop-cursor"
    onSelectedIdChange={onSelectedIdChange}
    onExpandedIdsChange={onExpandedIdsChange}
    onMove={onMove}
    renderItem={({ key, ...props }) => <SettingTreeNode key={key} {...props} />}
  />;
}
