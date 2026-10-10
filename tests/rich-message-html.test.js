import { describe, expect, it } from 'vitest';
import * as libraries from '@eleckoi/compatibility-tavern-shared/browser-libraries';
import { buildRichMessageHtml } from '../apps/web/src/modules/authorFrontend/model/buildRichMessageHtml.js';

const runtime = { assetsBaseUrl: '/eleckoi/compat/', sdk: libraries };

describe('shared rich message document', () => {
  it('loads the shared SDK and declared browser resources before authored scripts', () => {
    const output = buildRichMessageHtml({ source: '<html><head><script>window.cardLoaded=true</script></head><body>card</body></html>' },
      'channel-a', runtime, { messageId: 'message-a', conversationId: 'chat-a' });
    expect(output).not.toContain('Content-Security-Policy');
    expect(output).toContain('parent.__ElecKoiClientCompatibility.prepareDocument');
    expect(output).toContain('"messageId":"message-a"');
    expect(output).toContain('"conversationId":"chat-a"');
    for (const file of [...libraries.BROWSER_LIBRARY_SCRIPTS, ...libraries.BROWSER_LIBRARY_STYLES]) {
      expect(output).toContain(`/eleckoi/compat/assets/assets/${file}`);
      expect(output.indexOf(file)).toBeLessThan(output.indexOf('window.cardLoaded'));
    }
    expect(output.indexOf('prepareDocument')).toBeLessThan(output.indexOf('window.cardLoaded'));
  });
  it('wraps fragments in a transparent document and retains body-only documents', () => {
    const fragment = buildRichMessageHtml({ source: '<div class="card">card</div>' }, 'channel-b', runtime);
    expect(fragment.startsWith('<!doctype html><html><head>')).toBe(true);
    expect(fragment).toContain('<body><div class="card">card</div></body>');
    expect(fragment).toContain('background:transparent');
    const body = buildRichMessageHtml({ source: '<body><main>panel</main></body>' }, 'channel-c', runtime);
    expect(body).toContain('</head><body><main>panel</main>');
    expect(body).not.toContain('<body><body>');
  });
  it('diagnoses a missing shared runtime instead of emitting an unusable document', () => {
    expect(() => buildRichMessageHtml({ source: '<div>card</div>' }, 'channel')).toThrow('SDK');
  });
});
