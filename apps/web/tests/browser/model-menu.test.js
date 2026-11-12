import {execFile} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {isAbsolute,relative,resolve} from 'node:path';
import {promisify} from 'node:util';
import {expect,it} from 'vitest';
import {browserThemeCss} from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild');
it('extends the installed official menu with readable parameters and provider-heading icons across phone and desktop widths',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-model-menu-'));
  try {
    await build({entryPoints:['apps/web/tests/browser/model-menu.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.png':'file','.svg':'file'},logLevel:'silent'});
    const source=await readFile(require.resolve('@deepseek-ai/dsh-client-ui-model-selection/client'),'utf8');
    await writeFile(resolve(directory,'official.js'),source.replace('return module.exports;','return {...module.exports,ModelSelect,zh};'));
    await writeFile(resolve(directory,'theme.css'),browserThemeCss());
    const html=resolve(directory,'fixture.html'),report=resolve(directory,'report.json');
    await writeFile(html,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script><script src="official.js"></script></body></html>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/model-menu.probe.cjs'),html,report],{env,windowsHide:true,timeout:45000});
    const result=JSON.parse(await readFile(report,'utf8'));
    const evidence=resolve('build/parameter-tool-font-check');await mkdir(evidence,{recursive:true});
    await copyFile(report,resolve(evidence,'session-menu-report.json'));
    expect(result.passed, result.failure).toBe(true);expect(result.errors).toEqual([]);expect(result.layouts).toHaveLength(6);
    expect(result.calls.filter(call=>call.parameters)).toEqual([{parameters:{sessionId:'synthetic-session',provider:'synthetic-config',model:'claude-opus-4-6',patch:{temperature:.63},revision:0}}]);
    for(const layout of result.layouts)expect(layout.fields).toEqual(['temperature','top-p','context','compaction','output']);
  } finally {const target=relative(tmpdir(),directory);if(!target||target.startsWith('..')||isAbsolute(target))throw Error('Invalid probe cleanup target');await rm(directory,{recursive:true,force:true,maxRetries:3});}
},60000);
