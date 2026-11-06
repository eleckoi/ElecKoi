import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatStyles = readFileSync(
  new URL('../../src/modules/chat/styles/chat-panel.css', import.meta.url),
  'utf8',
);
const darkStyles = readFileSync(
  new URL('../../src/app/windows/styles/dark-theme.css', import.meta.url),
  'utf8',
);

const conversationClient = readFileSync(
  new URL('../../../../node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', import.meta.url),
  'utf8',
);
const themeClient = readFileSync(
  new URL('../../../../node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js', import.meta.url),
  'utf8',
);
const chatClient = readFileSync(
  new URL('../../../../node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js', import.meta.url),
  'utf8',
);

function conversationSheet(name) {
  const section = conversationClient.split(`/${name}.module.css.mjs`)[1]?.split('//#endregion')[0];
  const literal = section?.match(/const css\$\d+ = ("(?:[^"\\]|\\.)*");/)?.[1];
  if (!literal) throw new Error(`Missing installed conversation sheet: ${name}`);
  return JSON.parse(literal);
}

describe('chat layout width alignment', () => {
  it('keeps the Agent text column aligned with the official DSH composer inset', () => {
    expect(chatStyles).toMatch(
      /--dsh-composer-card-max-width:\s*calc\(var\(--dsh-chat-content-width\) \+ 32px\);/,
    );
    expect(chatStyles).toMatch(
      /--chat-reading-width:\s*var\(--dsh-chat-content-width\);/,
    );
    expect(chatStyles).toMatch(
      /--chat-composer-card-max-width:\s*var\(--dsh-composer-card-max-width\);/,
    );
    expect(chatStyles).toMatch(
      /\.message-agent\s*\{[^}]*width:\s*min\(var\(--chat-composer-card-max-width\), 100%\);[^}]*padding-right:\s*var\(--chat-horizontal-padding, 16px\);[^}]*padding-left:\s*var\(--chat-horizontal-padding, 16px\);/,
    );
  });

  it('keeps Agent messages at the same width while selecting messages for deletion', () => {
    expect(chatStyles).toMatch(
      /\.message-delete-selection-row\.layout-agent\s*\{[^}]*width:\s*min\(calc\(var\(--chat-composer-card-max-width\) \+ 30px\), 100%\);/,
    );
  });

  it('supplies the official Composer seat height cap to the native input scrollport', () => {
    const rootStyles = conversationSheet('ConversationRoot');
    const inputStyles = conversationSheet('InputBar');
    const officialCap = rootStyles.match(/--dsh-composer-text-max-height:([^;}]+)/)?.[1];
    expect(officialCap).toBe('336px');
    const seat = chatStyles.match(/\.chat-composer-region\s*\{([^}]+)\}/)?.[1];
    expect(seat).toContain(`--dsh-composer-text-max-height: ${officialCap};`);
    expect(inputStyles).toMatch(/\.[\w]+_scroll\{[^}]*max-height:var\(--dsh-composer-text-max-height\);[^}]*overflow-y:auto/);
    expect(conversationClient).toContain('"data-input-scroll": true');
    expect(inputStyles).toContain('--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2)');
    expect(themeClient).toContain('["scrollbar.css", scrollbar_css_default]');
    expect(chatStyles).not.toMatch(/\[data-input-scroll\][^{]*\{[^}]*overflow[^;]*:\s*(hidden|clip)/);
  });

  it('lets the native scrollport and floating controls span the sticky Composer', () => {
    expect(chatStyles).toMatch(/\.message-area\s*\{[^}]*display:\s*flex;[^}]*flex:\s*1;[^}]*padding:\s*0;[^}]*scrollbar-gutter:\s*stable;/);
    expect(chatStyles).toMatch(/\.chat-composer-region\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/);
    expect(chatStyles).not.toContain('.message-area [data-chat-to-bottom]');
    expect(chatStyles).toMatch(/\.message-area \[data-chat-scroll\]\s*\{[^}]*padding:\s*28px var\(--chat-scroll-horizontal-padding\) 16px;/);
    expect(chatStyles).not.toContain('.chat-to-bottom-slot');
    expect(chatStyles).not.toMatch(/\.message-area(?:::|-)[^{]*scrollbar-thumb/);
    expect(chatStyles).not.toMatch(/\.message-area::-webkit-scrollbar\s*\{/);
    expect(darkStyles).not.toMatch(/\.message-area[^\{]*::-webkit-scrollbar/);
    expect(themeClient).toContain('--dsh-scrollbar-width:5px');
  });

  it('keeps the transcript tail clearance at the pinned ChatView value for every layout', () => {
    const section = chatClient.split('/ChatView.module.css.mjs')[1]?.split('//#endregion')[0];
    const expression = section?.match(/const css\$\d+ = (.+);/)?.[1];
    expect(expression).toBeTruthy();
    // New bundles interpolate asset URLs inside CSS; static fragments retain the spacing rules.
    const officialStyles = [...expression.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => JSON.parse(match[0])).join('');
    const officialPadding = officialStyles.match(/\.[\w]+_scroll\{[^}]*padding:(\d+px)\s/)[1];
    const productPadding = chatStyles.match(/\.message-area \[data-chat-scroll\]\s*\{[^}]*padding:\s*28px var\(--chat-scroll-horizontal-padding\) (\d+px);/)[1];
    expect(productPadding).toBe(officialPadding);
  });
});
