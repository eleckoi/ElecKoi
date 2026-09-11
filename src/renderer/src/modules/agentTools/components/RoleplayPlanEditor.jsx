import { ArrowDown, ArrowUp, Plus, Trash } from '@phosphor-icons/react';
import { defaultRoleplayPlanSettings } from '@shared/contracts/presets/roleplayPlan';

export function RoleplayPlanEditor({ value, onChange, onSave, saving = false }) {
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
    if (steps.length >= 20) return;
    const next = [...steps];
    next.splice(terminalIndex, 0, '');
    onChange({ steps: next });
  }

  return (
    <section className="roleplay-plan-editor" aria-label="角色扮演固定任务">
      <div className="roleplay-plan-heading">
        <h3>固定任务</h3>
        <button type="button" onClick={add} disabled={steps.length >= 20}><Plus size={15} />添加任务</button>
      </div>
      <ol className="roleplay-plan-list">
        {steps.map((step, index) => {
          const terminal = index === terminalIndex;
          return <li key={index}>
            <span className="roleplay-plan-number" aria-hidden="true">{index + 1}</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={step}
              aria-label={`第 ${index + 1} 项任务`}
              onChange={(event) => replace(index, event.target.value)}
            />
            <div className="roleplay-plan-actions">
              {!terminal ? <>
                <button type="button" aria-label={`上移第 ${index + 1} 项`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></button>
                <button type="button" aria-label={`下移第 ${index + 1} 项`} disabled={index >= terminalIndex - 1} onClick={() => move(index, 1)}><ArrowDown /></button>
                <button type="button" aria-label={`删除第 ${index + 1} 项`} onClick={() => remove(index)}><Trash /></button>
              </> : null}
            </div>
          </li>;
        })}
      </ol>
      {onSave ? <div className="roleplay-plan-save-row">
        <button type="button" className="roleplay-plan-save" disabled={saving || steps.some((step) => !step.trim())} onClick={() => onSave({ steps })}>
          {saving ? '保存中' : '保存计划'}
        </button>
      </div> : null}
    </section>
  );
}
