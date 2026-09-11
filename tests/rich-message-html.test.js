import { describe, expect, it } from 'vitest';
import { buildRichMessageHtml } from '../src/renderer/src/modules/authorFrontend/model/buildRichMessageHtml.js';

describe('rich message sandbox document', () => {
  it('injects the constrained host transport and author SDK before authored scripts', () => {
    const authored = '<!doctype html><html><head><script>window.cardLoaded=true</script></head><body>card</body></html>';
    const output = buildRichMessageHtml({ source: authored, kind: 'full-document', contentKey: 'a' }, 'channel-a');
    expect(output).not.toContain('Content-Security-Policy')
    expect(output).toContain("Object.defineProperty(window, 'ElecKoiNative'")
    expect(output).toContain('0.2.0-preview.5')
    expect(output.indexOf('ElecKoiNative')).toBeLessThan(output.indexOf('window.cardLoaded'))
  });

  it('wraps fragments in a complete transparent document', () => {
    const output = buildRichMessageHtml({ source: '<div class="card">card</div>', kind: 'fragment', contentKey: 'b' }, 'channel-b');
    expect(output.startsWith('<!doctype html><html><head>')).toBe(true)
    expect(output).toContain('<body><div class="card">card</div></body>')
  });

  it('keeps a body-only authored document as the document body', () => {
    const authored = '<body><main>panel</main><script>window.panelLoaded=true</script></body>';
    const output = buildRichMessageHtml({ source: authored, kind: 'full-document', contentKey: 'c' }, 'channel-c');
    expect(output).toContain('</head><body><main>panel</main>')
    expect(output).not.toContain('<body><body>')
    expect(output.indexOf('ElecKoiNative')).toBeLessThan(output.indexOf('window.panelLoaded'))
  });
});
