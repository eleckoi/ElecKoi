/** Unwrap the selected role's label while preserving the native text inside it. */
export function roleplayReplyText(text: string, speakerName: string, streaming = false): string {
  const opening = `<${speakerName}>`
  const labeled = text.trimStart()
  if (!labeled.startsWith(opening)) return streaming && opening.startsWith(labeled) ? '' : text

  const closing = `</${speakerName}>`
  const body = labeled.slice(opening.length)
  const end = body.trimEnd()
  if (end.endsWith(closing)) return end.slice(0, -closing.length)

  const lastTag = streaming ? body.lastIndexOf('<') : -1
  return lastTag >= 0 && closing.startsWith(body.slice(lastTag)) ? body.slice(0, lastTag) : body
}
