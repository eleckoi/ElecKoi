import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');

it('aligns mobile collection headers, shared collapsible rails and expanded matching controls',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-mobile-editor-'));
  try{
    await build({entryPoints:['apps/web/tests/browser/preset-editor.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'esm',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},loader:{'.png':'dataurl','.svg':'dataurl','.woff2':'file','.woff':'file','.ttf':'file'},logLevel:'silent',plugins:[{name:'inline-css',setup(builder){
      builder.onResolve({filter:/\.css\?inline$/},args=>({path:resolve(dirname(args.importer),args.path.replace(/\?inline$/,'')),namespace:'inline-css'}));
      builder.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({loader:'text',contents:(await build({stdin:{contents:await readFile(args.path,'utf8'),loader:'css',resolveDir:dirname(args.path)},bundle:true,write:false,logLevel:'silent'})).outputFiles[0].text}));
    }}]});
    await writeFile(resolve(directory,'theme.css'),browserThemeCss());
    await writeFile(resolve(directory,'fixture.html'),'<html><head><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"></head><body><div id="root" style="height:100vh"></div><script type="module" src="fixture.js"></script></body></html>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    let failure;
    try{await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/mobile-editor-polish.probe.cjs'),resolve(directory,'fixture.html'),resolve(directory,'report.json')],{env,timeout:150000,windowsHide:true,maxBuffer:1024*1024});}catch(error){failure=error;}
    const report=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));const evidence=resolve('build/mobile-editor-polish-check');await mkdir(evidence,{recursive:true});await copyFile(resolve(directory,'report.json'),resolve(evidence,'browser.json'));
    expect(report.passed,report.failure||failure?.message).toBe(true);expect(report.layouts).toHaveLength(6);
  }finally{await rm(directory,{recursive:true,force:true});}
},180000);
