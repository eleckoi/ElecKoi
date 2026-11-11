import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');
const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
it('keeps history confirmation text legible and the mobile account row free of a surrounding frame in both themes',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'eleckoi-mobile-theme-'));
 try{
  await build({entryPoints:['apps/web/tests/browser/mobile-theme-controls.fixture.jsx'],outfile:resolve(dir,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},loader:{'.png':'file','.svg':'dataurl','.woff2':'file','.woff':'file','.ttf':'file'},logLevel:'silent'});
  await writeFile(resolve(dir,'fixture.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/mobile-theme-controls.probe.cjs'),resolve(dir,'fixture.html'),resolve(dir,'report.json')],{env,windowsHide:true,timeout:30000});
  const result=JSON.parse(await readFile(resolve(dir,'report.json'),'utf8')),evidence=resolve('build/mobile-theme-controls-check');await mkdir(evidence,{recursive:true});
  for(const file of ['report.json','drawer-light.png','drawer-dark.png','history-light.png','history-dark.png'])await copyFile(resolve(dir,file),resolve(evidence,file));
  expect(result.errors).toEqual([]);expect(result.rows).toHaveLength(6);
  for(const row of result.rows){const detail=JSON.stringify(row);
   if(row.drawer){expect(row.image,detail).toBe('none');expect(row.shadow,detail).toBe('none');expect(row.background,detail).toBe('rgba(0, 0, 0, 0)');expect(row.border,detail).toBe('0px');expect(row.clickable,detail).toBe(true)}
   else{const values=[luminance(row.color),luminance(row.background)].sort((a,b)=>b-a);expect((values[0]+.05)/(values[1]+.05),detail).toBeGreaterThanOrEqual(4.5)}
  }
 }finally{await rm(dir,{recursive:true,force:true,maxRetries:3})}
},40000);
