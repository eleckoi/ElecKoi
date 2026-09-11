import { Trash, X } from "@phosphor-icons/react";
import { DshFolderClosedIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { FIXED_ENTRY_IDS } from "../model/settingLibraryEditing.js";
import { MarkdownTextareaField } from "./MarkdownTextareaField.jsx";
import { OpeningEditor } from "./OpeningEditor.jsx";
import { SettingEntryGlyph, SettingLibraryEntryEditor } from "./SettingLibraryEntryEditor.jsx";

function EntryEditor({
  entry,
  entries,
  groups,
  promptPositions,
  nameInputRef,
  onChange,
  onEntriesChange,
  onOpenEntry,
  onRequestDeleteOpening,
  onPromptPositionsChange,
}) {
  if (entry.kind === "opening") {
    return <OpeningEditor entry={entry} onChange={onChange} onRequestDelete={onRequestDeleteOpening} />;
  }

  const isReference = entry.dynamicMode === "ejs_reference";
  const isFixed = FIXED_ENTRY_IDS.has(entry.id);
  if (!isReference && !isFixed) {
    return (
      <SettingLibraryEntryEditor
        entry={entry}
        entries={entries}
        groups={groups}
        promptPositions={promptPositions}
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
          <span>引用名称</span>
          <input ref={nameInputRef} value={entry.title} maxLength={60} placeholder="供 getwi 按名称读取" onChange={(event) => onChange({ ...entry, title: event.target.value })} />
        </label>
      ) : null}
      <MarkdownTextareaField
        label={isReference ? "引用正文" : fixedEntryContentLabel(entry)}
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
  nameInputRef,
  SelectedIcon,
  onClose,
  onUpdateGroup,
  onDeleteGroup,
  onUpdateEntry,
  onEntriesChange,
  onOpenEntry,
  onRequestDeleteOpening,
  onPromptPositionsChange,
}) {
  if (!selected.value) return null;
  return (
    <aside className="setting-library-inspector" aria-label="设定编辑器">
      <header className="setting-library-inspector-header">
        <div>
          {selected.kind === "entry" && !FIXED_ENTRY_IDS.has(selected.value.id) && !["ejs_controller", "ejs_reference"].includes(selected.value.dynamicMode)
            ? <SettingEntryGlyph iconId={selected.value.iconId} size={19} aria-hidden="true" />
            : selected.kind === "group" ? <DshFolderClosedIcon size={19} aria-hidden="true" /> : <SelectedIcon size={19} aria-hidden="true" />}
          <strong>{selected.kind === "group" ? "文件夹" : selected.value.dynamicMode === "ejs_reference" ? "引用条目" : selected.value.title}</strong>
        </div>
        <button type="button" aria-label="关闭编辑器" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="setting-library-inspector-body">
        {selected.kind === "group" ? (
          <div className="setting-library-group-editor">
            <label><span>文件夹名称</span><input ref={nameInputRef} value={selected.value.name} maxLength={80} onChange={(event) => onUpdateGroup({ name: event.target.value })} /></label>
            <button type="button" className="setting-library-delete-link" onClick={onDeleteGroup}><Trash size={15} />删除文件夹</button>
          </div>
        ) : (
          <EntryEditor
            entry={selected.value}
            entries={library.entries}
            groups={library.groups}
            promptPositions={library.promptPositions}
            nameInputRef={nameInputRef}
            onChange={onUpdateEntry}
            onEntriesChange={onEntriesChange}
            onOpenEntry={onOpenEntry}
            onRequestDeleteOpening={onRequestDeleteOpening}
            onPromptPositionsChange={onPromptPositionsChange}
          />
        )}
      </div>
    </aside>
  );
}
