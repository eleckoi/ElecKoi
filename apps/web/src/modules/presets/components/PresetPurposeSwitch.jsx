import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
export const PRESET_PURPOSES = [
  { id: 'roleplay', label: '角色扮演预设' },
  { id: 'creator', label: '创作预设' },
];

export function isDefaultPreset(id) {
  return id === 'agent-preset-standard' || id === 'agent-preset-creator';
}

export function PresetPurposeSwitch({ value, onChange, disabled = false }) {
  const tUi = useProductTranslation();
  return <div className="preset-purpose-switch" role="group" aria-label={tUi("预设分类")}>
    {localizeUiCopy(PRESET_PURPOSES, tUi).map(item => <button type="button" key={item.id} aria-pressed={value === item.id}
      disabled={disabled} onClick={() => onChange(item.id)}>{item.label}</button>)}
  </div>;
}
