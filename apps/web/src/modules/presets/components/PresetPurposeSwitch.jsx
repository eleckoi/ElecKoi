import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
export const PRESET_PURPOSES = [
  { id: 'roleplay', label: '角色扮演预设' },
  { id: 'creator', label: '创作预设' },
];

export function isDefaultPreset(id) {
  return id === 'agent-preset-standard' || id === 'agent-preset-creator';
}

export function PresetPurposeSwitch({ value, onChange, disabled = false, compact = false }) {
  const tUi = useProductTranslation();
  return <div className={`preset-purpose-switch${compact ? ' is-compact' : ''}`} role={compact ? 'tablist' : 'group'} aria-label={tUi("预设分类")}>
    {localizeUiCopy(PRESET_PURPOSES, tUi).map(item => <button type="button" key={item.id} role={compact ? 'tab' : undefined} tabIndex={compact ? value === item.id ? 0 : -1 : undefined} aria-selected={compact ? value === item.id : undefined} aria-pressed={compact ? undefined : value === item.id}
      onKeyDown={compact ? event => {
        const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        if (!step && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const buttons = [...event.currentTarget.parentElement.querySelectorAll('button')];
        const next = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : buttons[(buttons.indexOf(event.currentTarget) + step + buttons.length) % buttons.length];
        if (!next.disabled) { next.focus(); next.click(); }
      } : undefined}
      disabled={disabled} onClick={() => onChange(item.id)}>{compact ? tUi(item.id === 'roleplay' ? '扮演' : '创作') : item.label}</button>)}
  </div>;
}
