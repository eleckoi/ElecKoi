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
    for(const file of ['light.png','dark.png','light-desktop.png','dark-desktop.png','report.json'])await copyFile(resolve(directory,file),resolve(evidence,'menu-'+file));
    expect(result.errors).toEqual([]);expect(result.layouts).toHaveLength(6);
    for(const layout of result.layouts){const detail=JSON.stringify(layout);
      expect(layout.left,detail).toBeGreaterThanOrEqual(11.5);expect(layout.right,detail).toBeLessThanOrEqual(layout.width-11.5);
      expect(layout.top,detail).toBeGreaterThanOrEqual(11.5);expect(layout.bottom,detail).toBeLessThanOrEqual(layout.height-11.5);
      expect(layout.scrollWidth,detail).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.panelWidth,detail).toBeLessThanOrEqual(288);
      expect(layout.panelHeight,detail).toBeLessThanOrEqual(480);
      expect(layout.inputHeights,detail).toEqual([34,34,34,34,34]);
      expect(layout.coarse,detail).toBe(layout.width<768);
      expect(layout.inputFonts,detail).toEqual(Array(5).fill(layout.menuFont));
      expect(layout.fields,detail).toEqual(['temperature','top-p','context','compaction','output']);
      expect(layout.footer,detail).toBe(true);expect(layout.material,detail).toBe('translucent');expect(layout.icons,detail).toBe(0);
      expect(layout.actions.map(action=>action.text),detail).toEqual(['取消','保存']);
      expect(layout.actions.map(action=>action.height),detail).toEqual([36,36]);
      expect(layout.actions.every(action=>action.visible),detail).toBe(true);
      expect(layout.actions[1].background,detail).not.toBe(layout.actions[0].background);
      expect(layout.writesBeforeSave,detail).toBe(0);
    }
    expect(result.providerIcons).toEqual({headings:1,models:0});
    expect(result.triggers).toHaveLength(6);
    for(const trigger of result.triggers){const detail=JSON.stringify(trigger);
      expect(trigger.icons,detail).toBe(1);expect(trigger.iconWidth,detail).toBe(16);expect(trigger.iconHeight,detail).toBe(16);
      expect(trigger.buttonHeight,detail).toBe(28);expect(trigger.overflow,detail).toBe(false);
      if(trigger.width<768)expect(trigger.condensed,detail).toEqual({brandWidth:0,nativeIconWidth:16});
    }
    expect(result.calls).toContainEqual({selection:{provider:'synthetic-config',model:'synthetic-24'}});
    expect(result.calls.filter(call=>call.parameters)).toEqual([{parameters:{provider:'synthetic-config',model:'synthetic-24',patch:{temperature:.72}}}]);
    expect(result.writesAfterClose).toBe(0);expect(result.restoredDraft).toBe('0.72');expect(result.savedValue).toBe('0.72');
    expect(result.expandedActionsVisible).toBe(true);
  } finally {const target=relative(tmpdir(),directory);if(!target||target.startsWith('..')||isAbsolute(target))throw Error('Invalid probe cleanup target');await rm(directory,{recursive:true,force:true,maxRetries:3});}
},60000);
