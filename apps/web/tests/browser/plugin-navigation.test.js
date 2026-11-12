import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');

it('transfers an editor link through isolated preload and Main to the existing main renderer',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-plugin-navigation-'));
  try{
    const alias={'@shared':resolve('packages/shared/src')},external=['electron'];
    await build({entryPoints:['apps/desktop/src/main/platform/electron/mainPluginNavigation.ts'],outfile:resolve(directory,'main.cjs'),bundle:true,platform:'node',format:'cjs',alias,external,logLevel:'silent'});
    await build({stdin:{contents:'import {contextBridge} from "electron";import {createDesktopPluginNavigation} from "./apps/desktop/src/preload/pluginNavigation.ts";contextBridge.exposeInMainWorld("dshDesktop",{plugins:createDesktopPluginNavigation()});',resolveDir:process.cwd()},outfile:resolve(directory,'preload.cjs'),bundle:true,platform:'node',format:'cjs',alias,external,logLevel:'silent'});
    await build({entryPoints:['apps/web/src/app/services/pluginNavigation.js'],outfile:resolve(directory,'navigation.js'),bundle:true,format:'esm',alias,logLevel:'silent'});
    await writeFile(resolve(directory,'fixture.html'),'<html><body><textarea>保留完整编辑草稿</textarea><div id="config"></div><script type="module">import {installMainPluginNavigation} from "./navigation.js";window.openCount=0;window.failNavigation=false;window.addEventListener("eleckoi:dsh-plugins:select",event=>{if(window.failNavigation){event.detail.error="合成配置未就绪";return;}window.openCount++;document.getElementById("config").textContent=event.detail.id;event.detail.opened=true;});window.disposeNavigation=installMainPluginNavigation();window.ready=true;</script></body></html>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/plugin-navigation.probe.cjs'),directory],{env,windowsHide:true,timeout:30000,maxBuffer:1024*1024});
    const report=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));
    await mkdir('build/preset-tools-polish-check',{recursive:true});await copyFile(resolve(directory,'report.json'),'build/preset-tools-polish-check/native-navigation.json');
    expect(report.failure).toBeUndefined();expect(report.errors).toEqual([]);expect(report.mainConfig).toBe('web-search');expect(report.childConfig).toBe('');expect(report.childDraft).toBe('保留完整编辑草稿');expect(report.openCount).toBe(2);expect(report.retryError.message).toBe('合成配置未就绪');expect(report.retryError.code).toBe(ELECKOI_FAILURE_CODES.lifecycleNotReady);expect(report.activationRequests).toBe(3);
  }finally{await rm(directory,{recursive:true,force:true,maxRetries:3});}
},45000);
