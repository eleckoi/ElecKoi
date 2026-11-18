// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildAuthorDocumentSource } from '@eleckoi/author-sdk';
import { buildSharedFrontendDocument } from '../../src/modules/authorFrontend/model/sharedFrontendDocument.js';

const notification = 'ResizeObserver loop completed with undelivered notifications.';
const nativeHtml = '<html><head><meta name="eleckoi-author-api" content="0.1.0"></head><body>Ready</body></html>';
const runtime = { assetsBaseUrl: '/synthetic/', sdk: { browserModuleImports: () => ({}), BROWSER_LIBRARY_STYLES: [], BROWSER_LIBRARY_SCRIPTS: [], BROWSER_LIBRARY_VERSIONS: {} } };

function mount(source) {
  const handlers = new Map(), postMessage = vi.fn();
  const addEventListener = (type, handler, options) => handlers.set(type, [...(handlers.get(type) || []), { handler, capture: options === true }]);
  const page = { parent: { postMessage }, addEventListener };
  const document = new DOMParser().parseFromString(source, 'text/html');
  const script = [...document.scripts].find(script => script.textContent.includes('__ElecKoiDocumentChannel'));
  new Function('window', 'parent', 'addEventListener', script.textContent)(page, page.parent, addEventListener);
  const dispatch = (type, event) => handlers.get(type)?.forEach(({ handler, capture }) => {
    if (!event.target || event.target === page || capture) handler({ target: page, ...event });
  });
  return { page, postMessage, dispatch, messages: () => postMessage.mock.calls.map(([data]) => data) };
}

describe.each([
  ['native', () => buildAuthorDocumentSource(nativeHtml, 'synthetic-channel')],
  ['compatibility', () => buildSharedFrontendDocument('<body>Ready</body>', runtime, { channel: 'synthetic-channel' })],
])('%s author document error routing', (_name, build) => {
  it('keeps browser layout notifications diagnostic before and after SDK readiness', () => {
    const frame = mount(build());
    const notify = () => frame.dispatch('error', { isTrusted: true, error: null, message: notification });
    notify();
    if (frame.page.__ElecKoiCompleteDocument) frame.page.__ElecKoiCompleteDocument({});
    else frame.page.__ElecKoiCompleteSharedDocument();
    notify();
    expect(frame.messages().map(data => data.type)).toEqual(['eleckoi:frontend-diagnostic', 'eleckoi:frontend-ready', 'eleckoi:frontend-diagnostic']);
    expect(frame.messages()[0]).toMatchObject({ channel: 'synthetic-channel', message: notification });
  });

  it('retains real exceptions, same-text author errors, rejections and resource failures', () => {
    const frame = mount(build());
    frame.dispatch('error', { isTrusted: true, error: new Error(notification), message: notification });
    frame.dispatch('error', { isTrusted: false, error: null, message: notification });
    frame.dispatch('error', { isTrusted: true, error: null, message: 'Script error.' });
    frame.dispatch('unhandledrejection', { reason: new Error('Synthetic rejected operation') });
    const script = document.createElement('script'); script.src = '/synthetic/missing.js';
    // Resource errors do not bubble, so only capture listeners receive them.
    frame.dispatch('error', { target: script });
    const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = '/synthetic/missing.css';
    frame.dispatch('error', { target: stylesheet });
    expect(frame.messages().every(data => data.type === 'eleckoi:frontend-error')).toBe(true);
    expect(frame.messages().map(data => data.message)).toEqual(expect.arrayContaining([
      notification, 'Script error.', 'Synthetic rejected operation', expect.stringContaining('/synthetic/missing.js'), expect.stringContaining('/synthetic/missing.css'),
    ]));
  });

  it.each(['img', 'audio', 'video', 'source', 'track'])('reports a failed %s as a local resource diagnostic', tag => {
    const frame = mount(build());
    const media = document.createElement(tag); media.src = '/synthetic/missing-media';
    frame.dispatch('error', { target: media });
    expect(frame.messages()).toEqual([expect.objectContaining({ type: 'eleckoi:frontend-diagnostic', message: expect.stringContaining('/synthetic/missing-media') })]);
  });

  it('still fails an SDK mount after a browser layout notification', async () => {
    const frame = mount(build());
    frame.dispatch('error', { isTrusted: true, error: null, message: notification });
    const failure = new Error('Synthetic SDK mount failure');
    if (frame.page.__ElecKoiCompleteDocument) frame.page.__ElecKoiCompleteDocument(undefined, failure);
    else frame.page.__ElecKoiCompleteSharedDocument(failure);
    await Promise.resolve();
    expect(frame.messages()).toContainEqual({ channel: 'synthetic-channel', type: 'eleckoi:frontend-error', message: failure.message });
  });
});
