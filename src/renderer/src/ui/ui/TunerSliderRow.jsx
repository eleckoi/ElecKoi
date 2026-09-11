import { MinusIcon, PlusIcon, ResetIcon } from "../icons/openSourceIcons.jsx";

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(Number(value), minimum), maximum);
}

export function TunerSliderRow({ label, value, min, max, step = 1, suffix = "", defaultValue, onChange }) {
  const safeValue = clamp(value, min, max);
  const progress = max > min ? ((safeValue - min) / (max - min)) * 100 : 0;
  const updateValue = (nextValue) => onChange(clamp(nextValue, min, max));
  const resetDisabled = defaultValue == null || Math.abs(safeValue - defaultValue) < step / 100;

  return (
    <div className="tuner-slider-row">
      <span className="tuner-slider-label">{label}</span>
      <div className="tuner-slider-controls">
        <button type="button" aria-label={`${label}减少`} onClick={() => updateValue(safeValue - step)}>
          <MinusIcon size={17} weight="bold" />
        </button>
        <label className="tuner-slider-value">
          <input
            type="number"
            aria-label={`${label}数值`}
            min={min}
            max={max}
            step={step}
            value={safeValue}
            onChange={(event) => {
              if (event.target.value !== "") updateValue(event.target.value);
            }}
          />
          {suffix ? <span>{suffix}</span> : null}
        </label>
        <button type="button" aria-label={`${label}增加`} onClick={() => updateValue(safeValue + step)}>
          <PlusIcon size={17} weight="bold" />
        </button>
        <button type="button" aria-label={`恢复${label}默认值`} disabled={resetDisabled} onClick={() => updateValue(defaultValue)}>
          <ResetIcon size={17} weight="bold" />
        </button>
      </div>
      <input
        className="tuner-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        style={{ "--tuner-progress": `${progress}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
