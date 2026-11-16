import { execFile } from 'node:child_process';
import { mkdir,mkdtemp,readFile,writeFile,readdir,copyFile,rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve,dirname,relative,isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { expect,it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');
it('matches the unchanged regex switch and keeps asset action labels visible in both themes',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-editor-toggles-'));
  try{
    await build({entryPoints:['apps/web/tests/browser/mobile-editor-layout.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.svg':'dataurl','.png':'dataurl'},logLevel:'silent',plugins:[{name:'inline-css',setup(builder){
      builder.onResolve({filter:/\.css\?inline$/},args=>({path:resolve(dirname(args.importer),args.path.replace(/\?inline$/,'')),namespace:'inline-css'}));
      builder.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({loader:'text',contents:(await build({stdin:{contents:await readFile(args.path,'utf8'),loader:'css',resolveDir:dirname(args.path)},bundle:true,write:false,logLevel:'silent'})).outputFiles[0].text}));
    }}]});
    await writeFile(resolve(directory,'fixture.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let failure;
    try{await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/editor-toggle-unification.probe.cjs'),resolve(directory,'fixture.html'),resolve(directory,'report.json')],{env,timeout:45000,windowsHide:true});}catch(e){failure=e;}
    const report=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8')),evidence=resolve('build/editor-toggle-unification-check');await mkdir(evidence,{recursive:true});
    for(const file of await readdir(directory))if(/\.png$/.test(file)||file==='report.json')await copyFile(resolve(directory,file),resolve(evidence,file));
    expect(failure,JSON.stringify(report)).toBeUndefined();expect(report.errors).toEqual([]);expect(report.cases).toHaveLength(32);expect(report.assets).toHaveLength(6);
    for(const row of report.cases)for(const checked of [true,false]){
      if(row.kind!=='tools')expect(row.icons.colors.length,JSON.stringify(row)).toBeGreaterThan(0);
      expect(row.states[checked].track,JSON.stringify(row)).toEqual(row.reference[checked].track);
      expect(row.states[checked].thumb,JSON.stringify(row)).toEqual(row.reference[checked].thumb);
      if(row.width<600)expect(row.states[checked].detailOpen,JSON.stringify(row)).toBe(false);
      for(const color of row.icons.colors)expect([row.icons.primary,row.icons.secondary],JSON.stringify(row)).toContain(color);
    }
    for(const row of report.assets){
      expect(row.buttons[0].color,JSON.stringify(row)).toBe(row.referenceColor);
      for(const button of row.buttons){expect(button.color).not.toBe(button.background);expect(button.height).toBeGreaterThanOrEqual(38);}
      expect(row.overflow,JSON.stringify(row)).toBe(false);expect(row.folder).toBe('newFolder');expect(row.upload).toBe('upload');
    }
  }finally{const path=relative(tmpdir(),directory);if(!path||path.startsWith('..')||isAbsolute(path))throw Error('Unexpected fixture cleanup path');await rm(directory,{recursive:true,force:true,maxRetries:3});}
},60000);
