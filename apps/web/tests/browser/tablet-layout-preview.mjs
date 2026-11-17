import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url);
const { context } = createRequire(require.resolve('vite/package.json'))('esbuild');
async function dockkitSource() {
  const version = require('@deepseek-ai/dsh-client-ui-sidebar-right/package.json').version;
  const directory = resolve(`build/tablet-layout-check/support/dockkit-${version}`);
  const source = resolve(directory, 'package/src/index.ts');
  try { await readFile(source); return source; } catch {}
  const metadata = await (await fetch(`https://registry.npmjs.org/@deepseek-ai%2fdsh-client-ui-dockkit/${version}`)).json();
  const bytes = Buffer.from(await (await fetch(metadata.dist.tarball)).arrayBuffer());
  if (metadata.dist.integrity !== `sha512-${createHash('sha512').update(bytes).digest('base64')}`) throw Error('Pinned dockkit integrity mismatch');
  await mkdir(directory, { recursive: true });
  const archive = resolve(directory, 'dockkit.tgz'); await writeFile(archive, bytes);
  await promisify(execFile)('tar', ['-xzf', archive, '-C', directory], { windowsHide: true });
  return source;
}

export async function buildTabletPreview({ watch = false } = {}) {
  const outdir = resolve('build/tablet-layout-check/preview');
  await mkdir(outdir, { recursive: true });
  const model = resolve('apps/web/tests/browser/tablet-layout-model.fixture.jsx');
  const dockkit = await dockkitSource();
  const composerSource = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-conversation/client'), 'utf8');
  const chatSource = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-chat/client'), 'utf8');
  for (const source of [composerSource, chatSource]) if (source.split('return module.exports').length !== 2) throw Error('Locked DSH Client factory changed');
  const ctx = await context({ entryPoints: ['apps/web/tests/browser/tablet-layout.fixture.jsx'], outfile: resolve(outdir, 'fixture.js'), bundle: true,
    format: 'esm', jsx: 'automatic', jsxImportSource: 'eleckoi-native-jsx', alias: { '@shared': resolve('packages/shared/src'),
      '@deepseek-ai/dsh-client-ui-dockkit': dockkit,
      clsx: createRequire(require.resolve('@deepseek-ai/dsh-client-ui-primitives/package.json')).resolve('clsx') },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.DSH_CLIENT_TITLE': '"ElecKoi"',
      'process.env.DSH_CLIENT_VERSION': 'undefined', 'process.env.DSH_CLIENT_COMMIT_HASH': 'undefined', 'process.env.DSH_CLIENT_GIT_DIRTY': '"false"' },
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'warning',
    plugins: [{ name: 'synthetic-data', setup(builder) {
      builder.onResolve({ filter: /^official-tablet-conversation$/ }, () => ({ path: 'conversation', namespace: 'tablet-native' }));
      builder.onLoad({ filter: /.*/, namespace: 'tablet-native' }, () => ({ resolveDir: process.cwd(), contents: `
        import * as React from 'react'; import * as jsxRuntime from 'react/jsx-runtime'; import * as ReactDOM from 'react-dom';
        import * as virtual from '@tanstack/react-virtual'; import * as store from '@deepseek-ai/dsh-client-store';
        import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'; import * as slots from '@deepseek-ai/dsh-client-ui-slots';
        import * as Cordis from '@deepseek-ai/cordis'; import * as zod from 'zod';
        const modules = {react:React,'react/jsx-runtime':jsxRuntime,'react-dom':ReactDOM,'@tanstack/react-virtual':virtual,
          '@deepseek-ai/dsh-client-store':store,'@deepseek-ai/dsh-client-ui-primitives':primitives,'@deepseek-ai/dsh-client-ui-slots':slots,'@deepseek-ai/cordis':Cordis,zod};
        const load = Object.assign(name => { if (!(name in modules)) throw Error(name); return modules[name]; }, {asset:name=>name});
        const composer = (() => {let registration; const captureModule=value=>{registration=value;};
          ${composerSource.replace('window.__ModuleLoader__.load(', 'captureModule(').replace('return module.exports', 'return {InputBar,DraftEditorRuntime,registerPlainText:O$1,conversationZh:zh};')}
          return registration.factory(load);})();
        export const {InputBar,DraftEditorRuntime,registerPlainText,conversationZh}=composer;
        const chat = (() => {let registration;const captureModule=value=>{registration=value;};
          ${chatSource.replace('window.__ModuleLoader__.load(', 'captureModule(').replace('return module.exports', 'return {ChatView,ChatFlow};')}
          return registration.factory(load);})();
        export function ChatView(props) {return React.createElement(chat.ChatView,{...props,renderSlot:(name,owner,options)=>name!=='conversation.chat.flow'
          ?props.renderSlot(name,owner,options):React.createElement('div',{'data-slot':name,style:{display:'contents'}},React.createElement(chat.ChatFlow,{
            ...props,...owner,useChatNodeBottom:()=>false,useGroupAction:()=>React.useRef(null),useGroupHeaderAction(){},renderFactorySlot:()=>null}))});}
      ` }));
      builder.onResolve({ filter: /use(ChatClient|WindowAppearance)\.js$/ }, () => ({ path: model }));
      builder.onResolve({ filter: /^eleckoi-native-jsx\/jsx-runtime$/ }, () => ({ path: 'runtime', namespace: 'native-jsx' }));
      builder.onLoad({ filter: /.*/, namespace: 'native-jsx' }, () => ({ loader: 'js', resolveDir: process.cwd(), contents:
        `import {jsx as a,jsxs as b,Fragment} from ${JSON.stringify(require.resolve('react/jsx-runtime'))};const bind=f=>(t,p,k)=>f(t,typeof t==='string'&&p?.inert===''?{...p,inert:true}:p,k);export const jsx=bind(a),jsxs=bind(b);export{Fragment};` }));
    } }],
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ElecKoi 平板布局预览</title><style>${browserThemeCss()}\nhtml,body,#root{height:100%;margin:0}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>`;
  await writeFile(resolve(outdir, 'fixture.html'), html);
  await writeFile(resolve(outdir, 'index.html'), await readFile(new URL('./tablet-preview-frame.html', import.meta.url), 'utf8'));
  if (watch) await ctx.watch(); else { await ctx.rebuild(); await ctx.dispose(); }
  return { ctx, outdir };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ctx, outdir } = await buildTabletPreview({ watch: true });
  const server = await ctx.serve({ host: '127.0.0.1', port: 4318, servedir: outdir });
  console.log(`Preview: http://127.0.0.1:${server.port}`);
}
