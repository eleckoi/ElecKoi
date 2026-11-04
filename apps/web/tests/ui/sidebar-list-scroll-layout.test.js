import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readStyles = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const shellStyles = readStyles('../../src/app/windows/shell/styles/client-shell.css');
const pluginStyles = readStyles('../../src/app/windows/shell/styles/plugin-center.css');
const characterStyles = readStyles('../../src/modules/persona/styles/character-list.css');
const modelStyles = readStyles('../../src/modules/models/styles/model-config.css');
const presetStyles = readStyles('../../src/modules/presets/styles/preset-panel.css');
const conversationStyles = readStyles('../../src/modules/chat/styles/conversation-list.css');
const scrollStyles = readStyles('../../src/ui/styles/sidebar-scroll-area.css');

describe('sidebar list scrolling', () => {
  it('keeps the shared side-panel height bounded', () => {
    expect(shellStyles).toMatch(/\.side-panel-shell[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
    expect(shellStyles).toMatch(/\.side-panel-content\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/);
  });

  it('puts plugin items in the bounded row below the header', () => {
    expect(pluginStyles).toMatch(/\.plugin-list-panel\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/);
    expect(pluginStyles).toMatch(/\.plugin-list-panel\s*\{[^}]*height:\s*100%;[^}]*max-height:\s*100%;[^}]*overflow:\s*hidden;/);
    expect(pluginStyles).toMatch(/\.plugin-list-panel\s*>\s*\.sidebar-scroll-area\s*\{[^}]*grid-row:\s*2;/);
    expect(pluginStyles).toMatch(/\.plugin-list-panel\s+\.character-list-scroll\s*\{[^}]*overflow-y:\s*auto;/);
  });

  it('inherits the official scrollbar across all sidebar lists without changing widths when overflow appears', () => {
    expect(characterStyles).toMatch(/\.character-list-scroll\s*\{[^}]*padding:\s*0 0 16px;/);
    expect(characterStyles).not.toMatch(/\.character-list-scroll::\-webkit-scrollbar(?:-thumb)?\s*\{/);
    expect(pluginStyles).not.toMatch(/\.plugin-list-panel\s*>\s*\.character-list-scroll[^}]*scrollbar-(?:width|color|gutter)/);
    for (const styles of [characterStyles, modelStyles, conversationStyles]) {
      expect(styles).not.toMatch(/\.(?:character-list-scroll|model-config-list|conversation-scroll)\s*\{[^}]*scrollbar-gutter:\s*stable;/);
    }
    expect(scrollStyles).toMatch(/\.sidebar-scroll-area\s*>\s*\.sidebar-scroll-viewport\s*\{[^}]*scrollbar-gutter:\s*auto;[^}]*scrollbar-width:\s*none;/);
    expect(scrollStyles).toMatch(/\.sidebar-scrollbar\s*\{[^}]*position:\s*absolute;[^}]*width:\s*var\(--dsh-scrollbar-width, 5px\);/);
    expect(conversationStyles).toMatch(/\.conversation-scroll\s*\{[^}]*padding:\s*0;/);
    expect(presetStyles).not.toMatch(/\.preset-list-scroll\s*\{[^}]*scrollbar-gutter:\s*auto;/);
    expect(conversationStyles).not.toMatch(/\.conversation-scroll::\-webkit-scrollbar\s*\{/);
    expect(modelStyles).not.toMatch(/\.model-config-list[^{}]*::\-webkit-scrollbar(?:-thumb)?\s*[,\{]/);
    expect(modelStyles).toMatch(/\.model-config-list\s*\{[^}]*padding:\s*0 0 18px;/);
  });

  it('keeps plugin, character, preset, and conversation lists wheel-scrollable', () => {
    expect(characterStyles).toMatch(/\.character-list-panel\s*\{[^}]*height:\s*100%;[^}]*max-height:\s*100%;[^}]*overflow:\s*hidden;/);
    expect(characterStyles).toMatch(/\.character-list-scroll\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/);
    expect(presetStyles).toMatch(/\.preset-list-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/);
    expect(presetStyles).toMatch(/\.preset-list-panel\s*>\s*\.sidebar-scroll-area\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/);
    expect(conversationStyles).toMatch(/\.conversation-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/);
  });
});
