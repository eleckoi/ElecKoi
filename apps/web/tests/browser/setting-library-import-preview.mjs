import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require = createRequire(import.meta.url);
const { context, build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const output = resolve('build/setting-library-import-preview');
await mkdir(output, { recursive: true });
const preview = await context({
  entryPoints: { fixture: 'apps/web/tests/browser/setting-workspace.fixture.jsx', preset: 'apps/web/tests/browser/preset-editor.fixture.jsx' },
  outdir: output,
  bundle: true, format: 'esm', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'dataurl', '.png': 'dataurl' },
  plugins: [{ name: 'inline-css', setup(builder) {
    builder.onResolve({ filter: /\.css\?inline$/ }, args => ({
      path: resolve(dirname(args.importer), args.path.replace(/\?inline$/, '')), namespace: 'inline-css',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({
      loader: 'text', contents: (await build({
        stdin: { contents: await readFile(args.path, 'utf8'), loader: 'css', resolveDir: dirname(args.path) },
        bundle: true, write: false,
      })).outputFiles[0].text,
    }));
  } }],
});
await preview.rebuild();
for (const [page, entry] of [['editor', 'fixture'], ['preset', 'preset']]) {
  await writeFile(resolve(output, page + '.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${browserThemeCss()}html,body,#root,#eleckoi-root{margin:0;height:100%}</style><link rel="stylesheet" href="${entry}.css">
<div id="root"></div><script type="module" src="${entry}.js"></script></html>`);
}
await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>设定库导入 · 组件预览</title><style>
*{box-sizing:border-box}body{margin:0;height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr);background:#e9eaed;color:#24262a;font:14px system-ui}
nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px;background:#fff;border-bottom:1px solid #d9dce2}
button,select{font:inherit;color:inherit;background:#fff;border:1px solid #c9ccd4;border-radius:8px;padding:7px 10px}
button[aria-pressed="true"]{background:#22252b;color:#fff}main{overflow:auto;padding:12px;text-align:center}
iframe{display:inline-block;border:1px solid #c9ccd4;border-radius:12px;width:390px;height:100%;min-height:430px;vertical-align:top;background:#fff}
</style><nav aria-label="预览选项"><button data-device="mobile" aria-pressed="true">安卓</button><button data-device="desktop" aria-pressed="false">PC</button>
<select aria-label="预览场景">
<optgroup label="角色卡编辑器"><option value="character">设定库</option><option value="global-toolbar">全局设定库</option>
<option value="openings">开场白</option><option value="variables">变量</option><option value="regex">正则</option><option value="scripts">脚本</option></optgroup>
<optgroup label="预设编辑器"><option value="preset-prompts">预设提示词</option><option value="preset-tools">工具</option>
<option value="preset-regex">预设正则</option><option value="preset-scripts">预设脚本</option></optgroup>
<optgroup label="设定库弹窗"><option value="role-import">角色导入</option><option value="global">全局导入</option><option value="merge">并入设定库</option>
<option value="management">版本管理</option><option value="versions">选择版本</option><option value="entries">选择设定条目</option></optgroup></select>
<button id="theme" aria-pressed="false">深色</button></nav>
<main><iframe title="ElecKoi 设定库编辑器"></iframe></main>
<script>
const frame = document.querySelector('iframe'), viewport = document.querySelector('main'), scenario = document.querySelector('select');
const initial = new URLSearchParams(location.search);
let device = initial.get('device') === 'desktop' ? 'desktop' : 'mobile', theme = 'light';
if ([...scenario.options].some(option => option.value === initial.get('scene'))) scenario.value = initial.get('scene');
function draw() {
  frame.style.width = device === 'mobile' ? '390px' : 'clamp(780px, 100%, 1080px)';
  const preset = scenario.value.startsWith('preset-');
  const url = new URL(preset ? 'preset.html' : 'editor.html', location.href);
  if (preset) {
    url.searchParams.set('view', device === 'mobile' ? 'mobile-editor' : 'preset-editor');
    url.searchParams.set('preset', 'synthetic-preset');
    url.searchParams.set('section', scenario.value.slice('preset-'.length));
  } else url.searchParams.set('preview', scenario.value);
  url.searchParams.set('theme', theme);
  if (device === 'mobile') url.searchParams.set('mobile', '');
  frame.src = url;
  viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
}
for (const button of document.querySelectorAll('[data-device]')) button.onclick = () => {
  device = button.dataset.device;
  for (const option of document.querySelectorAll('[data-device]')) option.setAttribute('aria-pressed', option === button);
  draw();
};
scenario.onchange = draw;
document.getElementById('theme').onclick = event => { theme = theme === 'light' ? 'dark' : 'light'; event.target.setAttribute('aria-pressed', theme === 'dark'); draw(); };
for (const option of document.querySelectorAll('[data-device]')) option.setAttribute('aria-pressed', option.dataset.device === device);
draw();
</script></html>`);
const server = await preview.serve({ host: '127.0.0.1', port: 4327, servedir: output });
console.log(`Preview: http://127.0.0.1:${server.port}/`);
