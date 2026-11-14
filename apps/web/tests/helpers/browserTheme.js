import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = createRequire(require.resolve('@deepseek-ai/dsh-typert-generator/package.json'))('typescript');

/** Static CSS fragments from the shipped module; asset URL expressions are outside these layout checks. */
export function clientStyleStaticText(source, moduleName) {
  const parsed = ts.createSourceFile('client.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let latestCss, selected;
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (/^css\$?\d*$/.test(node.name.text)) latestCss = node.initializer;
      if (node.name.text === `${moduleName}_module_css_default`) selected = latestCss;
    }
    ts.forEachChild(node, collect);
  };
  collect(parsed);
  const staticText = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => span.literal.text).join('');
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return staticText(node.left) + staticText(node.right);
    return '';
  };
  if (selected && staticText(selected)) return staticText(selected);
  throw new Error(`Missing installed stylesheet: ${moduleName}`);
}

export function browserThemeCss() {
  const source = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-theme/client'), 'utf8');
  const sheets = new Map();
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
      sheets.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(ts.createSourceFile('theme.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
  return ['base_css_default', 'corner_shape_css_default', 'design_platform_css_default', 'gradient_shadow_text_css_default', 'focus_css_default', 'scrollbar_css_default'].map(name => {
    if (!sheets.has(name)) throw new Error(`Locked DSH theme stylesheet is missing: ${name}`);
    return sheets.get(name);
  }).join('\n');
}
