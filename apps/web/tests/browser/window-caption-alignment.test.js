import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('separates the brand from caption controls and keeps the same menu when collapsing', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-caption-layout-'));
  try {
    await build({entryPoints:['apps/web/tests/browser/window-caption.fixture.jsx'],outfile:resolve(directory,'fixture.js'),
      bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},
      loader:{'.woff2':'file','.woff':'file','.ttf':'file','.png':'file'},logLevel:'silent'});
    await build({stdin:{contents:'import { installWindowsMenu } from "./apps/desktop/src/preload/windowsMenu.ts"; installWindowsMenu();',resolveDir:process.cwd()},
      outfile:resolve(directory,'caption-menu.js'),bundle:true,format:'iife',alias:{'@shared':resolve('packages/shared/src')},logLevel:'silent',
      plugins:[{name:'caption-menu-host',setup(builder){
        builder.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'caption-menu-host'}));
        builder.onLoad({filter:/.*/,namespace:'caption-menu-host'},()=>({contents:'export const ipcRenderer = { invoke: async () => {} };',loader:'js'}));
      }}]});
    const htmlPath=resolve(directory,'fixture.html'),reportPath=resolve(directory,'report.json');
    await writeFile(htmlPath,`<!doctype html><html><head><meta charset="utf-8"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script><script src="caption-menu.js"></script></body></html>`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/window-caption.probe.cjs'),htmlPath,reportPath],
      {env,timeout:45000,windowsHide:true});
    const reports=JSON.parse(await readFile(reportPath,'utf8'));
    expect(reports).toHaveLength(6);
    for (const report of reports) {
      const detail=JSON.stringify(report);
      expect(report.windowCenters,detail).toHaveLength(3);
      expect(report.captionHeight,detail).toBe(40);
      for (const center of [report.toggleCenter,report.menuCenter,...report.windowCenters]) {
        expect(Math.abs(center-report.captionHeight/2),detail).toBeLessThan(0.1);
      }
      expect(Math.abs(report.markTop-report.markLeft),detail).toBeLessThan(0.1);
      expect(report.navCenters,detail).toHaveLength(8);
      const centers = [report.markCenter, ...report.navCenters];
      for (let index = 1; index < centers.length; index++) {
        expect(centers[index]-centers[index-1], detail).toBeCloseTo(report.navStep, 1);
      }
      expect(report.brandTop,detail).toBeGreaterThanOrEqual(report.captionHeight);
      expect(report.listTop,detail).toBeGreaterThanOrEqual(report.brandBottom);
      expect(report.searchGap,detail).toBeCloseTo(15, 1);
      expect(report.extraBrandImages,detail).toBe(0);
      expect(report.menuLeft,detail).toBeGreaterThanOrEqual(report.toggleRight);
      expect(report.menuCount,detail).toBe(1);
      expect(report.roundtrip,detail).toBe(true);
      expect(report.settings,detail).toEqual({ brandHidden:true,listTop:40,menuCount:1 });
      if (report.transitions) {
        expect(report.moreClosed,detail).toBe(true);
        expect(report.transitions,detail).toHaveLength(8);
        for (const transition of report.transitions) {
          const context=JSON.stringify({theme:report.theme,...transition});
          expect(transition.mid.opacity,context).toBeGreaterThan(0);
          expect(transition.mid.opacity,context).toBeLessThan(1);
          expect(transition.mid.durations,context).toContain(160);
          expect(transition.end.active,context).toBe(true);
          expect(transition.end.opacity,context).toBe(1);
          expect(transition.end.baseOpacity,context).toBe(0);
          if (['presets','plugins'].includes(transition.target)) expect(transition.end.fills,context).toBe(0);
          else expect(transition.end.fills,context).toBeGreaterThan(0);
          if (transition.target==='settings') expect(transition.end.mask,context).not.toBe('none');
        }
      }
      expect(Math.abs(report.mainTop-report.captionHeight),detail).toBeLessThan(0.1);
      if (report.rightbar) {
        expect(report.rightbarTop,detail).toBeCloseTo(report.mainTop,1);
        expect(report.resizeTop,detail).toBeCloseTo(report.mainTop,1);
        expect(report.stripTop+report.stripHeight,detail).toBeCloseTo(0,1);
        expect(report.stripHeight,detail).toBeCloseTo(report.captionHeight,1);
      }
    }
  } finally {
    await rm(directory,{recursive:true,force:true,maxRetries:3});
  }
},60000);
