import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('slides sidebar tracks natively and keeps interruption, resizing and reduced motion predictable', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-sidebar-motion-'));
  try {
    await build({entryPoints:['apps/web/tests/browser/window-caption.fixture.jsx'],outfile:resolve(directory,'fixture.js'),
      bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},
      loader:{'.woff2':'file','.woff':'file','.ttf':'file','.png':'file'},logLevel:'silent'});
    const htmlPath=resolve(directory,'fixture.html'),reportPath=resolve(directory,'report.json');
    await writeFile(htmlPath,'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/side-panel-motion.probe.cjs'),htmlPath,reportPath],
      {env,timeout:45000,windowsHide:true});
    const report=JSON.parse(await readFile(reportPath,'utf8'));
    expect(report.initial.animations).toEqual([]);
    expect(report.initial.animating).toBe(false);
    for (const mid of [report.collapseMid,report.expandMid]) {
      expect(mid.property).toBe('grid-template-columns');
      expect(mid.duration).toBe('0.3s');
      expect(mid.curve).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
      expect(mid.animations).toEqual([{property:'grid-template-columns',duration:300}]);
      expect(mid.width).toBeGreaterThan(0);
      expect(mid.width).toBeLessThan(280);
      expect(mid.contentWidth).toBeCloseTo(280,1);
    }
    expect(report.reversed.width).toBeGreaterThan(report.collapseMid.width);
    expect(report.reversed.width).toBeLessThan(280);
    for (const end of [report.expanded,report.reopened]) {
      expect(end.width).toBeCloseTo(280,1);
      expect(end.animating).toBe(false);
    }
    expect(report.collapsed.width).toBe(0);
    expect(report.resized.width).toBe(264);
    expect(report.resized.animations).toEqual([]);
    expect(report.resized.animating).toBe(false);
    expect(report.dragStart.animations).toEqual([]);
    expect(report.dragStart.width).toBeCloseTo(report.beforeDrag.width,1);
    expect(report.dragMoved.width).toBeCloseTo(report.beforeDrag.width+20,1);
    expect(report.rightbarMid.rightbarWidth).toBeGreaterThan(0);
    expect(report.rightbarMid.rightbarWidth).toBeLessThan(300);
    expect(report.rightbarOpen.rightbarWidth).toBe(300);
    for (const instant of [report.instant,report.reduced]) {
      expect(instant.animations).toEqual([]);
      expect(instant.duration).toBe('0s');
    }
    expect(report.instant.rightbarWidth).toBe(0);
    expect(report.reduced.width).toBe(0);
  } finally { await rm(directory,{recursive:true,force:true,maxRetries:3}); }
},60000);
