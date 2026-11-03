import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild');
it('keeps native controls aligned, separates file panes, and virtualizes large packages in both themes',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-package-browser-'));
  try {
    await build({entryPoints:['apps/web/tests/browser/character-frontend-packages.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',
      alias:{'@shared':resolve('packages/shared/src'),'@eleckoi/author-sdk':resolve('packages/sdk/author/src/index.ts')},
      loader:{'.woff2':'file','.woff':'file','.ttf':'file','.png':'file'},logLevel:'silent',plugins:[{name:'inline-css',setup(builder){
        builder.onResolve({filter:/\.css\?inline$/},args=>({path:resolve(dirname(args.importer),args.path.replace(/\?inline$/,'')),namespace:'inline-css'}));
        builder.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({loader:'text',contents:(await build({stdin:{contents:await readFile(args.path,'utf8'),loader:'css',resolveDir:dirname(args.path)},bundle:true,write:false,logLevel:'silent'})).outputFiles[0].text}));
      }}]});
    await writeFile(resolve(directory,'theme.css'),browserThemeCss());
    const html=resolve(directory,'fixture.html'),report=resolve(directory,'report.json');
    await writeFile(html,'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"><style>html,body,#root{margin:0;height:100%;min-width:0}#root{box-sizing:border-box;display:flex;height:100dvh;padding:8px;background:var(--dsw-alias-bg-layer-1)}.character-frontend-editor{min-height:0!important}</style><div id="root"></div><script src="fixture.js"></script></html>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/character-frontend-packages.probe.cjs'),html,report],{env,windowsHide:true,timeout:60000});
    const result=JSON.parse(await readFile(report,'utf8'));
    expect(result.layouts).toHaveLength(20);
    for(const row of result.layouts){
      const detail=JSON.stringify(row);
      expect(row.overlap,detail).toBe(false);expect(row.overflow,detail).toBe(false);
      expect(row.indicatorDrift,detail).toBeLessThan(1);expect(row.labelDrift,detail).toBeLessThan(1);
      expect(row.tabHeight,detail).toBe(row.importHeight);
      expect(row.divider,detail).toBe(true);expect(row.join,detail).toBe(true);
      expect(row.rendered,detail).toBeLessThan(80);expect(row.rendered,detail).toBeGreaterThan(0);
      expect(row.copy,detail).toBe(false);expect(row.redundant,detail).toBe(false);
    }
    expect(result.mobileReading).toBe(true);expect(result.lastFile).toBe(true);expect(result.menu).toBe(true);expect(result.emptyImports).toBe(1);
  }finally{
    const path=relative(tmpdir(),directory);if(!path||path.startsWith('..')||isAbsolute(path))throw Error('Unexpected fixture path');
    await rm(directory,{recursive:true,force:true,maxRetries:3});
  }
},70000);
