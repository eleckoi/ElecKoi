import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { ChevronRightIcon, DownloadIcon, PlusIcon, TrashIcon } from "../../../ui/icons/index.jsx";

const API_FORMATS = [
  { id: "responses", label: "Responses API" },
  { id: "chat_completions", label: "Chat Completions API" },
  { id: "anthropic_messages", label: "Messages API" },
  { id: "google_gemini", label: "Generate Content API" },
];

export function ModelBasicConfigSection({ editor, compact = false, renderModelPicker, renderManualModel }) {
  const tUi = useProductTranslation();
  const [showApiKey, setShowApiKey] = useState(false);
  const [savedApiKey, setSavedApiKey] = useState("");
  const [readingApiKey, setReadingApiKey] = useState(false);
  const revealGeneration = useRef(0);
  const apiKeyInputId = useId();
  const {
    form,
    activeProvider,
    isImageProvider,
    isPersisted,
    providerIdError,
    onDelete,
    modelPickerRef,
    manualModelRef,
    modelMenuOpen,
    setModelMenuOpen,
    modelItems,
    removableModelIds,
    selectModel,
    deleteModel,
    loadingModels,
    fetchModels,
    manualModelOpen,
    setManualModelOpen,
    manualModelName,
    setManualModelName,
    addManualModel,
    updateField,
    onRevealApiKey,
    onCredentialError,
  } = editor;
  const isDedicatedDeepSeek = activeProvider.id === "deepseek";

  useEffect(() => {
    revealGeneration.current += 1;
    setShowApiKey(false);
    setSavedApiKey("");
    setReadingApiKey(false);
    return () => { revealGeneration.current += 1; };
  }, [form.id, form.credentialRef, form.credentialConfigured, activeProvider.id]);

  async function toggleApiKey() {
    if (showApiKey) {
      revealGeneration.current += 1;
      setShowApiKey(false);
      setSavedApiKey("");
      return;
    }
    if (form.api_key || !form.credentialConfigured) {
      setShowApiKey(true);
      return;
    }
    const generation = ++revealGeneration.current;
    setReadingApiKey(true);
    try {
      const value = await onRevealApiKey(form.id);
      if (generation !== revealGeneration.current) return;
      setSavedApiKey(value);
      setShowApiKey(true);
    } catch (error) {
      if (generation === revealGeneration.current) onCredentialError?.(error.message);
    } finally {
      if (generation === revealGeneration.current) setReadingApiKey(false);
    }
  }

  const nameField = <label>
          <span>{tUi("配置名称")}</span>
          <input value={form.name || ""} onChange={(event) => updateField("name", event.target.value)} placeholder={tUi("待命名")} />
        </label>;
  const providerIdField = <label className="model-provider-id-field">
    <span>Provider ID</span>
    <input value={form.id || ''} readOnly={form.builtin || isPersisted} onChange={event => updateField('id', event.target.value)} placeholder="acme-gateway" />
    {providerIdError && <small role="alert" className="model-parameter-error">{tUi("Provider ID 必须唯一，使用小写字母、数字和连字符，并以小写字母开头。")}</small>}
    {!form.builtin && <small>{tUi("以小写字母开头的标识，在请求中唯一标识该提供商，并用于派生凭据名。")}</small>}
  </label>;
  const directoryToggle = !isImageProvider && form.builtin && !isDedicatedDeepSeek
    ? <label className="model-directory-toggle"><input type="checkbox" checked={form.useBuiltinModels !== false} onChange={event => updateField("useBuiltinModels", event.target.checked)} />{tUi("使用内置模型目录")}</label>
    : null;
  const connectionFields = <>{!isImageProvider ? <div className="model-form-single-row">
        <label>
          <span>{tUi("接口格式")}</span>
          <div className="model-api-format-control">
            <select disabled={isDedicatedDeepSeek || form.builtin} value={form.api_format === "deepseek_messages" ? "anthropic_messages" : form.api_format || "responses"} onChange={(event) => updateField("api_format", event.target.value)}>
              {(form.builtin && !isDedicatedDeepSeek ? [{ id: "catalog", label: tUi("提供商默认") }] : isDedicatedDeepSeek ? API_FORMATS.filter((format) => format.id === "anthropic_messages") : API_FORMATS)
                .map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
            </select>
            <ChevronRightIcon />
          </div>
        </label>
      </div> : null}
      <div className="model-form-single-row">
        <label>
          <span>{tUi("API 地址")}</span>
          <input value={form.base_url || ""} onChange={(event) => updateField("base_url", event.target.value)} placeholder={form.builtin && !isDedicatedDeepSeek ? tUi("提供商默认") : activeProvider.baseUrlPlaceholder} />
        </label>
      </div>
      <div className="model-form-single-row">
        <div className="model-api-key-field">
          <label htmlFor={apiKeyInputId}><span>API Key</span></label>
          <div className="model-api-key-control">
            <input id={apiKeyInputId} type={showApiKey ? "text" : "password"} autoComplete="off" value={form.api_key || (showApiKey ? savedApiKey : "")} onChange={(event) => { revealGeneration.current += 1; setReadingApiKey(false); setSavedApiKey(""); updateField("api_key", event.target.value); }} placeholder={form.credentialConfigured ? tUi("已保存，留空保留") : activeProvider.apiKeyPlaceholder} />
            <button type="button" aria-label={showApiKey ? tUi("隐藏 API Key") : tUi("显示 API Key")} aria-pressed={showApiKey} aria-busy={readingApiKey} disabled={readingApiKey} onClick={toggleApiKey}>
              {showApiKey ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
      </>;
  const renderModelField = () => isImageProvider ? (
        <div className="model-form-single-row">
          <label>
            <span>{tUi("模型")}</span>
            <input value={form.model || ""} onChange={(event) => updateField("model", event.target.value)} placeholder={activeProvider.modelPlaceholder} />
          </label>
        </div>
      ) : <div className="model-form-single-row">
        <div className="model-picker-field" ref={compact ? undefined : manualModelRef}>
          {!compact && <span>{tUi("模型列表")}</span>}
          <div className="model-picker-control">
            <div className="model-picker-shell" ref={modelPickerRef}>
              <button className={`model-picker-value ${(form.model || "").trim() ? "" : "empty"}`} type="button" aria-label={tUi("选择模型：{value0}", {value0: form.model || tUi("未选择")})} aria-expanded={modelMenuOpen} onClick={() => setModelMenuOpen((current) => !current)}>
                {(form.model || "").trim() || activeProvider.modelPlaceholder}
              </button>
              <button type="button" title={tUi("展开模型列表")} onClick={() => setModelMenuOpen((current) => !current)}><ChevronRightIcon /></button>
              {renderModelPicker ? renderModelPicker(editor) : <div className={`model-picker-menu ${modelMenuOpen ? "open" : ""}`}>
                {modelItems.length ? modelItems.map((item) => (
                  <div key={item.id} className={`model-picker-option ${item.id === form.model ? "active" : ""}`}>
                    <button className="model-picker-option-select" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectModel(item.id)}>
                      <b>{item.id}</b>
                      {item.name !== item.id ? <span>{item.name}</span> : null}
                    </button>
                    {removableModelIds.has(item.id) ? (
                      <button
                        className="model-picker-option-delete"
                        type="button"
                        title={tUi("删除模型 {value0}", {value0: item.id})}
                        aria-label={tUi("删除模型 {value0}", {value0: item.id})}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteModel(item.id);
                        }}
                      ><TrashIcon /></button>
                    ) : null}
                  </div>
                )) : <div className="model-picker-empty">{tUi("读取模型后会显示在这里")}</div>}
              </div>}
            </div>
          </div>
          {!compact && <div className="model-list-actions">{modelActions}</div>}
          {!compact && manualModelOpen && <div className="model-manual-add" id="model-manual-add-form">
            <label htmlFor="model-manual-model-id">{tUi("模型 ID")}</label>
            <div className="model-manual-add-row">
              <input id="model-manual-model-id" autoFocus value={manualModelName}
                onChange={event => setManualModelName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); addManualModel(); }
                  if (event.key === 'Escape') setManualModelOpen(false);
                }} placeholder={tUi("填写提供商实际模型 ID")} aria-label={tUi("模型名")} />
              <button type="button" onClick={addManualModel}>{tUi("添加")}</button>
              <button type="button" onClick={() => setManualModelOpen(false)}>{tUi("取消")}</button>
            </div>
          </div>}
        </div>
      </div>;
  const manualModelControl = <div className="model-manual-add-anchor" ref={compact ? manualModelRef : undefined}>
              <button
                className="model-add-button"
                type="button"
                aria-expanded={manualModelOpen}
                aria-controls={compact ? undefined : 'model-manual-add-form'}
                aria-haspopup={compact ? 'dialog' : undefined}
                onClick={() => {
                  setModelMenuOpen(false);
                  setManualModelOpen((current) => !current);
                }}
              ><PlusIcon /><span>{tUi("添加模型")}</span></button>
              {compact && (renderManualModel ? renderManualModel(editor) : manualModelOpen ? (
                <div className="model-manual-add" id="model-manual-add-popover">
                  <input
                    autoFocus
                    value={manualModelName}
                    onChange={(event) => setManualModelName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); addManualModel(); }
                      if (event.key === "Escape") setManualModelOpen(false);
                    }}
                    placeholder={tUi("填写服务商提供的完整模型名")}
                    aria-label={tUi("模型名")}
                  />
                  <div>
                    <button type="button" onClick={() => setManualModelOpen(false)}>{tUi("取消")}</button>
                    <button type="button" onClick={addManualModel}>{tUi("添加并使用")}</button>
                  </div>
                </div>
              ) : null)}
            </div>;
  const modelActions = <>{manualModelControl}
            <button className="model-fetch-button" type="button" onClick={fetchModels} disabled={loadingModels}>
              <DownloadIcon /><span>{loadingModels ? tUi("读取中") : tUi("读取模型")}</span>
            </button>
          </>;
  if (compact) return <>
    <section className="mobile-model-section">
      <div className="mobile-model-section-heading"><h3>{tUi("配置")}</h3><button className="model-icon-button danger" type="button" aria-label={tUi("删除配置")} onClick={onDelete}><TrashIcon /></button></div>
      <div className="mobile-model-field-group mobile-model-configuration">{nameField}{providerIdField}</div>
    </section>
    <section className="mobile-model-section">
      <div className="mobile-model-section-heading"><h3>{tUi("连接")}</h3></div>
      <div className="mobile-model-field-group mobile-model-connection">{connectionFields}</div>
    </section>
    <section className="mobile-model-section">
      <div className="mobile-model-section-heading"><h3>{tUi("模型")}</h3></div>
      <div className="mobile-model-field-group mobile-model-selection">{directoryToggle}{renderModelField()}</div>
      {!isImageProvider && <div className="mobile-model-connection-actions">{modelActions}</div>}
    </section>
  </>;
  return (
    <section className="model-form-section">
      <h3>{tUi("基础配置")}</h3>
      <div className={`model-form-row model-name-provider-row${isImageProvider ? " is-image" : ""}`}>
        {nameField}
        {providerIdField}
      </div>
      {connectionFields}
      {directoryToggle}
      {renderModelField()}
    </section>
  );
}
