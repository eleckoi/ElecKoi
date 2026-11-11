import {execFile} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {expect,it} from 'vitest';
import {browserThemeCss} from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');

it('uses the official mobile plugin header through scrolling, reentry and late styles, retaining native desktop collapse',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-mobile-plugins-'));
 try{
  await build({entryPoints:['apps/web/tests/browser/mobile-plugin-header.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},loader:{'.png':'file','.svg':'dataurl','.woff2':'file','.woff':'file','.ttf':'file'},logLevel:'silent'});
  const source=await readFile(require.resolve('@deepseek-ai/dsh-client-ui-plugin-manager/client'),'utf8');
  await writeFile(resolve(directory,'official.js'),source.replace('return module.exports;','return {...module.exports,PluginManagerPage,createPluginHeaderRef,IDLE_INSTALL,zh};'));
  const html=resolve(directory,'fixture.html'),report=resolve(directory,'report.json');
  await writeFile(html,`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script><script src="official.js"></script></body></html>`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/mobile-plugin-header.probe.cjs'),html,report],{env,windowsHide:true,timeout:85000});
  const result=JSON.parse(await readFile(report,'utf8'));
  const evidence=resolve('build/mobile-plugin-header-recovery-check');await mkdir(evidence,{recursive:true});
  for(const file of ['report.json','rest-light-390.png','rest-dark-390.png','scroll-light-390.png','scroll-dark-390.png'])await copyFile(resolve(directory,file),resolve(evidence,file));
  expect(result.errors).toEqual([]);expect(result.rows).toHaveLength(168);expect(result.scrolling).toHaveLength(240);
  for(const [name,list] of [['rest',result.rows],['scroll',result.scrolling]]){
   const reference=list.filter(row=>row.reference),actual=list.filter(row=>!row.reference);
   for(const [index,row] of actual.entries()){const detail=JSON.stringify(row),native=reference[index];
    expect(row.outer,detail).toBe(false);expect(row.titleVisible,detail).toBe(true);
    expect(row.buttons,detail).toHaveLength(3);for(const button of row.buttons){expect(button.visible,detail).toBe(true);expect(button.clickable,detail).toBe(true)}
    expect(row.overflow,detail).toBe(false);expect(row.toolbarRight,detail).toBeLessThanOrEqual(row.width-19);
    for(const key of ['barTop','barHeight','headHeight','firstTop','left','toolbarRight','textTop','textBottom','clip','rest'])expect(row[key],name+' '+key+' '+detail).toBeCloseTo(native[key],0);
    expect(row.visible,detail).toBe(native.visible);expect(row.introInert,detail).toBe(native.introInert);
    if(row.scrollTop===0){expect(row.fullyVisible,detail).toBe(true);expect(row.introInert,detail).toBe(false);expect(row.overlap,detail).toBe(false)}
    if(name==='rest'){
     const initial=actual.find(item=>item.phase==='initial'&&item.width===row.width&&item.dark===row.dark&&item.tabs===row.tabs);
     for(const key of ['barHeight','headHeight','left','toolbarRight','textTop','textBottom','rest'])expect(row[key],'restored '+key+' '+detail).toBeCloseTo(initial[key],0);
    }
    expect(row.enabled,detail).toBe(row.phase==='initial'?'false':'true');
   }
  }
  expect(result.desktop.titleVisible).toBe(true);expect(result.desktop.rest).toBeGreaterThanOrEqual(70);
  expect(result.desktopScrolled.introInert).toBe(true);expect(result.desktopScrolled.clip).toBe(100);
 }finally{await rm(directory,{recursive:true,force:true,maxRetries:3})}
},90000);
