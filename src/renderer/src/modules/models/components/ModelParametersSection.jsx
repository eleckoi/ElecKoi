const REASONING_EFFORTS = [
  { id: "", label: "跟随模型默认" },
  { id: "off", label: "关闭" },
  { id: "minimal", label: "极低" },
  { id: "low", label: "低" },
  { id: "medium", label: "中" },
  { id: "high", label: "高" },
  { id: "xhigh", label: "极高" },
  { id: "max", label: "最高" },
];

function optionalNumber(value) {
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function ModelParametersSection({ form, activeModelOption, automaticContextWindow, effectiveContextWindow, parameterError, onChange }) {
  return (
    <section className="model-form-section">
      <div className="model-section-heading">
        <h3>模型参数</h3>
        <span>{form.model ? `仅作用于 ${form.model}` : "先选择模型后设置"}</span>
      </div>
      <div className="model-parameter-grid">
        <label>
          <span>上下文窗口 <small>自动 {automaticContextWindow.toLocaleString()}</small></span>
          <input type="number" min="4096" max="4000000" disabled={!form.model} value={activeModelOption?.contextWindowTokens ?? ""} onChange={(event) => onChange({ contextWindowTokens: optionalNumber(event.target.value) })} placeholder={String(automaticContextWindow)} />
        </label>
        <label>
          <span>自动压缩阈值 <small>默认占上下文 80%</small></span>
          <input type="number" min="1024" max={effectiveContextWindow} disabled={!form.model} value={activeModelOption?.autoCompactTokenLimit ?? ""} onChange={(event) => onChange({ autoCompactTokenLimit: optionalNumber(event.target.value) })} placeholder={String(Math.floor(effectiveContextWindow * 0.8))} />
        </label>
        <label>
          <span>单次最大输出 <small>留空由上游决定</small></span>
          <input type="number" min="1" max={effectiveContextWindow} disabled={!form.model} value={activeModelOption?.maxOutputTokens ?? ""} onChange={(event) => onChange({ maxOutputTokens: optionalNumber(event.target.value) })} placeholder="自动" />
        </label>
        <label>
          <span>推理强度 <small>DSH / pi-ai</small></span>
          <select disabled={!form.model} value={activeModelOption?.reasoningEffort || ""} onChange={(event) => onChange({ reasoningEffort: event.target.value || null })}>
            {REASONING_EFFORTS.map((effort) => <option key={effort.id} value={effort.id}>{effort.label}</option>)}
          </select>
        </label>
        <label>
          <span>温度 <small>0–2</small></span>
          <div className="model-parameter-with-toggle">
            <input type="number" min="0" max="2" step="0.01" disabled={!form.model || activeModelOption?.temperature === null} value={activeModelOption?.temperature ?? ""} onChange={(event) => onChange({ temperature: optionalNumber(event.target.value) })} placeholder="1" />
            <input type="checkbox" aria-label="发送温度参数" disabled={!form.model} checked={Boolean(form.model && activeModelOption?.temperature !== null)} onChange={(event) => onChange({ temperature: event.target.checked ? 1 : null })} />
          </div>
        </label>
        <label>
          <span>Top P <small>0–1</small></span>
          <div className="model-parameter-with-toggle">
            <input type="number" min="0" max="1" step="0.01" disabled={!form.model || activeModelOption?.topP === null} value={activeModelOption?.topP ?? ""} onChange={(event) => onChange({ topP: optionalNumber(event.target.value) })} placeholder="1" />
            <input type="checkbox" aria-label="发送 Top P 参数" disabled={!form.model} checked={Boolean(form.model && activeModelOption?.topP !== null)} onChange={(event) => onChange({ topP: event.target.checked ? 1 : null })} />
          </div>
        </label>
        <label className="model-capability-toggle">
          <span>图片输入 <small>声明当前模型接受图片</small></span>
          <input type="checkbox" disabled={!form.model} checked={activeModelOption?.supportsImageInput === true} onChange={(event) => onChange({ supportsImageInput: event.target.checked })} />
        </label>
      </div>
      {parameterError ? <p className="model-parameter-error">上下文需为 4,096–4,000,000；压缩和输出不能超过上下文；温度为 0–2，Top P 为 0–1。</p> : null}
    </section>
  );
}
