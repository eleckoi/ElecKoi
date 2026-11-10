import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CaretDown, CaretRight, ArrowLeft, Database, FolderSimple } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { variableAt, variableContainer, variablePointer, variableSearch } from '../model/variableBrowser.js';

export function VariableValue({ value, present = true, full = false }) {
  const t = useProductTranslation();
  if (!present) return <span className="vm-literal">{t('不存在')}</span>;
  if (variableContainer(value)) {
    const label = t(Array.isArray(value) ? '数组 · {value0} 项' : '对象 · {value0} 项', { value0: Object.keys(value).length });
    return full ? <details className="vm-json-value"><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details> : label;
  }
  return value === null || typeof value === 'boolean' || value === ''
    ? <span className="vm-literal">{JSON.stringify(value)}</span> : String(value);
}

export function VariableRows({ items, mobile, children, className = '', positions, scrollKey = '' }) {
  const scroll = useRef(null);
  const virtual = useVirtualizer({ count: items.length, getScrollElement: () => scroll.current,
    useFlushSync: false,
    initialRect: { width: mobile ? 390 : 700, height: 500 },
    initialOffset: () => positions?.get(scrollKey) || 0,
    estimateSize: () => mobile ? 80 : 49, overscan: 6, useAnimationFrameWithResizeObserver: true,
    getItemKey: index => variablePointer(items[index].path) });
  useLayoutEffect(() => {
    const element = scroll.current;
    element.scrollTop = positions?.get(scrollKey) || 0;
    return () => { positions?.set(scrollKey, element.scrollTop); };
  }, [scrollKey, positions]);
  return <div ref={scroll} className={`vm-scroll ${className}`}>
    <div style={{ height: virtual.getTotalSize(), position: 'relative', width: '100%' }}>
      {virtual.getVirtualItems().map(row => <div key={row.key} data-index={row.index} ref={virtual.measureElement}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}>{children(items[row.index])}</div>)}
    </div>
  </div>;
}

function Directory({ root, path, onSelect }) {
  const t = useProductTranslation(), [expanded, setExpanded] = useState(() => new Set([''])), scroll = useRef(null);
  const active = variablePointer(path);
  useEffect(() => setExpanded(previous => new Set([...previous, ...path.map((_, i) => variablePointer(path.slice(0, i + 1)))])), [active]);
  useLayoutEffect(() => { scroll.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [active, expanded]);
  const rows = [];
  const pending = [{ path: [], value: root, label: t('全部变量') }];
  while (pending.length) {
    const item = pending.pop(), id = variablePointer(item.path);
    const children = Object.entries(item.value).filter(([, value]) => variableContainer(value));
    rows.push({ ...item, id, children });
    if (expanded.has(id)) for (let i = children.length - 1; i >= 0; i--) {
      const [key, value] = children[i];
      pending.push({ path: [...item.path, key], value, label: Array.isArray(item.value) ? `[${key}]` : key });
    }
  }
  return <aside ref={scroll} className="vm-directory" aria-label={t('变量目录')}>
    {rows.map(item => <div className={`vm-directory-row ${active === item.id ? 'selected' : ''}`} key={item.id} style={{ '--depth': item.path.length }}>
      {item.children.length ? <button type="button" className="vm-directory-expand" aria-expanded={expanded.has(item.id)} aria-label={t(expanded.has(item.id) ? '收起{value0}' : '展开{value0}', { value0: item.label })}
        onClick={() => setExpanded(previous => { const next = new Set(previous); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })}>{expanded.has(item.id) ? <CaretDown size={12} /> : <CaretRight size={12} />}</button> : <span className="vm-directory-spacer" />}
      <button type="button" className="vm-directory-select" data-directory-path={item.id} aria-current={active === item.id} title={item.path.join(' / ') || t('全部变量')} onClick={() => onSelect(item.path)}>
        {item.path.length ? <FolderSimple size={16} /> : <Database size={16} />}<span>{item.label}</span>
      </button>
    </div>)}
  </aside>;
}

export function VariableBrowser({ document, path, onNavigate, mobile, query = '', onClearSearch, valueLabel, directory = true }) {
  const t = useProductTranslation();
  const root = document?.root, breadcrumb = useRef(null), positions = useRef(new Map());
  const found = root ? variableAt(root, path) : { present: false };
  const current = found.present && variableContainer(found.value) ? found.value : root;
  const visiblePath = found.present && variableContainer(found.value) ? path : [];
  const pathKey = variablePointer(visiblePath);
  const rows = useMemo(() => !current ? [] : query ? variableSearch(root, query)
    : Object.entries(current).map(([name, value]) => ({ path: [...visiblePath, name], value })), [current, root, query, pathKey]);
  const navigate = next => { onNavigate(next); onClearSearch?.(); };
  useLayoutEffect(() => { if (mobile && breadcrumb.current) breadcrumb.current.scrollLeft = breadcrumb.current.scrollWidth; }, [pathKey, mobile]);
  if (document?.errorMessage) return <div className="vm-raw"><strong>{t(document.errorMessage)}</strong>{document.rawJson && <pre>{document.rawJson}</pre>}</div>;
  if (!root) return null;
  return <div className={`vm-browser ${mobile ? 'is-mobile' : ''} ${!directory ? 'no-directory' : ''}`}>
    {!mobile && directory && <Directory root={root} path={visiblePath} onSelect={navigate} />}
    <div className="vm-values">
      <nav ref={breadcrumb} className="vm-breadcrumb" aria-label={t('变量路径')}>
        {!mobile && <button className="vm-path-back" type="button" disabled={!visiblePath.length && !query} aria-label={t('返回上一级')} onClick={() => navigate(query ? visiblePath : visiblePath.slice(0, -1))}><ArrowLeft size={15} /></button>}
        <button type="button" data-breadcrumb-path="" onClick={() => navigate([])}>{t('全部变量')}</button>
        {query ? <><CaretRight size={11} /><span>{t('搜索结果')}</span></> : visiblePath.map((key, index) => <span className="vm-crumb" key={index}><CaretRight size={11} /><button type="button" data-breadcrumb-path={variablePointer(visiblePath.slice(0, index + 1))} aria-current={index === visiblePath.length - 1 ? 'location' : undefined}
          onClick={() => navigate(visiblePath.slice(0, index + 1))}>{Array.isArray(variableAt(root, visiblePath.slice(0, index)).value) ? `[${key}]` : key}</button></span>)}
      </nav>
      {!mobile && <div className="vm-table-head"><span>{t(query ? '变量路径' : '变量')}</span><span>{valueLabel || t('当前值')}</span></div>}
      {rows.length ? <VariableRows key={`${pathKey}:${query}`} scrollKey={`${pathKey}:${query}`} positions={positions.current} items={rows} mobile={mobile}>{item => {
        const container = variableContainer(item.value), name = !query && Array.isArray(current) ? `[${item.path.at(-1)}]` : item.path.at(-1);
        const contents = <><span className="vm-field-name">{!mobile && (container ? <FolderSimple size={16} /> : <span className="vm-field-spacer" />)}<span>{name}{query && <small>{item.path.slice(0, -1).join(' / ')}</small>}</span></span>
          <span className={`vm-field-value ${container ? 'is-container' : ''}`}><VariableValue value={item.value} />{container && <CaretRight size={14} />}</span></>;
        return container || query ? <button type="button" className={`vm-value-row ${container ? 'is-container' : 'is-result'}`} data-node-path={variablePointer(item.path)} title={item.path.join(' / ')} onClick={() => navigate(container ? item.path : item.path.slice(0, -1))}>{contents}</button>
          : <div className="vm-value-row" data-node-path={variablePointer(item.path)}>{contents}</div>;
      }}</VariableRows> : <p className="vm-empty">{t(query ? '没有匹配的变量' : '暂无变量')}</p>}
    </div>
  </div>;
}
