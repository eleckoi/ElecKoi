export type RichMessageDocumentKind = 'full-document' | 'fragment'

export interface RichMessageDocument {
  source: string
  kind: RichMessageDocumentKind
  contentKey: string
}

export type RichMessagePart =
  | { id: string; kind: 'markdown'; source: string }
  | { id: string; kind: 'rich'; document: RichMessageDocument }

export interface RichMessagePresentation {
  parts: RichMessagePart[]
}

const explicitRichMarker = /<!--\s*eleckoi\s*:\s*rich\s*-->/i
const richReplacementStartMarker = '<!-- eleckoi:rich-replacement:start -->'
const richReplacementEndMarker = '<!-- eleckoi:rich-replacement:end -->'
const richReplacementStart = /<!--\s*eleckoi\s*:\s*rich-replacement\s*:\s*start\s*-->/i
const htmlDocumentMarker = /(?:<!doctype\s+html\b|<(?:html|head|body)(?:\s|>))/is
const htmlDocumentClose = /<\/(?:body|html)\s*>/is
const scriptOrStyleBlock = /<(script|style)(?:\s[^>]*)?>.*?<\/\1\s*>/is
const pairedInteractiveElement = /<(div|section|article|main|header|footer|nav|aside|table|form|button|details|dialog|canvas|svg)(?:\s[^>]*)?>.*?<\/\1\s*>/is
const styledElement = /<[a-z][a-z0-9:-]*(?:\s+[^>]*?(?:style|class|id|on[a-z]+|data-[a-z0-9_-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*)\/?>/is

function maskMarkdownFencedCode(source: string): string {
  let output = ''
  let fenceCharacter = ''
  let fenceLength = 0
  let lineStart = 0
  while (lineStart < source.length) {
    const newlineIndex = source.indexOf('\n', lineStart)
    const lineEnd = newlineIndex < 0 ? source.length : newlineIndex
    const line = source.slice(lineStart, lineEnd)
    let prefixLength = 0
    while (prefixLength < line.length && prefixLength < 3 && /[ \t]/.test(line[prefixLength] ?? '')) prefixLength += 1
    const candidate = line.slice(prefixLength)
    const marker = candidate[0] ?? ''
    const markerLength = marker === '`' || marker === '~' ? candidate.match(new RegExp(`^\\${marker}+`))?.[0].length ?? 0 : 0
    if (!fenceCharacter && markerLength >= 3) {
      fenceCharacter = marker
      fenceLength = markerLength
      output += ' '.repeat(line.length)
    } else if (fenceCharacter && marker === fenceCharacter && markerLength >= fenceLength && !candidate.slice(markerLength).trim()) {
      fenceCharacter = ''
      fenceLength = 0
      output += ' '.repeat(line.length)
    } else {
      output += fenceCharacter ? ' '.repeat(line.length) : line
    }
    if (newlineIndex >= 0) {
      output += '\n'
      lineStart = newlineIndex + 1
    } else {
      lineStart = source.length
    }
  }
  return output
}

function document(source: string, kind: RichMessageDocumentKind): RichMessageDocument {
  return { source, kind, contentKey: `${source.length}:${kind}:${hashText(source)}` }
}

function hashText(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function detectRichMessageDocument(source: string): RichMessageDocument | null {
  if (!source.includes('<') || !source.includes('>')) return null
  const candidate = maskMarkdownFencedCode(source).trim()
  if (!candidate) return null
  if (explicitRichMarker.test(candidate)) return document(source, 'fragment')
  if (htmlDocumentMarker.test(candidate)) return document(source, 'full-document')
  if (scriptOrStyleBlock.test(candidate) || pairedInteractiveElement.test(candidate) || styledElement.test(candidate)) {
    return document(source, 'fragment')
  }
  return null
}

export function detectCompleteStreamingRichMessageDocument(source: string): RichMessageDocument | null {
  const result = detectRichMessageDocument(source)
  if (!result) return null
  const candidate = maskMarkdownFencedCode(source).trim()
  const complete = result.kind === 'full-document'
    ? htmlDocumentClose.test(candidate)
    : scriptOrStyleBlock.test(candidate) || pairedInteractiveElement.test(candidate)
  return complete ? result : null
}

function singleOuterMarkdownFenceContent(source: string): string | null {
  const trimmed = source.trim()
  const firstLineEnd = trimmed.indexOf('\n')
  if (firstLineEnd < 0) return null
  const opening = trimmed.slice(0, firstLineEnd).trimStart()
  const marker = opening[0]
  if (marker !== '`' && marker !== '~') return null
  const markerLength = opening.match(new RegExp(`^\\${marker}+`))?.[0].length ?? 0
  if (markerLength < 3) return null
  const lastLineStart = trimmed.lastIndexOf('\n') + 1
  if (lastLineStart <= firstLineEnd) return null
  const closing = trimmed.slice(lastLineStart).trim()
  const closingLength = closing.match(new RegExp(`^\\${marker}+`))?.[0].length ?? 0
  if (closingLength < markerLength || closing.slice(closingLength).trim()) return null
  return trimmed.slice(firstLineEnd + 1, lastLineStart).trim()
}

export function decorateRichDisplayReplacement(replacement: string): string {
  if (richReplacementStart.test(replacement)) return replacement
  const fenced = singleOuterMarkdownFenceContent(replacement)
  const richSource = fenced && detectRawRichMessageKind(fenced)
    ? fenced
    : detectRichMessageDocument(replacement) ? replacement : null
  if (!richSource) return replacement
  return `\n${richReplacementStartMarker}\n${richSource}\n${richReplacementEndMarker}\n`
}

function detectRawRichMessageKind(source: string): RichMessageDocumentKind | null {
  if (!source.includes('<') || !source.includes('>')) return null
  const candidate = source.trim()
  if (!candidate) return null
  if (htmlDocumentMarker.test(candidate)) return 'full-document'
  if (
    explicitRichMarker.test(candidate)
    || scriptOrStyleBlock.test(candidate)
    || pairedInteractiveElement.test(candidate)
    || styledElement.test(candidate)
  ) return 'fragment'
  return null
}

function appendMarkdown(parts: RichMessagePart[], source: string, index: number): void {
  const value = source.trim()
  if (value) parts.push({ id: `part-${index}-markdown`, kind: 'markdown', source: value })
}

function detectFrontendFencedPresentation(source: string, streaming: boolean): RichMessagePresentation | null {
  const parts: RichMessagePart[] = []
  let cursor = 0
  let scan = 0
  let partIndex = 0
  let found = false

  while (scan < source.length) {
    const openingLineFeed = source.indexOf('\n', scan)
    const openingLineEnd = openingLineFeed < 0 ? source.length : openingLineFeed
    const openingLine = source.slice(scan, openingLineEnd).replace(/\r$/, '')
    const opening = /^(?: {0,3})(`{3,}|~{3,})[^\r\n]*$/.exec(openingLine)
    if (!opening) {
      scan = openingLineFeed < 0 ? source.length : openingLineFeed + 1
      continue
    }

    const openingMarker = opening[1]!
    const marker = openingMarker[0]!
    const markerLength = openingMarker.length
    const contentStart = openingLineFeed < 0 ? source.length : openingLineFeed + 1
    let closingStart = -1
    let closingEnd = -1
    let lineStart = contentStart

    while (lineStart < source.length) {
      const lineFeed = source.indexOf('\n', lineStart)
      const lineEnd = lineFeed < 0 ? source.length : lineFeed
      const line = source.slice(lineStart, lineEnd).replace(/\r$/, '')
      const closing = /^(?: {0,3})(`+|~+)[ \t]*$/.exec(line)
      const closingMarker = closing?.[1]
      if (closingMarker?.[0] === marker && closingMarker.length >= markerLength) {
        closingStart = lineStart
        closingEnd = lineFeed < 0 ? source.length : lineFeed + 1
        break
      }
      lineStart = lineFeed < 0 ? source.length : lineFeed + 1
    }

    if (closingStart < 0) break
    const fencedSource = source.slice(contentStart, closingStart).trim()
    const isCompleteFrontend = detectRawRichMessageKind(fencedSource) === 'full-document'
      && (!streaming || htmlDocumentClose.test(fencedSource))
    if (isCompleteFrontend) {
      appendMarkdown(parts, source.slice(cursor, scan), partIndex++)
      parts.push({
        id: `part-${partIndex++}-rich`,
        kind: 'rich',
        document: document(fencedSource, 'full-document'),
      })
      cursor = closingEnd
      found = true
    }
    scan = closingEnd
  }

  if (!found) return null
  appendMarkdown(parts, source.slice(cursor), partIndex)
  return { parts }
}

function promoteFrontendFences(
  presentation: RichMessagePresentation,
  streaming: boolean,
): RichMessagePresentation {
  const parts: RichMessagePart[] = []
  for (const part of presentation.parts) {
    if (part.kind === 'rich') {
      parts.push({ ...part, id: `part-${parts.length}-rich` })
      continue
    }
    const fenced = detectFrontendFencedPresentation(part.source, streaming)
    if (!fenced) {
      appendMarkdown(parts, part.source, parts.length)
      continue
    }
    for (const fencedPart of fenced.parts) {
      parts.push({
        ...fencedPart,
        id: `part-${parts.length}-${fencedPart.kind}`,
      })
    }
  }
  return { parts }
}

function detectMarkedPresentation(source: string): RichMessagePresentation | null {
  const startPattern = /<!--\s*eleckoi\s*:\s*rich-replacement\s*:\s*start\s*-->/gi
  const endPattern = /<!--\s*eleckoi\s*:\s*rich-replacement\s*:\s*end\s*-->/gi
  let cursor = 0
  let partIndex = 0
  let found = false
  const parts: RichMessagePart[] = []
  while (cursor < source.length) {
    startPattern.lastIndex = cursor
    const start = startPattern.exec(source)
    if (!start || start.index === undefined) break
    const startIndex = start.index
    const contentStart = startPattern.lastIndex
    endPattern.lastIndex = contentStart
    const end = endPattern.exec(source)
    if (!end || end.index === undefined) return null
    const endIndex = end.index
    found = true
    appendMarkdown(parts, source.slice(cursor, startIndex), partIndex++)
    const richSource = source.slice(contentStart, endIndex).trim()
    const rich = document(richSource, htmlDocumentMarker.test(richSource) ? 'full-document' : 'fragment')
    parts.push({ id: `part-${partIndex++}-rich`, kind: 'rich', document: rich })
    cursor = endPattern.lastIndex
  }
  if (!found) return null
  appendMarkdown(parts, source.slice(cursor), partIndex)
  return parts.length ? { parts } : null
}

export function detectRichMessagePresentation(source: string, streaming: boolean): RichMessagePresentation | null {
  const marked = detectMarkedPresentation(source)
  if (marked) return promoteFrontendFences(marked, streaming)
  const fenced = detectFrontendFencedPresentation(source, streaming)
  if (fenced) return fenced
  const lastContentIndex = source.search(/\s*$/) - 1
  if (lastContentIndex < 0) return null
  const masked = maskMarkdownFencedCode(source)
  const starts = [explicitRichMarker, htmlDocumentMarker, scriptOrStyleBlock, pairedInteractiveElement, styledElement]
    .map((pattern) => pattern.exec(masked)?.index)
    .filter((value): value is number => value !== undefined)
  if (!starts.length) return null
  const richStart = Math.min(...starts)
  const richSource = source.slice(richStart, lastContentIndex + 1).trim()
  const rich = streaming
    ? detectCompleteStreamingRichMessageDocument(richSource)
    : detectRichMessageDocument(richSource)
  if (!rich) return null
  const parts: RichMessagePart[] = []
  appendMarkdown(parts, source.slice(0, richStart), 0)
  parts.push({ id: `part-${parts.length}-rich`, kind: 'rich', document: rich })
  return { parts }
}
