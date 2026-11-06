import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ArrowDown, ArrowUp, Plus, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { defaultRoleplayPlanSettings } from '@shared/contracts/presets/roleplayPlan';

export function RoleplayPlanEditor({ value, onChange, onSave, saving = false }) {
  const tUi = useProductTranslation();
  const steps = value?.steps?.length ? value.steps : defaultRoleplayPlanSettings().steps;
  const terminalIndex = steps.length - 1;

  function replace(index, step) {
    onChange({ steps: steps.map((item, itemIndex) => itemIndex === index ? step : item) });
  }

  function move(index, offset) {
    const target = index + offset;
    if (index >= terminalIndex || target < 0 || target >= terminalIndex) return;
    const next = [...steps];
    next.splice(target, 0, next.splice(index, 1)[0]);
    onChange({ steps: next });
  }

  function remove(index) {
    if (index >= terminalIndex || steps.length <= 1) return;
    onChange({ steps: steps.filter((_step, itemIndex) => itemIndex !== index) });
  }

  function add() {
    const next = [...steps];
    next.splice(terminalIndex, 0, '');
    onChange({ steps: next });
  }

  return (
    <section className="roleplay-plan-editor" aria-label={tUi("角色扮演固定任务")}>
      <div className="roleplay-plan-heading">
        <h3>{tUi("固定任务")}</h3>
        <button type="button" onClick={add}><Plus size={15} />{tUi("添加任务")}</button>
      </div>
      <ol className="roleplay-plan-list">
        {steps.map((step, index) => {
          const terminal = index === terminalIndex;
          return <li key={index}>
            <span className="roleplay-plan-number" aria-hidden="true">{index + 1}</span>
            <textarea
              rows={2}
              value={step}
              aria-label={tUi("第 {value0} 项任务", {value0: index + 1})}
              onChange={(event) => replace(index, event.target.value)}
            />
            <div className="roleplay-plan-actions">
              {!terminal ? <>
                <button type="button" aria-label={tUi("上移第 {value0} 项", {value0: index + 1})} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></button>
                <button type="button" aria-label={tUi("下移第 {value0} 项", {value0: index + 1})} disabled={index >= terminalIndex - 1} onClick={() => move(index, 1)}><ArrowDown /></button>
                <button type="button" aria-label={tUi("删除第 {value0} 项", {value0: index + 1})} onClick={() => remove(index)}><Trash /></button>
              </> : null}
            </div>
          </li>;
        })}
      </ol>
      {onSave ? <div className="roleplay-plan-save-row">
        <button type="button" className="roleplay-plan-save" disabled={saving || steps.some((step) => !step.trim())} onClick={() => onSave({ steps })}>
          {saving ? tUi("保存中") : tUi("保存计划")}
        </button>
      </div> : null}
    </section>
  );
}
