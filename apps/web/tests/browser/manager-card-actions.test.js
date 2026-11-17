import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('keeps hovered preset borders visible and character actions accessible in both themes and window sizes', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-manager-actions-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/manager-card-actions.fixture.jsx'], outfile: resolve(directory,'fixture.js'), bundle:true,
      format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},loader:{'.png':'dataurl','.svg':'dataurl','.woff2':'file','.woff':'file','.ttf':'file'},logLevel:'silent' });
    const htmlPath=resolve(directory,'fixture.html'), reportPath=resolve(directory,'report.json');
    await writeFile(htmlPath,'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root" style="height:100vh"></div><script src="fixture.js"></script></body></html>');
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/manager-card-actions.probe.cjs'),htmlPath,reportPath],{env,timeout:30000,windowsHide:true});
    const reports=JSON.parse(await readFile(reportPath,'utf8'));
    expect(reports).toHaveLength(4);
    for(const report of reports){
      expect(report.preset.borderInside,JSON.stringify(report)).toBe(true);expect(report.preset.selected).toBe(true);
      if(report.width===900)expect(report.preset.scrollable).toBe(true);expect(report.lastVisible).toBe(true);
      expect(report.singleClick).toBe(true);expect(report.copied).toBe(true);
      expect(report.menu.inside,JSON.stringify(report)).toBe(true);expect(report.menu.reachable).toBe(true);
      expect(report.menu.labels).toEqual(['编辑角色卡','复制角色卡']);expect(report.menu.lastGroup).toBe('合成分组 17');expect(report.menu.scrollable).toBe(true);
    }
    await mkdir(resolve('output/playwright'),{recursive:true});
    for(const theme of ['light','dark'])for(const name of ['manager-actions','preset-border'])await copyFile(resolve(directory,`${name}-${theme}.png`),resolve('output/playwright',`${name}-${theme}.png`));
  }finally{await rm(directory,{recursive:true,force:true,maxRetries:3});}
},60000);
