import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {isAbsolute,relative,resolve} from 'node:path';
import {promisify} from 'node:util';
import {expect,it} from 'vitest';
import {browserThemeCss} from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild');

it('anchors the compact model editor in both themes and preserves its single save boundary',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-model-picker-'));
  try{
    await build({entryPoints:['apps/web/tests/browser/model-picker.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.png':'file','.svg':'file'},logLevel:'silent'});
    await writeFile(resolve(directory,'theme.css'),browserThemeCss());
    const html=resolve(directory,'fixture.html'),report=resolve(directory,'report.json');
    await writeFile(html,'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/model-picker.probe.cjs'),html,report],{env,windowsHide:true,timeout:45000});
    const result=JSON.parse(await readFile(report,'utf8'));
    expect(result.layouts).toHaveLength(12);
    for(const layout of result.layouts){
      const detail=JSON.stringify(layout);
      expect(layout.left,detail).toBeGreaterThanOrEqual(11.5);
      expect(layout.right,detail).toBeLessThanOrEqual(layout.width-11.5);
      expect(layout.top,detail).toBeGreaterThanOrEqual(11.5);
      expect(layout.bottom,detail).toBeLessThanOrEqual(layout.height-11.5);
      expect(layout.backdrops).toBe(0);expect(layout.radius).toBe('18px');
      expect(layout.surface,detail).toBe('rgba(0, 0, 0, 0)');
      expect(layout.material,detail).toBe('translucent');
      expect(layout.materialFill,detail).toBe(layout.theme==='light'?'rgba(252, 253, 254, 0.7)':'rgba(48, 49, 54, 0.64)');
      expect(layout.materialFilter,detail).not.toBe('none');
      expect(layout.scrollWidth,detail).toBe('5px');expect(layout.scrollRadius,detail).toBe('999px');expect(layout.standardScrollWidth,detail).toBe('auto');
      expect(layout.duplicateCapabilityTitle).toBe(false);
      if(layout.width===1000){expect(layout.panelWidth).toBe(456);expect(Math.abs(layout.right-layout.anchorRight),detail).toBeLessThan(.5);expect(Math.abs(layout.bottom+12-layout.anchorTop),detail).toBeLessThan(.5);}
      if(layout.tab==='models'){expect(layout.groupIcons).toBe(2);expect(layout.rowIcons).toBe(0);expect(layout.footerGap,detail).toBeLessThanOrEqual(9);}
      else {expect(layout.fieldOrder).toEqual(['reasoning','temperature','context','compaction','output','top-p']);expect(layout.fieldBorders).toEqual(Array(6).fill('0px'));expect(layout.fieldSurface,detail).toBe(layout.theme==='light'?'rgb(255, 255, 255)':'rgb(25, 26, 29)');expect(layout.checkboxRadius).toBe('4px');expect(layout.checkboxInk).toBe('rgb(255, 255, 255)');expect(layout.checkboxFill).not.toBe('rgb(0, 0, 0)');}
    }
    expect(result.guarded).toBe(true);
    expect(result.calls).toContainEqual({selection:{capability:'chat',configId:'synthetic-official',model:'synthetic-pro'}});
    expect(result.calls.find(call=>call.save)?.save.model_options.find(model=>model.id==='synthetic-pro').temperature).toBe(.72);
  }finally{const target=relative(tmpdir(),directory);if(!target||target.startsWith('..')||isAbsolute(target))throw Error('Invalid probe cleanup target');await rm(directory,{recursive:true,force:true,maxRetries:3});}
},60000);
