import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DisclosureRow, IconCodeOutlineRegular, IconEditOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { roleplayToolMutation } from '../model/roleplayToolMutations.js';

export function RoleplayMutationCall({ definition, block, phase, callId, toolName, useDisclosure, inspect, renderNative }) {
  const tUi = useProductTranslation();
  const { expanded, toggle } = useDisclosure();
  const model = useMemo(() => roleplayToolMutation(definition, block, phase, tUi), [definition, block, phase, tUi]);
  if (!model) return renderNative();
  return <div className="roleplay-tool-call" data-roleplay-tool={definition.domain} data-roleplay-tool-name={toolName}
    data-tool-call-id={callId} data-mutation-state={model.state}>
    <DisclosureRow icon={<IconEditOutlineRegular size={14} />} title={model.title} open={expanded}
      expandable={model.parts.length > 0} onToggle={toggle} running={model.state === 'running'} expandOnRowClick keepContentWhenOpen
      titleClassName={model.state === 'error' ? 'roleplay-mutation-error-title' : undefined}
      collapsedContent={model.summary ? <span className="roleplay-tool-summary"> · <span title={model.summary}>{model.summary}</span></span> : undefined}>
      {expanded && model.parts.length > 0 ? <MutationDetails parts={model.parts} /> : null}
    </DisclosureRow>
    {expanded && inspect ? <button type="button" className="roleplay-tool-inspect" onClick={inspect}><IconCodeOutlineRegular size={13} />{tUi('查看')}</button> : null}
  </div>;
}

function MutationDetails({ parts }) {
  const tUi = useProductTranslation();
  const scrollRef = useRef(null);
  const estimateSize = useCallback(index => {
    const part = parts[index];
    const text = part.value ?? part.text ?? '';
    const width = Math.max(120, (scrollRef.current?.clientWidth || 420) - 56);
    const lines = String(text).split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length * 7 / width)), 0);
    return part.kind === 'variable' ? Math.max(50, lines * 22 + 24) : Math.max(40, lines * 22 + (part.label ? 40 : 20));
  }, [parts]);
  const virtualizer = useVirtualizer({ count: parts.length, getScrollElement: () => scrollRef.current,
    estimateSize, overscan: 3 });
  useEffect(() => {
    const element = scrollRef.current;
    let width = element?.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element?.clientWidth === width) return;
      width = element?.clientWidth; virtualizer.measure();
    });
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [virtualizer]);
  return <div className="roleplay-mutation-body" ref={scrollRef} style={{ height: Math.min(virtualizer.getTotalSize(), 320) }}
    role="region" aria-label={tUi('本次修改详情')} data-mutation-part-count={parts.length}>
    <div className="roleplay-mutation-space" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(item => {
        const part = parts[item.index];
        const complex = part.kind === 'variable' && (part.value?.includes('\n') || part.value?.length > 80);
        return <div key={item.key} data-index={item.index} data-mutation-kind={part.kind} data-mutation-labeled={Boolean(part.label) || undefined} ref={virtualizer.measureElement}
          className={`roleplay-mutation-part is-${part.kind}${complex ? ' is-complex' : ''}`}
          style={{ transform: `translateY(${item.start}px)` }}>
          {part.kind === 'variable' ? <>
            <span className="roleplay-mutation-path" title={part.path}>
              {part.segments.length > 1 ? <span>{part.segments.slice(0, -1).join(' / ')} / </span> : null}{part.segments.at(-1) || '""'}
            </span>
            <span className="roleplay-mutation-value"><small>{part.action}</small>{part.value !== undefined ? <pre>{part.value}</pre> : null}</span>
          </> : part.kind === 'path' ? <><small>{part.label}</small><span>{part.text}</span></>
            : <>{part.kind === 'removed' || part.kind === 'added' ? <span className="roleplay-mutation-sign" aria-hidden="true">{part.kind === 'removed' ? '−' : '+'}</span> : null}
              <div>{part.label ? <small>{part.label}</small> : null}<pre role={part.kind === 'error' ? 'alert' : undefined}>{part.text || (part.kind === 'added' ? tUi('删除') : part.label ? tUi('正文为空') : '')}</pre></div></>}
        </div>;
      })}
    </div>
  </div>;
}
