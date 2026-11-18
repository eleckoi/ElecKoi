/** Serialized into author documents; keep this function independent of module state. */
export function isAuthorDocumentDiagnostic(event: Event): boolean {
  if ('message' in event) {
    // Do not mistake an author-thrown error with the same text for this browser notice.
    const error = event as ErrorEvent
    return error.isTrusted && error.error == null
      && error.message === 'ResizeObserver loop completed with undelivered notifications.'
  }
  // A failed media resource does not prevent the rest of the document from running.
  const target = event.target as Element | null
  return ['IMG', 'AUDIO', 'VIDEO', 'SOURCE', 'TRACK'].includes(target?.tagName ?? '')
}
