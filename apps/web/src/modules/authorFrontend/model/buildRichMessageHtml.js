import { buildSharedFrontendDocument } from './sharedFrontendDocument.js';

/** Rich HTML uses the same application-owned SDK as advanced project pages. */
export function buildRichMessageHtml(document, channel, runtime, options = {}) {
  return buildSharedFrontendDocument(document.source, runtime, { ...options, channel, frameId: channel, rich: true });
}
