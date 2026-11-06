import { sourceText } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { resultReadingBadge, resultTextSegments, resultValueText } from '../model/roleplayToolResults.js';

function detailParts(entry, result, tUi = sourceText) {
  const data = entry.source;
  const parts = [{ kind: 'header' }];
  const append = (text, kind = 'text', label = '') => {
    resultTextSegments(text).forEach((text, index) => parts.push({ kind, text, label: index === 0 ? label : '' }));
  };
  const field = (label, value) => {
    if (value && ['text_page', 'array_page', 'object_page'].includes(value.kind)) append(
      `${label}：${value.kind === 'text_page' ? `本次返回 ${value.returned_chars} / ${value.total_chars} 字符` : `本次返回 ${value.returned} / ${value.total} 项`}${value.has_more ? ' · 尚有未返回内容' : ''}`, 'note');
    append(resultValueText(value), 'field', label);
  };
  if (entry.requiredOnly) append(`${resultReadingBadge(entry, result.domain, tUi)?.label || '必读'}，位于本次搜索范围之外。`, 'note');
  if (data?.selection_hint) append(data.selection_hint, 'note');
  if (data?.resolved_references?.length) append(`本回合引用：${data.resolved_references.map(item => item.title).join('、')}`, 'note');
  if (data?.error) append(typeof data.error.message === 'string' ? data.error.message : resultValueText(data.error), 'error');
  if (result.domain === 'settings' && typeof data?.content === 'string') {
    if (data.content_delivery === 'cached_reference') append(`缓存引用${data.cached_reference ? ` · ${data.cached_reference}` : ''}`, 'note');
    append(data.content || '正文为空');
  }
  if (result.domain === 'variables' && data) {
    if (Object.hasOwn(data, 'current')) field('当前值', data.current_present === false ? '尚未写入' : data.current);
    if (Object.hasOwn(data, 'default')) field('默认值', data.default);
    if (data.description) append(data.description, 'field', '说明');
    if (data.update_rule) append(data.update_rule, 'field', '更新规则');
    if (data.write_guidance) append(data.write_guidance, 'field', '写入要求');
  }
  for (const match of entry.matches) {
    if (Number.isFinite(match.line)) append(`第 ${match.line} 行${match.match_count ? ` · ${match.match_count} 处` : ''}`, 'note');
    if (Number.isFinite(match.count)) append(`${match.count} 处匹配`, 'note');
    if (typeof match.text === 'string') append(match.text);
  }
  return parts;
}

export function ToolResultDetail({ entry, result }) {
  const tUi = useProductTranslation();
  const scrollRef = useRef(null);
  const parts = useMemo(() => detailParts(entry, result, tUi), [entry, result, tUi]);
  const estimateSize = useCallback(index => {
    const part = parts[index];
    if (part.kind === 'header') return 62;
    const width = Math.max(120, (scrollRef.current?.clientWidth || 360) - (part.kind === 'field' ? 100 : 32));
    return Math.max(24, Math.ceil((part.text?.length || 0) * 7 / width) * 24) + (part.kind === 'text' ? 0 : 8);
  }, [parts]);
  const virtualizer = useVirtualizer({ count: parts.length, getScrollElement: () => scrollRef.current, estimateSize, overscan: 2 });
  useEffect(() => {
    const element = scrollRef.current;
    let width = element?.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element?.clientWidth === width) return;
      width = element.clientWidth; virtualizer.measure();
    });
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [virtualizer]);
  return <div className="roleplay-result-detail-scroll" ref={scrollRef} role="region" aria-label={tUi("选中条目详情")}>
    <div className="roleplay-result-detail-space" style={{ height: virtualizer.getTotalSize() }} data-detail-part-count={parts.length}>
      {virtualizer.getVirtualItems().map(item => {
        const part = parts[item.index];
        return <div key={item.key} data-index={item.index} data-detail-kind={part.kind} ref={virtualizer.measureElement}
          className="roleplay-result-part" style={{ transform: `translateY(${item.start}px)` }}>
          {part.kind === 'header' ? <DetailHeader entry={entry} result={result} />
            : part.kind === 'field' ? <div className="roleplay-result-field"><span>{part.label}</span><pre>{part.text}</pre></div>
              : <pre className={`roleplay-result-text${part.kind === 'note' ? ' is-note' : part.kind === 'error' ? ' is-error' : ''}`}
                role={part.kind === 'error' ? 'alert' : undefined}>{part.text}</pre>}
        </div>;
      })}
    </div>
  </div>;
}

function DetailHeader({ entry, result }) {
  const tUi = useProductTranslation();
  const data = entry.source;
  return <div className="roleplay-result-card">
    <header><strong>{entry.title}</strong>{result.domain === 'variables' && data?.type ? <span>{data.type}</span> : null}<ResultReadingBadge entry={entry} domain={result.domain} /></header>
    <p className="roleplay-result-path">{data?.group_path === '' ? tUi("根目录") : data?.group_path ?? entry.path}</p>
  </div>;
}

export function ResultReadingBadge({ entry, domain }) {
  const tUi = useProductTranslation();
  const badge = resultReadingBadge(entry, domain, tUi);
  return badge ? <span className="roleplay-reading-badge" data-reading-kind={badge.kind}>{badge.label}</span> : null;
}
