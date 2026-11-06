import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { DEFAULT_NOVELAI_COMPILER_INSTRUCTION, NOVELAI_SAMPLERS } from '@shared/contracts/agent/novelAiImageSettings';
import './model-image-parameters.css';

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

function numberValue(raw) {
  return raw === "" ? "" : Number(raw);
}

export function ModelImageParametersSection({ form, validationMessage, onChange }) {
  const tUi = useProductTranslation();
  const settings = form.image_settings || {};
  const openAi = form.provider === "openai_image";
  const update = (key, value) => onChange({ ...settings, [key]: value });

  return (
    <>
    {!openAi && <section className="model-form-section">
      <h3>{tUi("剧情分镜数量")}</h3>
      <div className="model-parameter-grid">
        <label><span>{tUi("数量模式")}</span><select value={settings.automaticImageCount ? 'automatic' : 'fixed'} onChange={event => update('automaticImageCount', event.target.value === 'automatic')}><option value="fixed">{tUi("固定数量")}</option><option value="automatic">{tUi("自动数量")}</option></select></label>
        {settings.automaticImageCount ? <>
          <label><span>{tUi("最少分镜数")}</span><input type="number" min="1" value={settings.automaticImageMin ?? 1} onChange={event => update('automaticImageMin', numberValue(event.target.value))} /></label>
          <label><span>{tUi("最多分镜数")}</span><input type="number" min="1" value={settings.automaticImageMax ?? 6} onChange={event => update('automaticImageMax', numberValue(event.target.value))} /></label>
        </> : <label><span>{tUi("每轮分镜数")}</span><input type="number" min="1" value={settings.fixedImageCount ?? 1} onChange={event => update('fixedImageCount', numberValue(event.target.value))} /></label>}
      </div>
    </section>}
    <section className="model-form-section">
      <h3>{tUi("绘画参数")}</h3>
      <div className="model-parameter-grid">
        <label>
          <span>{tUi("宽度")}</span>
          <input type="number" min={openAi ? 16 : 1} max={openAi ? 3840 : undefined} step={openAi ? 16 : 1} value={settings.width ?? ""} onChange={(event) => update("width", numberValue(event.target.value))} />
        </label>
        <label>
          <span>{tUi("高度")}</span>
          <input type="number" min={openAi ? 16 : 1} max={openAi ? 3840 : undefined} step={openAi ? 16 : 1} value={settings.height ?? ""} onChange={(event) => update("height", numberValue(event.target.value))} />
        </label>
        {openAi ? (
          <>
            <label>
              <span>{tUi("质量")}</span>
              <select value={settings.quality || "auto"} onChange={(event) => update("quality", event.target.value)}>
                {localizeUiCopy(OPENAI_QUALITIES, tUi).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>{tUi("背景")}</span>
              <select value={settings.background || "auto"} onChange={(event) => update("background", event.target.value)}>
                {localizeUiCopy(OPENAI_BACKGROUNDS, tUi).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              <span>{tUi("步数")}</span>
              <input type="number" min="1" value={settings.steps ?? ""} onChange={(event) => update("steps", numberValue(event.target.value))} />
            </label>
            <label>
              <span>{tUi("提示词相关性")}</span>
              <input type="number" min="0" step="0.1" value={settings.scale ?? ""} onChange={(event) => update("scale", numberValue(event.target.value))} />
            </label>
            <label>
              <span>{tUi("采样器")}</span>
              <select value={settings.sampler || "k_euler_ancestral"} onChange={(event) => update("sampler", event.target.value)}>
                {NOVELAI_SAMPLERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </>
        )}
      </div>
      {validationMessage ? <p className="model-parameter-error">{validationMessage}</p> : null}
    </section>
    {!openAi && <section className="model-form-section">
      <h3>{tUi("提示词")}</h3>
      <div className="model-parameter-grid novelai-prompt-fields">
        <label><span>{tUi("提示词编译指令")}</span><textarea rows={5} value={settings.promptCompilerInstruction ?? ''} placeholder={DEFAULT_NOVELAI_COMPILER_INSTRUCTION} onChange={event => update('promptCompilerInstruction', event.target.value)} /></label>
        <label><span>{tUi("全局固定词")}</span><textarea rows={3} value={settings.promptPrefix ?? ''} onChange={event => update('promptPrefix', event.target.value)} /></label>
        <label><span>{tUi("负面追加词")}</span><textarea rows={3} value={settings.negativePrompt ?? ''} onChange={event => update('negativePrompt', event.target.value)} /></label>
      </div>
    </section>}
    </>
  );
}
