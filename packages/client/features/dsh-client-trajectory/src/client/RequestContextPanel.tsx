import React, { useState } from 'react'
import type { TrajectoryRequestContextItem } from './request-context-types.ts'
import type { TrajectoryTranslate } from './locales.ts'
import css from './RequestContextPanel.module.css'

function contextRoleLabel(role: TrajectoryRequestContextItem['role'], t: TrajectoryTranslate): string {
  if (role === 'system') return t('kind.system')
  if (role === 'assistant') return t('kind.assistant')
  return t('kind.user')
}

function contextPreview(content: string): string {
  const previewLines = content.split('\n').slice(0, 7).join('\n')
  return previewLines.length > 620 ? `${previewLines.slice(0, 620)}…` : `${previewLines}…`
}

function RequestContextEntry({
  item,
  t,
}: {
  item: TrajectoryRequestContextItem
  t: TrajectoryTranslate
}) {
  const [expanded, setExpanded] = useState(false)
  const lineCount = item.content.split('\n').length
  const compactThreshold = item.kind === 'tool'
  const expandable = compactThreshold
    ? item.content.length > 320 || lineCount > 8
    : item.content.length > 3_000 || lineCount > 40
  const content = expandable && !expanded ? contextPreview(item.content) : item.content
  return (
    <li className={css.requestContextItem}>
      <header className={css.requestContextHeader}>
        <span className={css.requestContextOrder}>{item.order}</span>
        <span className={`${css.requestContextRole} ${css[`requestContextRole${item.role}`]}`}>
          {contextRoleLabel(item.role, t)}
        </span>
        <strong title={item.anchor === '' ? item.title : item.anchor}>{item.title}</strong>
        <small title={item.source}>{item.source}</small>
      </header>
      <pre className={expanded ? `${css.requestContextContent} ${css.requestContextContentExpanded}` : css.requestContextContent}>
        {content}
      </pre>
      {expandable && (
        <button
          type="button"
          className={css.requestContextExpand}
          aria-expanded={expanded}
          onClick={() => { setExpanded(value => !value) }}
        >
          <span>{t(expanded ? 'context.collapse' : 'context.expand')}</span>
          <small>
            {t('context.size', {
              characters: item.content.length.toLocaleString(),
              lines: lineCount.toLocaleString(),
            })}
          </small>
        </button>
      )}
    </li>
  )
}

export function RequestContextPanel({
  items,
  t,
}: {
  items: readonly TrajectoryRequestContextItem[]
  t: TrajectoryTranslate
}) {
  if (items.length === 0) return <p className={css.noPayload}>{t('context.notRecorded')}</p>
  return (
    <ol className={css.requestContext}>
      {items.map(item => <RequestContextEntry key={`${item.order}:${item.messageId}`} item={item} t={t} />)}
    </ol>
  )
}
