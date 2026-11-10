import {execFile} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {expect,it} from 'vitest';
import {browserThemeCss} from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');

it('keeps the official plugin header compact on mobile through toggles, style refresh and remount, retaining native scrolling and desktop layout',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-mobile-plugins-'));
 try{
  await build({entryPoints:['apps/web/tests/browser/mobile-plugin-header.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},loader:{'.png':'file','.svg':'dataurl','.woff2':'file','.woff':'file','.ttf':'file'},logLevel:'silent'});
  const source=await readFile(require.resolve('@deepseek-ai/dsh-client-ui-plugin-manager/client'),'utf8');
  await writeFile(resolve(directory,'official.js'),source.replace('return module.exports;','return {...module.exports,PluginManagerPage,createPluginHeaderRef,IDLE_INSTALL,zh};'));
  const html=resolve(directory,'fixture.html'),report=resolve(directory,'report.json');
  await writeFile(html,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script><script src="official.js"></script></body></html>`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/mobile-plugin-header.probe.cjs'),html,report],{env,windowsHide:true,timeout:45000});
  const result=JSON.parse(await readFile(report,'utf8'));
  const evidence=resolve('build/mobile-plugin-scroll-check');await mkdir(evidence,{recursive:true});
  for(const file of ['report.json','scroll-light-390.png','scroll-dark-390.png'])await copyFile(resolve(directory,file),resolve(evidence,file));
  expect(result.errors).toEqual([]);expect(result.rows).toHaveLength(48);expect(result.scrolling).toHaveLength(96);
  for(const row of result.scrolling){const detail=JSON.stringify(row);expect(row.partiallyClipped,detail).toBe(false);expect(row.visible,detail).toBe(row.scrollTop===0)}
  for(const row of result.rows){const detail=JSON.stringify(row);
   if(row.phase==='scrolled'){expect(row.compact,detail).toBe(true);expect(row.introInert,detail).toBe(true);continue}
   expect(row.titleVisible,detail).toBe(false);expect(row.barTop,detail).toBeCloseTo(row.outer,0);
   expect(row.rest,detail).toBeLessThanOrEqual(row.tabs?80:40);expect(row.left,detail).toBeGreaterThanOrEqual(15);
   expect(row.toolbarRight,detail).toBeLessThanOrEqual(row.width-15);expect(row.overlap,detail).toBe(false);expect(row.overflow,detail).toBe(false);
   expect(row.enabled,detail).toBe(row.phase==='initial'?'false':'true');
  }
  expect(result.desktop.titleVisible).toBe(true);expect(result.desktop.rest).toBeGreaterThanOrEqual(70);
 }finally{await rm(directory,{recursive:true,force:true,maxRetries:3})}
},60000);
