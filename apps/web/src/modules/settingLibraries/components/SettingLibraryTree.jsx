import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { createContext, useContext } from "react";
import { ChatCircleDots, Code } from "../../../ui/icons/interfaceIcons.jsx";
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { DshFolderClosedIcon, DshFolderOpenIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { HeadlessTree } from "../../../ui/tree/HeadlessTree.jsx";
import { SETTING_RULE_TYPES, SettingEntryGlyph } from "./SettingEntryFields.jsx";
import { EditorSelectionCheckbox } from '../../../ui/ui/EditorCollectionControls.jsx';
import { EditorToggle } from '../../../ui/ui/EditorToggle.jsx';

export const SettingTreeActionsContext = createContext(null);

function entryIcon(data) {
  if (data.entryKind === "opening") return ChatCircleDots;
  if (data.contentMode === "ejs") return Code;
  return null;
}

export function SettingTreeNode({ item, data, itemProps, style, level, isSelected, isExpanded, isDropTarget, isDragging }) {
  const tUi = useProductTranslation();
  const actions = useContext(SettingTreeActionsContext);
  const Icon = data.rule ? null : entryIcon(data);
  const ruleType = data.rule?.enabled ? SETTING_RULE_TYPES.find(option => option.value === data.rule.type) : null;
  const ruleLabel = ruleType ? tUi(ruleType.label) : tUi('无规则');
  const dimmed = data.rule ? !data.rule.enabled && !data.usesEjs : data.enabled === false;

  return (
    <div
      {...itemProps}
      className={`setting-library-tree-row${data.nodeKind === "entry" ? " has-toggle" : ""}${dimmed ? data.rule ? " is-rule-inactive" : " is-disabled" : ""}${level > 0 ? " is-nested" : ""}${actions?.selection?.active ? actions.selection.selected.has(data.id) ? ' is-selected' : '' : isSelected ? " is-selected" : ""}${isDropTarget ? " is-drop-target" : ""}${isDragging ? " is-dragging" : ""}`}
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
        {data.nodeKind === "group" ? <>
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
            {isExpanded ? <CaretDown size={13} /> : <CaretRight size={13} />}
          </button>
          <span className="setting-library-tree-folder" aria-hidden="true">
            {isExpanded ? <DshFolderOpenIcon /> : <DshFolderClosedIcon />}
          </span>
        </> : <span className={`setting-library-tree-entry-icon${data.contentMode === "ejs" ? " is-controller" : ""}`} aria-hidden="true">
          {Icon ? <Icon weight="regular" /> : <SettingEntryGlyph iconId={data.iconId} weight="regular" />}
        </span>}
        <span className="setting-library-tree-label" title={data.label}>{data.label}</span>
        {!actions?.selection?.active && (data.nodeKind === "group" ? <span className="setting-library-tree-count">{data.childCount}</span> : data.rule ? <>
          {data.usesEjs && <span className="setting-rule-ejs-tag" title={tUi('正文包含 EJS 或被 EJS 引用')}>EJS</span>}
          <span className="setting-rule-control">
            <span className="setting-rule-badge" data-rule-type={ruleType?.value} title={ruleLabel}>
              {ruleType?.value === 'lookup' ? <ruleType.Icon size={13} aria-hidden="true" /> : ruleType && <span className="setting-rule-dot" aria-hidden="true" />}
              <span>{ruleType?.badgeLabel ? tUi(ruleType.badgeLabel) : ruleLabel}</span>
            </span>
            <EditorToggle className="setting-library-tree-switch" checked={data.rule.enabled} disabled={actions?.saving}
              label={tUi('{value0}的触发规则', { value0: data.label })} title={tUi('触发规则')}
              onChange={enabled => actions.updateEntryById(data.recordId, { enabled })} />
          </span>
        </> : (
          <EditorToggle
            className="setting-library-tree-switch"
            checked={data.enabled}
            disabled={actions?.saving}
            label={`${data.enabled ? tUi("停用") : tUi("启用")}${data.label}`}
            onChange={enabled => actions.updateEntryById(data.recordId, { enabled })}
          />
        ))}
      </div>
    </div>
  );
}

export function SettingLibraryTree({ nodes, query, selectedId, expandedIds, onSelectedIdChange, onExpandedIdsChange, onMove, ariaLabel, touchReorder, dragEnabled }) {
  return <HeadlessTree
    nodes={nodes}
    branchGuides
    indent={27}
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
