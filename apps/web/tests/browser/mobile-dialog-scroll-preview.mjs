import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require=createRequire(import.meta.url),{context}=createRequire(require.resolve('vite/package.json'))('esbuild');
const outdir=resolve('build/mobile-dialog-scroll-check/preview');
await mkdir(outdir,{recursive:true});
const ctx=await context({entryPoints:['apps/web/tests/browser/mobile-dialog-scroll.fixture.jsx'],outfile:resolve(outdir,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',
  alias:{'@shared':resolve('packages/shared/src')},loader:{'.svg':'dataurl','.png':'file','.woff2':'file','.woff':'file','.ttf':'file'},logLevel:'warning'});
await ctx.rebuild();
await writeFile(resolve(outdir,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}html,body,#root{height:100%;margin:0}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
if(process.argv.includes('--serve')){
  const server=await ctx.serve({host:'127.0.0.1',port:4319,servedir:outdir});
  console.log(`Dialog touch fixture: http://127.0.0.1:${server.port}`);
}else await ctx.dispose();
