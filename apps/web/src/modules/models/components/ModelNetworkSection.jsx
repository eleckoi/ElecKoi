import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { PlusIcon, TrashIcon } from "../../../ui/icons/index.jsx";

export function ModelNetworkSection({ form, draftHeader, setDraftHeader, onUpdateField, onUpdateHeader, onAddHeader, compact = false }) {
  const tUi = useProductTranslation();
  return (
    <section className={`model-form-section${compact ? " mobile-model-section mobile-model-network" : " model-network-section"}`}>
      <h3>{compact ? tUi("网络") : tUi("网络与请求头")}</h3>
      <div className={compact ? 'mobile-model-field-group' : 'model-network-fields'}>
      <label>
        <span>{compact ? tUi("代理") : tUi("网络代理 URL")}</span>
        <input value="" disabled title={tUi("当前 DSH 适配器使用系统代理")} placeholder={tUi("使用系统代理")} />
      </label>
      <div className="model-headers-editor">
        {compact && <div className="model-section-heading">
          <h4>{tUi("自定义请求头")}</h4>
        </div>}
        {Object.entries(form.custom_headers || {}).map(([name, value]) => (
          <div className="model-header-row" key={name}>
            <input value={name} aria-label={tUi("请求头名称")} readOnly />
            <input value={value} aria-label={tUi("{value0} 请求头值", {value0: name})} onChange={(event) => onUpdateHeader(name, name, event.target.value)} />
            <button type="button" aria-label={tUi("删除 {value0}", {value0: name})} title={tUi("删除 {value0}", {value0: name})} onClick={() => onUpdateHeader(name, "", "")}><TrashIcon /></button>
          </div>
        ))}
        <div className="model-header-row draft">
          <input value={draftHeader.name} onChange={(event) => setDraftHeader((current) => ({ ...current, name: event.target.value }))} placeholder={tUi("Header 名称")} aria-label={tUi("新请求头名称")} />
          <input value={draftHeader.value} onChange={(event) => setDraftHeader((current) => ({ ...current, value: event.target.value }))} placeholder={tUi("值")} aria-label={tUi("新请求头值")} />
          <button type="button" aria-label={tUi("添加请求头")} title={tUi("添加请求头")} onClick={onAddHeader}><PlusIcon /></button>
        </div>
      </div>
      </div>
    </section>
  );
}
