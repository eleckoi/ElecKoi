import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export function browserThemeCss() {
  const source = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-theme/client'), 'utf8');
  const sheets = new Map([...source.matchAll(/var (\w+_css_default) = ("(?:[^"\\]|\\.)*");/g)].map(match => [match[1], JSON.parse(match[2])]));
  return ['base_css_default', 'corner_shape_css_default', 'design_platform_css_default', 'gradient_shadow_text_css_default', 'focus_css_default', 'scrollbar_css_default'].map(name => {
    if (!sheets.has(name)) throw new Error(`Locked DSH theme stylesheet is missing: ${name}`);
    return sheets.get(name);
  }).join('\n');
}
