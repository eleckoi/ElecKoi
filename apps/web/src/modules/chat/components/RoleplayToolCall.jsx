import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DisclosureRow, IconChevronLeftOutlineRegular,
  IconCodeOutlineRegular, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { ReadSettingIcon, SearchSettingIcon } from '../../../ui/icons/elecKoiMessageIcons.jsx';
import { parseToolJson, resultMatchesQuery, roleplayToolDefinition, roleplayToolResult } from '../model/roleplayToolResults.js';
import { ResultReadingBadge, ToolResultDetail } from './RoleplayToolDetail.jsx';
import '../styles/roleplay-tool-results.css';

export function renderRoleplayToolCall(owner, renderNative) {
  const definition = roleplayToolDefinition(owner.toolName);
  return definition ? <RoleplayToolCall {...owner} definition={definition} renderNative={renderNative} /> : undefined;
}

function RoleplayToolCall({ block, phase, callId, toolName, definition, useDisclosure, inspect, renderNative }) {
  const { expanded, toggle } = useDisclosure();
  const result = useMemo(() => roleplayToolResult(definition, block), [definition, block]);
  const args = useMemo(() => parseToolJson(block.call?.argsRaw), [block.call?.argsRaw]);
  if (phase === 'result' && !result) return renderNative();
  const reading = definition.operation === 'read';
  const Icon = reading ? ReadSettingIcon : SearchSettingIcon;
  const running = phase !== 'result';
  const title = `${running ? '正在' : '已'}${definition.label}`;
  const target = args?.pattern || args?.path;
  return <div className="roleplay-tool-call" data-roleplay-tool={definition.domain} data-roleplay-tool-name={toolName} data-tool-call-id={callId}>
    <DisclosureRow icon={<Icon size={14} />} title={title} open={expanded} expandable={Boolean(result)}
      onToggle={toggle} running={running} expandOnRowClick
      collapsedContent={<span className="roleplay-tool-summary">{target ? <> · <span title={target}>{target}</span></> : null}
        {result ? <> · {result.entries.length} 项</> : null}</span>}>
      {result && expanded ? <ToolResultBrowser result={result} callId={callId} /> : null}
    </DisclosureRow>
    {expanded && inspect ? <button type="button" className="roleplay-tool-inspect" onClick={inspect}><IconCodeOutlineRegular size={13} />查看</button> : null}
  </div>;
}

function ToolResultBrowser({ result, callId }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selection, setSelection] = useState(null);
  const [reading, setReading] = useState(false);
  const scrollRef = useRef(null);
  const id = useId();
  const entries = useMemo(() => result.entries.filter(entry => resultMatchesQuery(entry, deferredQuery)), [result, deferredQuery]);
  const selected = entries.find(entry => entry.key === selection) || entries[0];
  const [activeIndex, setActiveIndex] = useState(0);
  const getItemKey = useCallback(index => entries[index].key, [entries]);
  const virtualizer = useVirtualizer({ count: entries.length, getScrollElement: () => scrollRef.current,
    estimateSize: () => 48, overscan: 3, getItemKey });
  const items = virtualizer.getVirtualItems();
  useEffect(() => { virtualizer.measure(); }, [entries, reading, virtualizer]);
  const choose = (entry, index) => { setSelection(entry.key); setActiveIndex(index); setReading(true); };
  const move = event => {
    if (!entries.length) return;
    const current = Number(event.target.closest('[data-result-index]')?.dataset.resultIndex ?? activeIndex);
    const next = event.key === 'ArrowDown' ? Math.min(entries.length - 1, current + 1)
      : event.key === 'ArrowUp' ? Math.max(0, current - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); setActiveIndex(next); virtualizer.scrollToIndex(next, { align: 'auto' });
    requestAnimationFrame(() => scrollRef.current?.querySelector(`[data-result-index="${next}"]`)?.focus());
  };
  return <div className="roleplay-result-browser" data-reading={reading || undefined} data-result-count={result.entries.length}>
    <div className="roleplay-result-toolbar"><label htmlFor={id}><IconSearchOutlineRegular size={14} /><input id={id} type="search"
      value={query} placeholder="在本次结果中查找" aria-label="在本次结果中查找" onChange={event => { setQuery(event.target.value); setActiveIndex(0); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} /></label>
      <span aria-live="polite">{deferredQuery.trim() ? `${entries.length} / ` : ''}{result.entries.length} 项</span></div>
    {result.operation !== 'read' ? <div className="roleplay-result-summary" aria-label="本次结果分类统计">
      <span data-reading-kind="matched">匹配 {result.counts.matched}</span>
      {result.counts.fixed ? <span data-reading-kind="fixed">固定必读 {result.counts.fixed}</span> : null}
      {result.counts.turn ? <span data-reading-kind="turn">本轮须读 {result.counts.turn}</span> : null}
      {result.counts.required ? <span data-reading-kind="required">必读 {result.counts.required}</span> : null}
    </div> : null}
    <div className="roleplay-result-columns">
      <div className="roleplay-result-directory" ref={scrollRef} onKeyDown={move} role="region" aria-label="本次调用结果目录">
        <div className="roleplay-result-space" style={{ height: virtualizer.getTotalSize() }}>
          {items.map(item => { const entry = entries[item.index]; return <button key={entry.key} type="button"
            data-result-index={item.index} className="roleplay-result-row" aria-current={selected?.key === entry.key || undefined}
            style={{ height: item.size, transform: `translateY(${item.start}px)` }} onClick={() => choose(entry, item.index)}>
            <span><strong title={entry.title}>{entry.title}</strong><small title={entry.path}>{entry.path}</small></span>
            {entry.source?.content_delivery === 'error' ? <em className="is-error">失败</em> : <ResultReadingBadge entry={entry} domain={result.domain} />}
          </button>; })}
        </div>
        {!entries.length ? <div className="roleplay-result-empty">{query ? '没有匹配条目' : '本次没有返回条目'}</div> : null}
      </div>
      <div className="roleplay-result-detail">
        <button type="button" className="roleplay-result-back" onClick={() => setReading(false)}><IconChevronLeftOutlineRegular size={14} />返回目录</button>
        {selected ? <ToolResultDetail key={`${callId}:${selected.key}`} entry={selected} result={result} /> : <div className="roleplay-result-empty">没有可显示的条目</div>}
      </div>
    </div>
    {result.payload.truncated === true || result.payload.omitted > 0 ? <div className="roleplay-result-notice">工具本次返回了部分结果{result.payload.omitted > 0 ? `，省略 ${result.payload.omitted} 项` : ''}。</div> : null}
  </div>;
}
