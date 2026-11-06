import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { MinusIcon, PlusIcon, ResetIcon } from "../icons/openSourceIcons.jsx";

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(Number(value), minimum), maximum ?? Infinity);
}

export function TunerSliderRow({ label, value, min, max, step = 1, suffix = "", precision, defaultValue, onChange }) {
  const tUi = useProductTranslation();
  const safeValue = clamp(value, min, max);
  const progress = max > min ? ((safeValue - min) / (max - min)) * 100 : 0;
  const updateValue = (nextValue) => onChange(clamp(nextValue, min, max));
  const resetDisabled = defaultValue == null || Math.abs(safeValue - defaultValue) < step / 100;

  return (
    <div className="tuner-slider-row">
      <span className="tuner-slider-label">{label}</span>
      <div className="tuner-slider-controls">
        <button type="button" aria-label={tUi("{value0}减少", {value0: label})} onClick={() => updateValue(safeValue - step)}>
          <MinusIcon size={17} weight="bold" />
        </button>
        <label className="tuner-slider-value">
          <input
            type="number"
            aria-label={tUi("{value0}数值", {value0: label})}
            min={min}
            max={max}
            step={step}
            value={precision == null ? safeValue : safeValue.toFixed(precision)}
            onChange={(event) => {
              if (event.target.value !== "") updateValue(event.target.value);
            }}
          />
          {suffix ? <span>{suffix}</span> : null}
        </label>
        <button type="button" aria-label={tUi("{value0}增加", {value0: label})} onClick={() => updateValue(safeValue + step)}>
          <PlusIcon size={17} weight="bold" />
        </button>
        <button type="button" aria-label={tUi("恢复{value0}默认值", {value0: label})} disabled={resetDisabled} onClick={() => updateValue(defaultValue)}>
          <ResetIcon size={17} weight="bold" />
        </button>
      </div>
      {Number.isFinite(max) && <input
        className="tuner-slider"
        type="range"
        aria-label={tUi("{value0}滑杆", {value0: label})}
        min={min}
        max={max}
        step={step}
        value={safeValue}
        style={{ "--tuner-progress": `${progress}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />}
    </div>
  );
}
