import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');
it('renders opaque PC and Android variable management with real nested values, history and late association',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-variable-manager-'));
 try{
  await build({entryPoints:['apps/web/tests/browser/variable-manager.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.svg':'dataurl','.png':'dataurl'},logLevel:'warning'});
  await writeFile(resolve(directory,'fixture.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}body{margin:0;font-family:'Segoe UI','Microsoft YaHei',sans-serif}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/variable-manager.probe.cjs'),resolve(directory,'fixture.html'),resolve(directory,'report.json')],{env,windowsHide:true,timeout:60000});
  const result=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));
  const evidence=resolve('build/variable-management-check');await mkdir(evidence,{recursive:true});
  for(const file of ['report.json','light-1440.png','light-390.png','dark-1440.png','dark-390.png','history-light-1440.png','history-light-390.png','history-dark-1440.png','history-dark-390.png'])await copyFile(resolve(directory,file),resolve(evidence,file));
  expect(result.errors).toEqual([]);expect(result.layouts).toHaveLength(10);expect(Object.values(result.actions).every(Boolean)).toBe(true);
 }finally{const target=relative(tmpdir(),directory);if(!target||target.startsWith('..')||isAbsolute(target))throw Error('Invalid fixture cleanup');await rm(directory,{recursive:true,force:true,maxRetries:3});}
},75000);
