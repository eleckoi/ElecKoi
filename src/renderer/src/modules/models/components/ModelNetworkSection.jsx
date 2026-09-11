import { PlusIcon, TrashIcon } from "../../../ui/icons/index.jsx";

export function ModelNetworkSection({ form, draftHeader, setDraftHeader, onUpdateField, onUpdateHeader, onAddHeader }) {
  return (
    <section className="model-form-section">
      <h3>网络</h3>
      <label>
        <span>网络代理 URL（可选）</span>
        <input value={form.proxy_url || ""} onChange={(event) => onUpdateField("proxy_url", event.target.value)} placeholder="一般留空，例如 http://127.0.0.1:7890" />
      </label>
      <div className="model-headers-editor">
        <div className="model-section-heading">
          <h4>自定义请求头</h4>
          <span>随每次请求发送，常用于网关鉴权</span>
        </div>
        {Object.entries(form.custom_headers || {}).map(([name, value]) => (
          <div className="model-header-row" key={name}>
            <input value={name} aria-label="请求头名称" readOnly />
            <input value={value} aria-label={`${name} 请求头值`} onChange={(event) => onUpdateHeader(name, name, event.target.value)} />
            <button type="button" aria-label={`删除 ${name}`} title={`删除 ${name}`} onClick={() => onUpdateHeader(name, "", "")}><TrashIcon /></button>
          </div>
        ))}
        <div className="model-header-row draft">
          <input value={draftHeader.name} onChange={(event) => setDraftHeader((current) => ({ ...current, name: event.target.value }))} placeholder="Header 名称" aria-label="新请求头名称" />
          <input value={draftHeader.value} onChange={(event) => setDraftHeader((current) => ({ ...current, value: event.target.value }))} placeholder="值" aria-label="新请求头值" />
          <button type="button" aria-label="添加请求头" title="添加请求头" onClick={onAddHeader}><PlusIcon /></button>
        </div>
      </div>
    </section>
  );
}
