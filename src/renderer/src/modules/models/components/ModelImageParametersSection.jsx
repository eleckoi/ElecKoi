const OPENAI_QUALITIES = [
  { id: "auto", label: "自动" },
  { id: "low", label: "低" },
  { id: "medium", label: "中" },
  { id: "high", label: "高" },
];

const OPENAI_BACKGROUNDS = [
  { id: "auto", label: "自动" },
  { id: "opaque", label: "不透明" },
  { id: "transparent", label: "透明" },
];

const NOVELAI_SAMPLERS = [
  { id: "k_dpmpp_2m", label: "DPM++ 2M" },
  { id: "k_euler_ancestral", label: "Euler Ancestral" },
  { id: "k_euler", label: "Euler" },
  { id: "k_dpm_2", label: "DPM2" },
  { id: "k_dpmpp_2s_ancestral", label: "DPM++ 2S Ancestral" },
  { id: "k_dpmpp_sde", label: "DPM++ SDE" },
  { id: "k_dpm_fast", label: "DPM Fast" },
  { id: "ddim_v3", label: "DDIM" },
];

function numberValue(raw) {
  return raw === "" ? "" : Number(raw);
}

export function ModelImageParametersSection({ form, validationMessage, onChange }) {
  const settings = form.image_settings || {};
  const openAi = form.provider === "openai_image";
  const update = (key, value) => onChange({ ...settings, [key]: value });

  return (
    <section className="model-form-section">
      <h3>绘画参数</h3>
      <div className="model-parameter-grid">
        <label>
          <span>宽度</span>
          <input type="number" min={openAi ? 16 : 512} max={openAi ? 3840 : 2048} step={openAi ? 16 : 1} value={settings.width ?? ""} onChange={(event) => update("width", numberValue(event.target.value))} />
        </label>
        <label>
          <span>高度</span>
          <input type="number" min={openAi ? 16 : 512} max={openAi ? 3840 : 2048} step={openAi ? 16 : 1} value={settings.height ?? ""} onChange={(event) => update("height", numberValue(event.target.value))} />
        </label>
        {openAi ? (
          <>
            <label>
              <span>质量</span>
              <select value={settings.quality || "auto"} onChange={(event) => update("quality", event.target.value)}>
                {OPENAI_QUALITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>背景</span>
              <select value={settings.background || "auto"} onChange={(event) => update("background", event.target.value)}>
                {OPENAI_BACKGROUNDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              <span>步数</span>
              <input type="number" min="1" max="50" value={settings.steps ?? ""} onChange={(event) => update("steps", numberValue(event.target.value))} />
            </label>
            <label>
              <span>提示词相关性</span>
              <input type="number" min="0.1" max="10" step="0.1" value={settings.scale ?? ""} onChange={(event) => update("scale", numberValue(event.target.value))} />
            </label>
            <label>
              <span>采样器</span>
              <select value={settings.sampler || "k_euler_ancestral"} onChange={(event) => update("sampler", event.target.value)}>
                {NOVELAI_SAMPLERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </>
        )}
      </div>
      {validationMessage ? <p className="model-parameter-error">{validationMessage}</p> : null}
    </section>
  );
}
