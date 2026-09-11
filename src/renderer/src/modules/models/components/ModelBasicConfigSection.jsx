import { ChevronRightIcon, DownloadIcon, PlugIcon, PlusIcon, TrashIcon } from "../../../ui/icons/index.jsx";
import { configVersionName } from "../model/modelProviderCatalog.js";

const API_FORMATS = [
  { id: "responses", label: "Responses API" },
  { id: "chat_completions", label: "Chat Completions" },
  { id: "anthropic_messages", label: "Messages API" },
  { id: "google_gemini", label: "Generate Content" },
];

export function ModelBasicConfigSection({ editor }) {
  const {
    form,
    activeProvider,
    isImageProvider,
    versionPickerRef,
    versionMenuOpen,
    setVersionMenuOpen,
    selectedVersionName,
    providerVersionItems,
    selectedConfigId,
    selectConfigId,
    createConfigPlaceholder,
    willClearCurrentConfig,
    confirmDeleteConfig,
    setConfirmDeleteConfig,
    canDeleteCurrent,
    currentVersionConfig,
    setDeleteTargetConfig,
    deleteTargetVersionName,
    deleting,
    deleteCurrentConfig,
    modelPickerRef,
    manualModelRef,
    modelMenuOpen,
    setModelMenuOpen,
    modelItems,
    selectModel,
    loadingModels,
    fetchModels,
    manualModelOpen,
    setManualModelOpen,
    manualModelName,
    setManualModelName,
    addManualModel,
    connectionTest,
    testingConnection,
    testConnection,
    updateField,
  } = editor;

  return (
    <section className="model-form-section">
      <h3>基础配置</h3>
      <div className={`model-form-row model-name-version-row${isImageProvider ? " is-image" : ""}`}>
        <label>
          <span>配置名称</span>
          <input value={form.name || ""} onChange={(event) => updateField("name", event.target.value)} placeholder="待命名" />
        </label>
        {!isImageProvider ? <div className="model-version-control">
          <label>
            <span>配置版本</span>
            <div className="model-version-picker" ref={versionPickerRef}>
              <button className="model-split-select-value" type="button" onClick={() => setVersionMenuOpen((current) => !current)}>
                {selectedVersionName}
              </button>
              <button className="model-split-select-arrow" type="button" title="展开配置版本" onClick={() => setVersionMenuOpen((current) => !current)}>
                <ChevronRightIcon />
              </button>
              <div className={`model-version-menu ${versionMenuOpen ? "open" : ""}`}>
                {providerVersionItems.length ? providerVersionItems.map((item) => (
                  <button
                    key={item.id}
                    className={item.id === selectedConfigId ? "active" : ""}
                    type="button"
                    onClick={() => {
                      setVersionMenuOpen(false);
                      selectConfigId(item.id);
                    }}
                  >
                    {configVersionName({ ...item, name: item.id === form.id ? form.name : item.name }, providerVersionItems)}
                  </button>
                )) : <div className="model-picker-empty">暂无配置</div>}
              </div>
            </div>
          </label>
          <button className="model-icon-button" type="button" title="新建配置" onClick={() => createConfigPlaceholder()}><PlusIcon /></button>
          <div className="model-delete-menu">
            <button
              className="model-icon-button danger"
              type="button"
              title={willClearCurrentConfig ? "清空当前配置" : "删除当前配置"}
              aria-expanded={confirmDeleteConfig}
              disabled={!canDeleteCurrent}
              onClick={() => {
                const nextOpen = !confirmDeleteConfig;
                setDeleteTargetConfig(nextOpen ? currentVersionConfig : null);
                setConfirmDeleteConfig(nextOpen);
              }}
            ><TrashIcon /></button>
            {confirmDeleteConfig ? (
              <div className="model-delete-popover">
                <strong>{willClearCurrentConfig ? "清空配置：" : "删除配置："}{deleteTargetVersionName}</strong>
                <span>{willClearCurrentConfig ? "这是当前模型库的最后一个配置，会清空参数并还原成初始配置。" : "当前配置会从本地删除，其他模型配置不受影响。"}</span>
                <div>
                  <button type="button" onClick={() => { setConfirmDeleteConfig(false); setDeleteTargetConfig(null); }}>取消</button>
                  <button type="button" className="danger" disabled={deleting} onClick={deleteCurrentConfig}>确认删除</button>
                </div>
              </div>
            ) : null}
          </div>
        </div> : null}
      </div>
      {!isImageProvider ? <div className="model-form-single-row">
        <label>
          <span>接口格式</span>
          <div className="model-api-format-control">
            <select value={form.api_format || "responses"} onChange={(event) => updateField("api_format", event.target.value)}>
              {API_FORMATS.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
            </select>
            <ChevronRightIcon />
          </div>
        </label>
      </div> : null}
      <div className="model-form-single-row">
        <label>
          <span>反代地址</span>
          <input value={form.base_url || ""} onChange={(event) => updateField("base_url", event.target.value)} placeholder={activeProvider.baseUrlPlaceholder} />
        </label>
      </div>
      <div className="model-form-single-row">
        <label>
          <span>API Key</span>
          <input type="password" autoComplete="off" value={form.api_key || ""} onChange={(event) => updateField("api_key", event.target.value)} placeholder={activeProvider.apiKeyPlaceholder} />
        </label>
      </div>
      {isImageProvider ? (
        <div className="model-form-single-row">
          <label>
            <span>模型</span>
            <input value={form.model || ""} onChange={(event) => updateField("model", event.target.value)} placeholder={activeProvider.modelPlaceholder} />
          </label>
        </div>
      ) : <div className="model-form-single-row">
        <label className="model-picker-field">
          <span>模型列表</span>
          <div className="model-picker-control">
            <div className="model-picker-shell" ref={modelPickerRef}>
              <button className={`model-picker-value ${(form.model || "").trim() ? "" : "empty"}`} type="button" onClick={() => setModelMenuOpen((current) => !current)}>
                {(form.model || "").trim() || activeProvider.modelPlaceholder}
              </button>
              <button type="button" title="展开模型列表" onClick={() => setModelMenuOpen((current) => !current)}><ChevronRightIcon /></button>
              <div className={`model-picker-menu ${modelMenuOpen ? "open" : ""}`}>
                {modelItems.length ? modelItems.map((item) => (
                  <button key={item.id} type="button" className={item.id === form.model ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => selectModel(item.id)}>
                    <b>{item.id}</b>
                    {item.name !== item.id ? <span>{item.name}</span> : null}
                  </button>
                )) : <div className="model-picker-empty">读取模型后会显示在这里</div>}
              </div>
            </div>
            <div className="model-manual-add-anchor" ref={manualModelRef}>
              <button
                className="model-add-button"
                type="button"
                aria-expanded={manualModelOpen}
                aria-controls="model-manual-add-popover"
                onClick={() => {
                  setModelMenuOpen(false);
                  setManualModelOpen((current) => !current);
                }}
              ><PlusIcon /><span>添加模型</span></button>
              {manualModelOpen ? (
                <div className="model-manual-add" id="model-manual-add-popover">
                  <input
                    autoFocus
                    value={manualModelName}
                    onChange={(event) => setManualModelName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); addManualModel(); }
                      if (event.key === "Escape") setManualModelOpen(false);
                    }}
                    placeholder="填写服务商提供的完整模型名"
                    aria-label="模型名"
                  />
                  <div>
                    <button type="button" onClick={() => setManualModelOpen(false)}>取消</button>
                    <button type="button" onClick={addManualModel}>添加并使用</button>
                  </div>
                </div>
              ) : null}
            </div>
            <button className="model-fetch-button" type="button" onClick={fetchModels} disabled={loadingModels}>
              <DownloadIcon /><span>{loadingModels ? "读取中" : "读取模型"}</span>
            </button>
            <button className={`model-test-button ${connectionTest.status === "success" ? "success" : ""}`} type="button" onClick={testConnection} disabled={testingConnection}>
              {testingConnection ? <span className="model-test-spinner" aria-hidden="true" /> : connectionTest.status === "success" ? <span className="model-test-check" aria-hidden="true" /> : <PlugIcon size={17} />}
              <span>{testingConnection ? "测试中" : connectionTest.status === "success" ? "成功" : "测试连接"}</span>
            </button>
          </div>
        </label>
      </div>}
    </section>
  );
}
