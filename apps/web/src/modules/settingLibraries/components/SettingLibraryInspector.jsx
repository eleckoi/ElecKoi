import { ArrowsMerge, Trash, X } from "../../../ui/icons/interfaceIcons.jsx";
import { DshFolderClosedIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { ExportIcon, ImportIcon } from "../../../ui/icons/index.jsx";
import { FIXED_ENTRY_IDS } from "../model/settingLibraryEditing.js";
import { MarkdownTextareaField } from "./MarkdownTextareaField.jsx";
import { OpeningEditor } from "./OpeningEditor.jsx";
import { SettingEntryGlyph, SettingLibraryEntryEditor } from "./SettingLibraryEntryEditor.jsx";

function EntryEditor({
  entry,
  variableVersions,
  variableVersionsError,
  entries,
  promptPositions,
  allowCustomPromptPositions,
  nameInputRef,
  onChange,
  onEntriesChange,
  onOpenEntry,
  onRequestDeleteOpening,
  onPromptPositionsChange,
}) {
  if (entry.kind === "opening") {
    return <OpeningEditor entry={entry} variableVersions={variableVersions} variableVersionsError={variableVersionsError} onChange={onChange} onRequestDelete={onRequestDeleteOpening} />;
  }

  const isReference = entry.dynamicMode === "ejs_reference";
  const isFixed = FIXED_ENTRY_IDS.has(entry.id);
  if (!isReference && !isFixed) {
    return (
      <SettingLibraryEntryEditor
        entry={entry}
        entries={entries}
        promptPositions={promptPositions}
        allowCustomPromptPositions={allowCustomPromptPositions}
        nameInputRef={nameInputRef}
        onChange={onChange}
        onEntriesChange={onEntriesChange}
        onOpenEntry={onOpenEntry}
        onPromptPositionsChange={onPromptPositionsChange}
      />
    );
  }

  return (
    <div className="setting-library-entry-editor">
      {isReference ? (
        <label className="setting-library-title-field">
          <span>EJS引用名称</span>
          <input ref={nameInputRef} value={entry.title} maxLength={60} placeholder="供 getwi 按名称读取" onChange={(event) => onChange({ ...entry, title: event.target.value })} />
        </label>
      ) : null}
      <MarkdownTextareaField
        label={isReference ? "EJS引用正文" : fixedEntryContentLabel(entry)}
        value={entry.content}
        placeholder={isReference ? "填写供 EJS 控制器读取的内容" : fixedEntryContentPlaceholder(entry)}
        onChange={(content) => onChange({ ...entry, content })}
      />
    </div>
  );
}

function fixedEntryContentLabel(entry) {
  return entry.kind === "history_compaction" ? "摘要模板" : "设定正文";
}

function fixedEntryContentPlaceholder(entry) {
  return entry.kind === "history_compaction" ? "填写自动压缩使用的摘要要求" : "填写设定正文";
}

export function SettingLibraryInspector({
  selected,
  library,
  variableVersions,
  variableVersionsError,
  nameInputRef,
  SelectedIcon,
  onClose,
  onUpdateGroup,
  onDeleteGroup,
  onImportGroup,
  onExportGroup,
  onSendGroups,
  transferBusy = false,
  onUpdateEntry,
  onEntriesChange,
  onOpenEntry,
  onRequestDeleteOpening,
  onPromptPositionsChange,
  allowCustomPromptPositions = false,
}) {
  if (!selected.value) return null;
  return (
    <aside className="setting-library-inspector" aria-label="设定编辑器">
      <header className="setting-library-inspector-header">
        <div>
          {selected.kind === "entry" && !FIXED_ENTRY_IDS.has(selected.value.id) && selected.value.contentMode !== "ejs" && selected.value.dynamicMode !== "ejs_reference"
            ? <SettingEntryGlyph iconId={selected.value.iconId} size={19} aria-hidden="true" />
            : selected.kind === "group" ? <DshFolderClosedIcon size={19} aria-hidden="true" /> : <SelectedIcon size={19} aria-hidden="true" />}
          <strong>{selected.kind === "group" ? "文件夹" : selected.value.dynamicMode === "ejs_reference" ? "EJS引用设定" : selected.value.title}</strong>
        </div>
        <button type="button" aria-label="关闭编辑器" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="setting-library-inspector-body">
        {selected.kind === "group" ? (
          <div className="setting-library-group-editor">
            <label><span>文件夹名称</span><input ref={nameInputRef} value={selected.value.name} maxLength={80} onChange={(event) => onUpdateGroup({ name: event.target.value })} /></label>
            {onSendGroups ? <div className="setting-library-merge-send-row">
              <span><ArrowsMerge size={18} />合并发送</span>
              <button type="button" className="setting-library-tree-switch" role="switch" aria-label="文件夹合并发送" aria-checked={Boolean(selected.value.mergeSend)}
                onClick={() => onUpdateGroup({ mergeSend: !selected.value.mergeSend })}><span aria-hidden="true" /></button>
            </div> : null}
            <div className="setting-library-folder-transfer-actions" role="group" aria-label="文件夹世界书">
              <button type="button" disabled={transferBusy} title="导入到此文件夹" aria-label="导入到此文件夹" onClick={onImportGroup}><ImportIcon size={17} aria-hidden="true" />导入</button>
              <button type="button" disabled={transferBusy} title="导出此文件夹世界书" aria-label="导出此文件夹世界书" onClick={onExportGroup}><ExportIcon size={17} aria-hidden="true" />导出</button>
              {onSendGroups ? <button type="button" onClick={() => onSendGroups(selected.value.id)}><ArrowsMerge size={17} />组合条目</button> : null}
            </div>
            <button type="button" className="setting-library-delete-link" onClick={onDeleteGroup}><Trash size={15} />删除文件夹</button>
          </div>
        ) : (
          <>
          {selected.value.sendGroupId && onSendGroups ? <button type="button" className="setting-library-send-group-link" onClick={() => onSendGroups('', selected.value.sendGroupId)}>
            <ArrowsMerge size={16} />发送组合 · {library.entries.filter(entry => entry.sendGroupId === selected.value.sendGroupId).length} 条
          </button> : null}
          <EntryEditor
            entry={selected.value}
            variableVersions={variableVersions}
            variableVersionsError={variableVersionsError}
            entries={library.entries}
            promptPositions={library.promptPositions}
            allowCustomPromptPositions={allowCustomPromptPositions}
            nameInputRef={nameInputRef}
            onChange={onUpdateEntry}
            onEntriesChange={onEntriesChange}
            onOpenEntry={onOpenEntry}
            onRequestDeleteOpening={onRequestDeleteOpening}
            onPromptPositionsChange={onPromptPositionsChange}
          />
          </>
        )}
      </div>
    </aside>
  );
}
