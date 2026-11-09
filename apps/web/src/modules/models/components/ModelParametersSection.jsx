import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Children, Fragment } from 'react';
import { IconCheckOutlineMedium } from '@deepseek-ai/dsh-client-ui-primitives';
import { reasoningEffortIds, reasoningEffortLabel, reasoningOptions } from "../model/modelReasoningOptions.js";

function optionalNumber(value) {
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function compactTokens(value) {
  return value >= 1000 ? `${Number((value / 1000).toFixed(3))}K` : String(value);
}

function ParameterGrid({ picker, menu, children }) {
  const order = menu ? ['temperature', 'top-p', 'context', 'compaction', 'output'] : ['reasoning', 'temperature', 'context', 'compaction', 'output', 'top-p'];
  const fields = Children.toArray(children);
  if (picker) fields.sort((a, b) => order.indexOf(a.props['data-parameter']) - order.indexOf(b.props['data-parameter']));
  return <div className="model-parameter-grid">{fields}</div>;
}

function ParameterInput({ menu, tokens, ...props }) {
  const input = <input {...props} />;
  return menu ? <span className="model-menu-input">{input}{tokens && <small>Token</small>}</span> : input;
}

function CapabilityCheckbox({ picker, label, className = '', ...props }) {
  return <label className={`${className}${picker ? ' chat-model-capability-choice' : ''}`}>
    <input type="checkbox" {...props} />
    {picker ? <span className="chat-model-capability-box" aria-hidden="true"><IconCheckOutlineMedium size={12} /></span> : null}
    <span>{label}</span>
  </label>;
}

export function ModelParametersSection({ form, activeModelOption, automaticContextWindow, effectiveContextWindow, parameterError, modelCapabilities, showReasoningProfileEditor = false, compact = false, picker = false, menu = false, onChange }) {
  const tUi = useProductTranslation();
  const options = reasoningOptions(modelCapabilities.reasoningEfforts, undefined, tUi);
  const selectedEffort = options.some((item) => item.id === activeModelOption?.reasoningEffort)
    ? activeModelOption.reasoningEffort
    : "";
  const reasoningAvailable = modelCapabilities.reasoningEfforts.length > 0;
  const inheritsCapabilities = form.builtin && form.useBuiltinModels !== false && activeModelOption?.capabilitiesOverride !== true;
  const inputModalities = activeModelOption?.inputModalities || (activeModelOption?.supportsImageInput ? ['text', 'image'] : ['text']);
  const Capabilities = picker ? 'details' : Fragment;

  function toggleModality(modality, checked) {
    const next = checked ? [...inputModalities.filter(item => item !== modality), modality] : inputModalities.filter(item => item !== modality);
    onChange({ inputModalities: next, supportsImageInput: next.includes('image') });
  }

  function updateReasoningEffort(value) {
    onChange({
      reasoningEffort: value || null,
    });
  }

  function toggleReasoningEffort(effort) {
    const current = activeModelOption?.reasoningEfforts && typeof activeModelOption.reasoningEfforts === "object"
      ? activeModelOption.reasoningEfforts
      : {};
    const next = { ...current };
    if (Object.hasOwn(next, effort)) delete next[effort];
    else next[effort] = effort === "off" ? null : effort;
    const selectedRemoved = activeModelOption?.reasoningEffort === effort && !Object.hasOwn(next, effort);
    onChange({
      reasoningEfforts: Object.keys(next).length ? next : undefined,
      ...(selectedRemoved ? { reasoningEffort: null } : {}),
    });
  }
  return (
    <section className={`model-form-section${compact ? " mobile-model-section mobile-model-parameters" : ""}`}>
      {!picker && <div className="model-section-heading">
        <h3>{compact ? tUi("参数") : tUi("模型参数")}</h3>
        {!compact && <span>{form.model ? tUi("仅作用于 {value0}", {value0: form.model}) : tUi("先选择模型后设置")}</span>}
      </div>}
      <ParameterGrid picker={picker} menu={menu}>
        <label data-parameter="context">
          <span>{tUi("上下文窗口 ")}<small>{compact ? `= ${compactTokens(effectiveContextWindow)}` : tUi("自动 {value0}", {value0: automaticContextWindow.toLocaleString()})}</small></span>
          <ParameterInput menu={menu} tokens type="number" min="1" disabled={!form.model} value={menu && form.builtin && form.useBuiltinModels !== false && !activeModelOption?.overrideFields?.includes('contextWindow') ? '' : activeModelOption?.contextWindowTokens ?? ""} onChange={(event) => onChange({ contextWindowTokens: optionalNumber(event.target.value) })} placeholder={menu ? tUi("自动") : String(automaticContextWindow)} />
        </label>
        <label data-parameter="compaction">
          <span>{tUi("自动压缩阈值 ")}<small>{compact ? `= ${compactTokens(activeModelOption?.autoCompactTokenLimit ?? Math.floor(effectiveContextWindow * 0.8))} · ${activeModelOption?.autoCompactTokenLimit == null ? tUi("占上下文 80%") : tUi("自定义")}` : tUi("默认占上下文 80%")}</small></span>
          <ParameterInput menu={menu} tokens type="number" min="1" max={effectiveContextWindow} disabled={!form.model} value={activeModelOption?.autoCompactTokenLimit ?? ""} onChange={(event) => onChange({ autoCompactTokenLimit: optionalNumber(event.target.value) })} placeholder={`${compact ? tUi("自动 ") : ''}${Math.floor(effectiveContextWindow * 0.8)}`} />
        </label>
        <label data-parameter="output">
          <span>{tUi("单次最大输出 ")}<small>{compact && activeModelOption?.maxOutputTokens != null ? `= ${compactTokens(activeModelOption.maxOutputTokens)}` : tUi("留空由上游决定")}</small></span>
          <ParameterInput menu={menu} tokens type="number" min="1" disabled={!form.model} value={menu && form.builtin && form.useBuiltinModels !== false && !activeModelOption?.overrideFields?.includes('maxTokens') ? '' : activeModelOption?.maxOutputTokens ?? ""} onChange={(event) => onChange({ maxOutputTokens: optionalNumber(event.target.value) })} placeholder={tUi("自动")} />
        </label>
        {!menu && <label data-parameter="reasoning">
          <span>{tUi("推理强度 ")}<small>{tUi("当前请求")}</small></span>
          <select disabled={!form.model || !reasoningAvailable} value={selectedEffort} onChange={(event) => updateReasoningEffort(event.target.value)}>
            {options.map((effort) => <option key={effort.id} value={effort.id}>{compact && !effort.id ? tUi("上游默认") : effort.label}</option>)}
          </select>
        </label>}
        <label data-parameter="temperature">
          <span>{tUi("温度 ")}<small>{tUi("留空不发送")}</small></span>
          <ParameterInput menu={menu} type="number" min="0" step="0.01" disabled={!form.model} value={activeModelOption?.temperature ?? ""} onChange={(event) => onChange({ temperature: optionalNumber(event.target.value) })} placeholder={compact ? tUi("留空") : tUi("上游默认")} />
        </label>
        <label data-parameter="top-p">
          <span>Top P <small>{compact ? tUi("留空不发送") : '0–1'}</small></span>
          <ParameterInput menu={menu} type="number" min="0" max="1" step="0.01" disabled={!form.model} value={activeModelOption?.topP ?? ""} onChange={(event) => onChange({ topP: optionalNumber(event.target.value) })} placeholder={compact ? tUi("留空") : tUi("上游默认")} />
        </label>
      </ParameterGrid>
      <Capabilities {...(picker ? { className: 'chat-model-capabilities' } : {})}>
      {picker ? <summary>{tUi("模型能力")}</summary> : null}
      <div className="model-capabilities">
        {(!picker || (form.builtin && form.useBuiltinModels !== false)) && <div className="model-capabilities-heading">
          {!picker && <span>{tUi("模型能力")}</span>}
          {form.builtin && form.useBuiltinModels !== false && <CapabilityCheckbox picker={picker} className="model-capability-toggle" label={tUi("使用目录默认")}
            disabled={!form.model} checked={inheritsCapabilities} onChange={event => onChange({ capabilitiesOverride: !event.target.checked })} />}
        </div>}
        <fieldset className="model-input-capabilities" aria-label={tUi("输入能力")} disabled={!form.model || inheritsCapabilities}>
          <div>
            <CapabilityCheckbox picker={picker} label={tUi("文本")} checked={inputModalities.includes('text')} onChange={event => toggleModality('text', event.target.checked)} />
            <CapabilityCheckbox picker={picker} label={tUi("图片")} checked={inputModalities.includes('image')} onChange={event => toggleModality('image', event.target.checked)} />
          </div>
        </fieldset>
        {showReasoningProfileEditor && modelCapabilities.canDeclareReasoning ? (
          <fieldset className="model-reasoning-profile" disabled={!form.model || inheritsCapabilities}>
            <legend>
              <span>{tUi("支持推理档位")}</span>
            </legend>
            <div className="model-reasoning-efforts">
              {reasoningEffortIds.map((effort) => {
                const selected = modelCapabilities.reasoningEfforts.includes(effort);
                return (
                  <button
                    key={effort}
                    className={selected ? "selected" : ""}
                    type="button"
                    aria-pressed={selected}
                    aria-label={tUi("{value0}{value1}档位", {value0: selected ? tUi("取消") : tUi("声明支持"), value1: reasoningEffortLabel(effort, tUi)})}
                    onClick={() => toggleReasoningEffort(effort)}
                  >
                    {reasoningEffortLabel(effort, tUi)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
      </div>
      </Capabilities>
      {parameterError ? <p className="model-parameter-error">{tUi("上下文、压缩阈值和输出需为正整数；压缩不能超过上下文；温度需为非负数，Top P 为 0–1；已声明推理能力时至少选择一个非关闭档位。")}</p> : null}
      {activeModelOption?.inputModalities?.length === 0 && <p className="model-parameter-error">{tUi("至少选择一种输入能力。")}</p>}
    </section>
  );
}
