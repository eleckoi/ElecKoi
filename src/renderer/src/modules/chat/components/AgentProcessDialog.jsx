import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DshCloseIcon } from '../../../ui/icons/dshComposerIcons.jsx';
import { MessageChevronLeftIcon, MessageChevronRightIcon } from '../../../ui/icons/elecKoiMessageIcons.jsx';
import { processBlocks, processItemDetails } from '../model/agentProcessDetails.js';
import { delegatedProcessItems } from '../model/agentProcessHierarchy.js';
import { AgentProcessIcon } from './AgentProcessIcon.jsx';

export function AgentProcessDialog({ message, reasoningDisplayMode = 'collapsed', onClose }) {
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedItemPath, setSelectedItemPath] = useState([]);
  const scrollPositionsRef = useRef(new Map());
  const items = message?.process || [];
  const blocks = useMemo(() => processBlocks(items), [items]);
  const selectedGroup = useMemo(
    () => blocks.find((block) => block.type === 'operations' && block.id === selectedGroupId),
    [blocks, selectedGroupId],
  );
  const selectedItemId = selectedItemPath.at(-1) || '';
  const selectedItem = useMemo(() => items.find((item) => item.id === selectedItemId), [items, selectedItemId]);
  const selectedDelegatedItems = useMemo(
    () => delegatedProcessItems(items, selectedItemId),
    [items, selectedItemId],
  );
  const duration = durationText(items);
  const hasFinal = message?.status === 'complete' && Boolean(message?.content?.trim());

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (selectedItemId) setSelectedItemPath((current) => current.slice(0, -1));
      else if (selectedGroupId) setSelectedGroupId('');
      else onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, selectedGroupId, selectedItemId]);

  const goBack = () => {
    if (selectedItemId) setSelectedItemPath((current) => current.slice(0, -1));
    else setSelectedGroupId('');
  };

  return createPortal(<div className="agent-process-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="agent-process-dialog" role="dialog" aria-modal="true" aria-label={selectedGroup ? '详情' : '处理过程'} onMouseDown={(event) => event.stopPropagation()}>
      <header>
        {selectedGroup ? <button type="button" className="agent-process-back" onClick={goBack} aria-label="返回"><MessageChevronLeftIcon /></button> : <span />}
        <h2>{selectedGroup ? '详情' : `处理过程${duration ? ` · ${duration}` : ''}`}</h2>
        <button type="button" className="agent-process-close" onClick={onClose} aria-label="关闭"><DshCloseIcon /></button>
      </header>
      {selectedItem
        ? <ProcessDetail
          item={selectedItem}
          details={processItemDetails(selectedItem)}
          delegatedItems={selectedDelegatedItems}
          reasoningDisplayMode={reasoningDisplayMode}
          scrollKey={`item:${selectedItemPath.join('/')}`}
          scrollPositions={scrollPositionsRef.current}
          onSelectItem={(id) => setSelectedItemPath((current) => [...current, id])}
        />
        : selectedGroup
          ? <ProcessGroupDetail
            group={selectedGroup}
            reasoningDisplayMode={reasoningDisplayMode}
            scrollPositions={scrollPositionsRef.current}
            onSelectItem={(id) => setSelectedItemPath([id])}
          />
          : <ProcessOverview
            blocks={blocks}
            hasFinal={hasFinal}
            scrollPositions={scrollPositionsRef.current}
            onSelectGroup={setSelectedGroupId}
          />}
    </section>
  </div>, document.body);
}

function ProcessOverview({ blocks, hasFinal, scrollPositions, onSelectGroup }) {
  return <ProcessScrollPane className="agent-process-groups" scrollKey="overview" scrollPositions={scrollPositions}>
    <div className="agent-process-timeline">{blocks.map((block) => {
      if (block.type === 'narrative') return <p className="agent-process-phase" key={block.id}>{block.text}</p>;
      return <button type="button" className="agent-process-item agent-process-group" key={block.id} onClick={() => onSelectGroup(block.id)}>
        <span className={`agent-process-glyph status-${block.presentation.status}`}>
          <AgentProcessIcon name={block.presentation.icon} size={block.presentation.icon === 'reasoning' ? 27 : 22} animated={block.presentation.status === 'running'} />
        </span>
        <span className="agent-process-label">
          <span className="agent-process-title-line"><strong>{block.presentation.title}</strong></span>
        </span>
        {block.presentation.status === 'running' ? <i className="agent-process-spinner" /> : <MessageChevronRightIcon size={17} />}
      </button>;
    })}</div>
    {hasFinal ? <div className="agent-process-protocol">
      <h3>输出协议</h3>
      <div><code>&lt;FINAL&gt;</code><span>已识别</span></div>
    </div> : null}
  </ProcessScrollPane>;
}

function ProcessGroupDetail({ group, reasoningDisplayMode, scrollPositions, onSelectItem }) {
  return <ProcessScrollPane
    className="agent-process-list agent-process-detail-timeline"
    scrollKey={`group:${group.id}`}
    scrollPositions={scrollPositions}
  >
    {group.items.map((item) => {
      if (item.kind === 'reasoning' || item.toolName === 'reasoning') {
        const text = typeof item.detail === 'string' && item.detail.trim() ? item.detail : item.summary || '';
        return <ReasoningOverview key={item.id} block={{ item, text }} displayMode={reasoningDisplayMode} />;
      }
      const details = processItemDetails(item);
      return <OperationRow key={item.id} item={item} details={details} onClick={() => onSelectItem(item.id)} />;
    })}
  </ProcessScrollPane>;
}

function ProcessScrollPane({ className, scrollKey, scrollPositions, children }) {
  const elementRef = useRef(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    element.scrollTop = scrollPositions.get(scrollKey) || 0;
    return () => {
      scrollPositions.set(scrollKey, element.scrollTop);
    };
  }, [scrollKey, scrollPositions]);

  return <div
    ref={elementRef}
    className={className}
    onScroll={(event) => scrollPositions.set(scrollKey, event.currentTarget.scrollTop)}
  >{children}</div>;
}

function OperationRow({ item, details, onClick }) {
  const content = <>
    <span className={`agent-process-glyph status-${item.status}`}><AgentProcessIcon name={details.icon} size={22} /></span>
    <span className="agent-process-label">
      <span className="agent-process-title-line">
        <strong>{details.title}</strong>
        {details.target ? <small>{details.target}</small> : null}
      </span>
    </span>
    {item.status === 'running' ? <i className="agent-process-spinner" /> : onClick ? <MessageChevronRightIcon size={17} /> : <span />}
  </>;
  return onClick
    ? <button type="button" className="agent-process-item" onClick={onClick}>{content}</button>
    : <div className="agent-process-item">{content}</div>;
}

function ReasoningOverview({ block, displayMode }) {
  const [visibleLines, setVisibleLines] = useState(8);
  const [hasHiddenLines, setHasHiddenLines] = useState(false);
  const textRef = useRef(null);
  const expandAll = displayMode === 'expanded';

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expandAll) {
      setHasHiddenLines(false);
      return;
    }
    setHasHiddenLines(element.scrollHeight > element.clientHeight + 1);
  }, [block.text, expandAll, visibleLines]);

  return <section className="agent-process-reasoning">
    <div className="agent-process-reasoning-title">
      <span className={`agent-process-glyph status-${block.item.status}`}>
        <AgentProcessIcon name="reasoning" size={27} animated={block.item.status === 'running'} />
      </span>
      <strong>{block.item.status === 'running' ? '正在思考' : '思考过程'}</strong>
    </div>
    {block.text ? <div className="agent-process-reasoning-body">
      <p
        ref={textRef}
        className={expandAll ? '' : 'is-clamped'}
        style={expandAll ? undefined : { '--reasoning-visible-lines': visibleLines }}
      >{block.text.trim()}</p>
      {!expandAll && (hasHiddenLines || visibleLines > 8) ? <div className="agent-process-reasoning-actions">
        {hasHiddenLines ? <button type="button" onClick={() => setVisibleLines((lines) => lines + 10)}>展示更多…</button> : null}
        {visibleLines > 8 ? <button type="button" className="secondary" onClick={() => setVisibleLines(8)}>收起</button> : null}
      </div> : null}
    </div> : null}
  </section>;
}

function ProcessDetail({ item, details, delegatedItems, reasoningDisplayMode, scrollKey, scrollPositions, onSelectItem }) {
  const rawResult = details.result || parseValue(item.summary) || item.summary || item.detail;
  return <ProcessScrollPane className="agent-process-detail" scrollKey={scrollKey} scrollPositions={scrollPositions}>
    <div className="agent-process-detail-intro">
      <div><h3>{details.title}</h3>{details.target ? <p className="target">{details.target}</p> : null}</div>
      <span className={`agent-process-status status-${item.status}`}>{details.statusLabel}</span>
    </div>
    {item.arguments ? <DetailBlock label="调用参数" value={pretty(item.arguments)} /> : null}
    {details.specialized ? <SpecializedResult result={details.specialized} /> : rawResult ? <DetailBlock label="结果" value={pretty(rawResult)} /> : null}
    {details.specialized && rawResult ? <RawResult value={rawResult} /> : null}
    {item.detail && !details.specialized && item.detail !== item.summary && !sameJson(item.detail, rawResult)
      ? <DetailBlock label="事件详情" value={pretty(item.detail)} /> : null}
    {delegatedItems.length ? <DelegatedTimeline
      items={delegatedItems}
      reasoningDisplayMode={reasoningDisplayMode}
      onSelectItem={onSelectItem}
    /> : null}
  </ProcessScrollPane>;
}

function DelegatedTimeline({ items, reasoningDisplayMode, onSelectItem }) {
  const blocks = processBlocks(items);
  return <section className="agent-process-delegated">
    <h4>执行过程</h4>
    <div className="agent-process-detail-timeline">{blocks.flatMap((block) => {
      if (block.type === 'narrative') return [<p className="agent-process-phase" key={block.id}>{block.text}</p>];
      return block.items.map((item) => item.kind === 'reasoning' || item.toolName === 'reasoning'
        ? <ReasoningOverview key={item.id} block={{ item, text: item.detail || item.summary || '' }} displayMode={reasoningDisplayMode} />
        : <OperationRow key={item.id} item={item} details={processItemDetails(item)} onClick={() => onSelectItem(item.id)} />);
    })}</div>
  </section>;
}

function SpecializedResult({ result }) {
  if (result.type === 'glob') return <GlobResult result={result} />;
  if (result.type === 'settings') return <SettingEntries entries={result.entries} />;
  if (result.type === 'variables') return <VariableEntries entries={result.entries} />;
  if (result.type === 'operations') return <OperationEntries result={result} />;
  if (result.type === 'plan') return <PlanEntries steps={result.steps} />;
  return null;
}

function GlobResult({ result }) {
  const displayed = unique([...result.required, ...result.paths]);
  const detailsByPath = new Map(result.pathDetails.map((entry) => [entry?.path, entry]));
  const requiredByPath = new Map(result.requiredEntries.map((entry) => [entry?.path || entry, entry]));
  return <section className="agent-process-result-section">
    <h4>结果</h4>
    <div className="agent-process-result-meta">
      <strong>{result.required.length ? `返回目录 · ${displayed.length} 项` : `匹配结果 · ${result.paths.length} 项`}</strong>
      {result.omitted ? <span>另有 {result.omitted} 项未显示</span> : null}
      <p><b>匹配 {result.paths.length}</b>{result.required.length ? <em> · 必读 {result.required.length}</em> : null}</p>
      <p>范围：{result.scope}{result.pattern ? ` · 路径模式：${result.pattern}` : ''}</p>
    </div>
    <div className="agent-process-result-list">
      {displayed.length ? displayed.map((path) => {
        const metadata = detailsByPath.get(path) || requiredByPath.get(path) || {};
        const strategy = metadata.read_strategy || metadata.read_mode || metadata.readStrategy;
        return <div className="agent-process-result-row" key={path}>
          <AgentProcessIcon name="description" size={19} />
          <span><strong>{displayName(path)}</strong>{parentPath(path) ? <small>{parentPath(path)}</small> : null}</span>
          {strategy ? <em className={`strategy-${strategy}`}>{strategyLabel(strategy)}</em> : null}
        </div>;
      }) : <p className="agent-process-empty">没有匹配路径</p>}
    </div>
  </section>;
}

function SettingEntries({ entries }) {
  return <section className="agent-process-result-section">
    <h4>{entries.length === 1 ? '设定正文' : `设定正文 · ${entries.length} 个条目`}</h4>
    <div className="agent-process-cards">{entries.map((entry, index) => <SettingCard entry={entry} key={entry.path || `${entry.title}-${index}`} />)}</div>
  </section>;
}

function SettingCard({ entry }) {
  const [expanded, setExpanded] = useState(false);
  return <article className={`agent-process-card${expanded ? ' is-expanded' : ''}`}>
    <div className="agent-process-card-body">
      <div className="agent-process-card-title"><strong>{entry.title}</strong>{entry.truncated ? <em className="is-error">已截断</em> : null}{entry.readStrategy ? <em className={`strategy-${entry.readStrategy}`}>{strategyLabel(entry.readStrategy)}</em> : null}</div>
      <p className="agent-process-card-path">{entry.groupPath || parentPath(entry.path) || '根目录'}</p>
      {entry.references.length ? <p className="agent-process-card-note is-keyword">本回合引用：{entry.references.map((reference) => reference?.title || displayName(reference?.path || '')).filter(Boolean).join('、')}</p> : null}
      {entry.selectionHint ? <p className="agent-process-card-note">作者注释：{entry.selectionHint}</p> : null}
      <div className={`agent-process-card-content${expanded ? '' : ' is-clamped'}`}>{entry.content || '没有正文内容'}</div>
    </div>
    <ExpandAction expanded={expanded} collapsedLabel="展开正文" expandedLabel="收起正文" onClick={() => setExpanded((value) => !value)} />
  </article>;
}

function VariableEntries({ entries }) {
  return <section className="agent-process-result-section">
    <h4>{entries.length === 1 ? '变量' : `变量 · ${entries.length} 个`}</h4>
    <div className="agent-process-cards">{entries.map((entry, index) => <VariableCard entry={entry} key={entry.path || index} />)}</div>
  </section>;
}

function VariableCard({ entry }) {
  const [expanded, setExpanded] = useState(false);
  return <article className={`agent-process-card${expanded ? ' is-expanded' : ''}`}>
    <div className="agent-process-card-body">
      <div className="agent-process-card-title"><strong>{displayName(entry.path) || '未命名变量'}</strong>{entry.type ? <em>{entry.type}</em> : null}</div>
      <p className="agent-process-card-path">{entry.path}</p>
      <ValueField label="当前值" value={entry.current || '未返回'} />
      {expanded && entry.defaultValue ? <ValueField label="默认值" value={entry.defaultValue} /> : null}
      {expanded && entry.description ? <ValueField label="说明" value={entry.description} /> : null}
      {expanded && entry.updateRule ? <ValueField label="更新规则" value={entry.updateRule} /> : null}
    </div>
    <ExpandAction expanded={expanded} collapsedLabel="展开字段" expandedLabel="收起字段" onClick={() => setExpanded((value) => !value)} />
  </article>;
}

function ValueField({ label, value }) { return <div className="agent-process-value"><small>{label}</small><p>{value}</p></div>; }

function OperationEntries({ result }) {
  return <section className="agent-process-result-section">
    <h4>{result.operations.length === 1 ? '变更' : `变更 · ${result.operations.length} 项`}</h4>
    <div className="agent-process-result-list">{result.operations.map((entry, index) => <div className="agent-process-result-row" key={`${entry.path}-${index}`}>
      <AgentProcessIcon name="edit" size={19} />
      <span><strong>{entry.path}</strong>{entry.detail ? <small>{entry.detail}</small> : null}</span>
      <em>{operationLabel(entry.op)}</em>
    </div>)}</div>
  </section>;
}

function PlanEntries({ steps }) {
  return <section className="agent-process-result-section">
    <h4>任务计划 · {steps.length} 项</h4>
    <div className="agent-process-result-list">{steps.map((step, index) => <div className="agent-process-result-row" key={`${step.title}-${index}`}>
      <AgentProcessIcon name={step.status === 'complete' || step.status === 'completed' ? 'check' : 'list'} size={19} />
      <span><strong>{step.title}</strong></span>
      {step.status ? <em>{statusLabel(step.status)}</em> : null}
    </div>)}</div>
  </section>;
}

function ExpandAction({ expanded, collapsedLabel, expandedLabel, onClick }) {
  return <button type="button" className="agent-process-expand" onClick={onClick}>{expanded ? expandedLabel : collapsedLabel}<MessageChevronRightIcon /></button>;
}

function RawResult({ value }) { return <details className="agent-process-raw"><summary>原始结果</summary><pre>{pretty(value)}</pre></details>; }
function DetailBlock({ label, value }) { return <section><h4>{label}</h4><pre>{value}</pre></section>; }
function parseValue(value) { if (value && typeof value === 'object') return value; try { return JSON.parse(value); } catch { return value; } }
function pretty(value) { const parsed = parseValue(value); return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2); }
function sameJson(left, right) { try { return JSON.stringify(parseValue(left)) === JSON.stringify(parseValue(right)); } catch { return left === right; } }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function displayName(path) { return typeof path === 'string' ? path.split('/').filter(Boolean).pop() || path : ''; }
function parentPath(path) { const clean = typeof path === 'string' ? path.replace(/^\/+|\/+$/g, '') : ''; return clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/')) : ''; }
function strategyLabel(value) { return value === 'required' ? '必读' : value === 'normal' || value === 'on_demand' ? '按需' : value === 'keyword' ? '关键词' : value === 'variable_condition' ? '已触发' : value; }
function operationLabel(value) { return ({ replace: '替换', add: '新增', remove: '删除', delta: '增减', write_file: '写入', edit_file: '编辑', move_file: '移动', delete_file: '删除' })[value] || value; }
function statusLabel(value) { return ({ pending: '待处理', in_progress: '进行中', complete: '已完成', completed: '已完成', failed: '失败' })[value] || value; }
function durationText(items) {
  if (!items.length) return '';
  const start = Math.min(...items.map((item) => item.startedAtMillis || Infinity));
  const end = Math.max(...items.map((item) => item.completedAtMillis || Date.now()));
  const seconds = Math.max(0, end - start) / 1000;
  return seconds < 1 ? '<1秒' : seconds < 60 ? `${Math.round(seconds)}秒` : `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`;
}
