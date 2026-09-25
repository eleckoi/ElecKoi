import { useEffect, useId, useRef, useState } from "react";
import { CaretDown, X } from "@phosphor-icons/react";
import { generatedInitialStatePreviewJson, generatedObjectStateJson } from "../../../../../shared/foundation/variables/initialState.ts";
import { VARIABLE_INITIALIZATION_OBJECT_ID } from "../../../../../shared/contracts/variables/schemas.ts";
import { VariableEntryIcon, VariableGroupIcon } from "./VariableConfigTree.jsx";
import { variablePointerPath } from "../model/variableConfigEditing.js";

function Field({ label, children, wide = false, fill = false, hint = "" }) {
  return <label className={`variable-field${wide ? " is-wide" : ""}${fill ? " is-fill" : ""}`}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

const VARIABLE_TYPES = [
  { value: "number", description: "JS number，可保存整数或小数" },
  { value: "string", description: "JS string，用于文字状态和描述" },
  { value: "boolean", description: "JS boolean，只保存 true / false" },
  { value: "object", description: "JSON object，由具名字段组成的对象" },
  { value: "array", description: "JSON array，有顺序的一组 JSON 值" },
];

function VariableTypeSelect({ value, onSelect }) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const labelId = useId();
  const listId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const selected = VARIABLE_TYPES.find((item) => item.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  function showOptions(index = Math.max(0, VARIABLE_TYPES.findIndex((item) => item.value === value))) {
    setFocusedIndex(index);
    setOpen(true);
  }

  function choose(type) {
    setOpen(false);
    onSelect(type);
    triggerRef.current?.focus();
  }

  function onOptionKeyDown(event) {
    let nextIndex;
    if (event.key === "ArrowDown") nextIndex = Math.min(VARIABLE_TYPES.length - 1, focusedIndex + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, focusedIndex - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = VARIABLE_TYPES.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    } else return;
    event.preventDefault();
    setFocusedIndex(nextIndex);
  }

  return <div className="variable-field variable-type-field" ref={rootRef} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <span id={labelId}>数据结构</span>
    <button
      type="button"
      className="variable-type-trigger"
      ref={triggerRef}
      aria-labelledby={labelId}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      onClick={() => open ? setOpen(false) : showOptions()}
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        showOptions(event.key === "ArrowDown" ? 0 : VARIABLE_TYPES.length - 1);
      }}
    >
      {selected ? <VariableEntryIcon type={selected.value} size={17} /> : null}
      <span className={selected ? "" : "is-placeholder"}>{selected?.value || "请选择 JSON 数据结构"}</span>
      <CaretDown size={15} aria-hidden="true" />
    </button>
    {open ? <div className="variable-type-options" id={listId} role="listbox" aria-labelledby={labelId} onKeyDown={onOptionKeyDown}>
      {VARIABLE_TYPES.map((item, index) => <button
        type="button"
        role="option"
        aria-selected={value === item.value}
        className={`variable-type-option${value === item.value ? " is-selected" : ""}`}
        key={item.value}
        ref={(element) => { optionRefs.current[index] = element; }}
        onFocus={() => setFocusedIndex(index)}
        onClick={() => choose(item.value)}
      >
        <VariableEntryIcon type={item.value} size={20} />
        <span><strong>{item.value}</strong><small>{item.description}</small></span>
      </button>)}
    </div> : null}
  </div>;
}

function InitializationEditor({ config, onChange }) {
  const [tab, setTab] = useState("preview");
  return (
    <div className="variable-init-editor">
      <div className="variable-segmented variable-init-tabs" role="tablist" aria-label="变量运行配置">
        <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>初始状态预览</button>
        <button type="button" role="tab" aria-selected={tab === "schema"} onClick={() => setTab("schema")}>Zod 校验</button>
      </div>
      {tab === "preview" ? (
        <Field label="生成的初始状态" fill>
          <textarea className="variable-code-area" readOnly value={generatedInitialStatePreviewJson(config.objects, config.variables)} />
        </Field>
      ) : (
        <Field label="变量总校验" fill hint="运行时提供全局 z，请直接填写 z.object(...)，无需 import。">
          <textarea className="variable-code-area" value={config.schemaCode} onChange={(event) => onChange({ ...config, schemaCode: event.target.value })} placeholder="z.object({ ... })" />
        </Field>
      )}
    </div>
  );
}

function ObjectEditor({ config, object, nameInputRef, onChange, onReplaceContents }) {
  const [jsonText, setJsonText] = useState("{}");
  const [jsonError, setJsonError] = useState("");
  useEffect(() => {
    setJsonText(generatedObjectStateJson(object.id, config.objects, config.variables));
    setJsonError("");
  }, [object.id]);
  const update = (patch) => onChange({ ...config, objects: config.objects.map((item) => item.id === object.id ? { ...item, ...patch } : item) });
  return (
    <div className="variable-inspector-form">
      <Field label="路径" wide><input readOnly value={variablePointerPath(config, { kind: "object", value: object })} /></Field>
      <Field label="变量组名称" wide><input ref={nameInputRef} maxLength={40} value={object.name} onChange={(event) => update({ name: event.target.value })} /></Field>
      <Field label="说明" wide><textarea value={object.description} onChange={(event) => update({ description: event.target.value })} placeholder="这个变量组保存什么信息" /></Field>
      <Field label="更新规则" wide><textarea value={object.updateRule} onChange={(event) => update({ updateRule: event.target.value })} placeholder="何时、如何更新这个变量组" /></Field>
      <div className="variable-object-json-heading"><div><strong>对象内容</strong><span>JSON</span></div><button type="button" onClick={() => { try { onReplaceContents(object.id, jsonText); setJsonError(""); } catch (error) { setJsonError(error?.message || "JSON 格式不正确"); } }}>应用结构</button></div>
      <textarea className="variable-code-area is-object" value={jsonText} onChange={(event) => setJsonText(event.target.value)} spellCheck="false" />
      {jsonError ? <p className="variable-inline-error" role="alert">{jsonError}</p> : null}
    </div>
  );
}

function VariableEditor({ config, variable, nameInputRef, onChange, onConvert }) {
  const update = (patch) => onChange({ ...config, variables: config.variables.map((item) => item.id === variable.id ? { ...item, ...patch } : item) });
  const defaultControl = variable.type === "boolean" ? (
    <select value={variable.defaultValue || "false"} onChange={(event) => update({ defaultValue: event.target.value })}><option value="false">false</option><option value="true">true</option></select>
  ) : variable.type === "array" ? (
    <textarea className="is-code" value={variable.defaultValue} onChange={(event) => update({ defaultValue: event.target.value })} placeholder="[]" />
  ) : (
    <input type={variable.type === "number" ? "number" : "text"} value={variable.defaultValue} onChange={(event) => update({ defaultValue: event.target.value })} />
  );
  return (
    <div className="variable-inspector-form">
      <Field label="路径" wide><input readOnly value={variablePointerPath(config, { kind: "variable", value: variable })} /></Field>
      <Field label="读取方式" wide>
        <div className="variable-segmented">
          <button type="button" aria-pressed={variable.readMode === "required"} onClick={() => update({ readMode: "required" })}>必读</button>
          <button type="button" aria-pressed={variable.readMode === "on_demand"} onClick={() => update({ readMode: "on_demand" })}>按需读取</button>
        </div>
      </Field>
      <Field label="变量名称"><input ref={nameInputRef} maxLength={60} value={variable.title} onChange={(event) => update({ title: event.target.value })} /></Field>
      <VariableTypeSelect key={variable.id} value={variable.type} onSelect={(type) => type === "object" ? onConvert(variable.id) : update({ type })} />
      <Field label="默认值" wide>{defaultControl}</Field>
      <Field label="说明" wide><textarea value={variable.description} onChange={(event) => update({ description: event.target.value })} placeholder="这个变量表示什么" /></Field>
      <Field label="更新规则" wide><textarea value={variable.updateRule} onChange={(event) => update({ updateRule: event.target.value })} placeholder="何时、如何更新这个变量" /></Field>
    </div>
  );
}

export function VariableConfigInspector({ config, selected, nameInputRef, onClose, onChange, onReplaceContents, onConvert }) {
  if (!selected.value) return null;
  const fixed = selected.kind === "object" && selected.value.id === VARIABLE_INITIALIZATION_OBJECT_ID;
  return (
    <aside className={`variable-inspector${fixed ? " is-initialization" : ""}`} aria-label="变量编辑器">
      <header className="variable-inspector-header">
        <div>{selected.kind === "object" ? <VariableGroupIcon initialization={fixed} size={18} /> : <VariableEntryIcon type={selected.value.type} size={18} />}<strong>{fixed ? "变量运行配置" : selected.kind === "object" ? selected.value.name : selected.value.title}</strong></div>
        <button type="button" aria-label="关闭编辑器" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="variable-inspector-body">
        {fixed ? <InitializationEditor config={config} onChange={onChange} /> : selected.kind === "object" ? (
          <ObjectEditor config={config} object={selected.value} nameInputRef={nameInputRef} onChange={onChange} onReplaceContents={onReplaceContents} />
        ) : <VariableEditor config={config} variable={selected.value} nameInputRef={nameInputRef} onChange={onChange} onConvert={onConvert} />}
      </div>
    </aside>
  );
}
