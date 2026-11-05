import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve('vite'))('postcss');
const parseStyles = path => postcss.parse(readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8'));
const declarations = (sheet, selector) => {
  const values = {};
  sheet.walkRules(rule => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls(declaration => { values[declaration.prop] = declaration.value; });
  });
  return values;
};

const controls = [
  ['setting library', 'modules/settingLibraries/styles/setting-library.css', '.setting-library-tree-switch', '.setting-library-tree-switch span'],
  ['scripts', 'modules/scripts/styles/script-libraries.css', '.script-switch i', '.script-switch i::before'],
  ['variables', 'modules/variables/styles/variable-config.css', '.variable-tree-switch', '.variable-tree-switch > span'],
  ['regex list', 'modules/regex/styles/regex-rules.css', '.regex-rule-switch i', '.regex-rule-switch i::after'],
  ['regex options', 'modules/regex/styles/regex-rules.css', '.regex-inline-switch i', '.regex-inline-switch i::after'],
  ['preset regex', 'modules/presets/styles/preset-panel.css', '.preset-regex-enabled', '.preset-regex-enabled i'],
  ['preset tools', 'modules/presets/styles/preset-panel.css', '.preset-tool-toggle', '.preset-tool-toggle i'],
  ['chat tools', 'modules/chat/styles/chat-panel.css', '.agent-tool-switch', '.agent-tool-switch span'],
];

describe('desktop switch shape', () => {
  it('uses the original script switch radii and theme corner shape only for desktop presentation', () => {
    const tokens = parseStyles('app/windows/styles/tokens.css');
    expect(declarations(tokens, ':root:not([data-eleckoi-mobile="true"])')).toMatchObject({
      '--switch-track-radius': '12px',
      '--switch-thumb-radius': '50%',
      '--switch-corner-shape': 'var(--dsw-corner-shape, round)',
    });
    tokens.walkDecls(/^--switch-/, declaration => {
      expect(declaration.parent.selector).toBe(':root:not([data-eleckoi-mobile="true"])');
    });
  });

  it.each(controls)('%s shares the original script switch shape without a separate circular override', (_name, path, track, thumb) => {
    const sheet = parseStyles(path);
    expect(declarations(sheet, track)['border-radius']).toMatch(/^var\(--switch-track-radius, /);
    expect(declarations(sheet, thumb)['border-radius']).toMatch(/^var\(--switch-thumb-radius, /);
    for (const selector of [track, thumb]) {
      expect(declarations(sheet, selector)['corner-shape']).toMatch(/^var\(--switch-corner-shape, /);
    }
  });

  it('keeps the existing mobile fallbacks when desktop tokens are absent', () => {
    for (const [_name, path, track, thumb] of controls) {
      const sheet = parseStyles(path);
      expect(declarations(sheet, track)['border-radius']).toBe(`var(--switch-track-radius, ${track === '.script-switch i' ? '12px' : '999px'})`);
      expect(declarations(sheet, thumb)['border-radius']).toBe('var(--switch-thumb-radius, 50%)');
      const shape = track === '.script-switch i'
        ? 'var(--switch-corner-shape, var(--dsw-corner-shape, round))'
        : 'var(--switch-corner-shape, round)';
      expect(declarations(sheet, track)['corner-shape']).toBe(shape);
      expect(declarations(sheet, thumb)['corner-shape']).toBe(shape);
    }
  });
});
