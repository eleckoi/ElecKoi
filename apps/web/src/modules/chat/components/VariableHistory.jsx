import { useMemo, useState } from 'react';
import { CaretRight } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { productLocaleTag } from '../../../app/i18n/productCopy.js';
import { variableDifferences, variablePointer } from '../model/variableBrowser.js';
import { VariableBrowser, VariableRows, VariableValue } from './VariableBrowser.jsx';

export function variableTime(value, t, full = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(productLocaleTag(t), { ...(full ? { month: '2-digit', day: '2-digit' } : {}), hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function VariableFloors({ timeline, selectedId, onSelect, hidden }) {
  const t = useProductTranslation();
  return <aside hidden={hidden} className="vm-history-list" aria-label={t('历史快照')}>
    {timeline?.floors.length ? [...timeline.floors].reverse().map(floor => <button type="button" key={floor.id} className={`vm-floor ${selectedId === floor.id ? 'selected' : ''}`} onClick={() => onSelect(floor.id)}>
      <span><strong>{floor.label}</strong><small>{floor.state.errorMessage ? t(floor.state.errorMessage) : t('{value0} 处变化', { value0: floor.changedValueCount })}</small></span>
      <time>{variableTime(floor.createdAt, t)}</time><CaretRight size={15} />
    </button>) : <p className="vm-empty">{t('还没有可查看的助手楼层')}</p>}
  </aside>;
}

export function VariableSnapshot({ timeline, floor, mobile, path, onNavigate, onChangesMode }) {
  const t = useProductTranslation(), [changesOnly, setChangesOnly] = useState(floor?.id !== 'opening');
  const index = timeline.floors.findIndex(item => item.id === floor?.id);
  const previous = index > 0 ? timeline.floors[index - 1].state : timeline.initial;
  const available = previous?.root !== null && previous?.root !== undefined && !previous?.errorMessage;
  const changes = useMemo(() => floor?.state.root && available ? variableDifferences(previous.root, floor.state.root) : [], [floor?.state, previous, available]);
  if (!floor) return <div className="vm-empty">{t('从时间线选择一个助手楼层')}</div>;
  function toggle() { setChangesOnly(current => !current); onNavigate([]); onChangesMode?.(!changesOnly); }
  return <section className="vm-snapshot">
    <header className="vm-snapshot-heading"><div><h3>{floor.label}</h3><p>{floor.messagePreview}</p></div><time>{variableTime(floor.createdAt, t, true)}</time></header>
    {!floor.state.errorMessage && floor.id !== 'opening' && <div className="vm-history-filter"><span>{t('{value0} 处变化', { value0: available ? changes.length : floor.changedValueCount })}</span><label><input type="checkbox" checked={changesOnly} onChange={toggle} />{t('仅看变化')}</label></div>}
    {floor.state.errorMessage ? <div className="vm-raw"><strong>{t(floor.state.errorMessage)}</strong>{floor.state.rawJson && <pre>{floor.state.rawJson}</pre>}</div>
      : !changesOnly ? <VariableBrowser document={floor.state} path={path} onNavigate={onNavigate} mobile={mobile} directory={false} valueLabel={t('快照值')} />
      : !available ? <p className="vm-empty">{t('无历史状态')}</p>
      : changes.length ? <div className="vm-change-table">{!mobile && <div className="vm-change-head"><span>{t('变量')}</span><span>{t('变化前')}</span><span>{t('变化后')}</span></div>}
        <VariableRows items={changes} mobile={mobile}>{item => <div className="vm-change-row" key={variablePointer(item.path)}>
          <span className="vm-change-name">{item.path.at(-1)}<small>{item.path.slice(0, -1).join(' / ')}</small></span>
          <div className="vm-change-before">{mobile && <small>{t('变化前')}</small>}<VariableValue value={item.before} present={item.beforePresent} full /></div>
          <div className="vm-change-after">{mobile && <small>{t('变化后')}</small>}<VariableValue value={item.after} present={item.afterPresent} full /></div>
        </div>}</VariableRows></div> : <p className="vm-empty">{t('本轮变量未变化')}</p>}
  </section>;
}
