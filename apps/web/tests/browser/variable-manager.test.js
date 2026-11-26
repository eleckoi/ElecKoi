import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');

function luminance(color) {
  const [red, green, blue] = color.match(/[\d.]+/g).slice(0, 3).map(value => {
    const channel = Number(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

it('renders opaque PC and Android variable management with real nested values, history and late association',async()=>{
 const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-variable-manager-'));
 try{
  await build({entryPoints:['apps/web/tests/browser/variable-manager.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',alias:{'@shared':resolve('packages/shared/src')},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.svg':'dataurl','.png':'dataurl'},logLevel:'warning'});
  await writeFile(resolve(directory,'fixture.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}body{margin:0;font-family:'Segoe UI','Microsoft YaHei',sans-serif}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/variable-manager.probe.cjs'),resolve(directory,'fixture.html'),resolve(directory,'report.json')],{env,windowsHide:true,timeout:60000});
  const result=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));
  const evidence=resolve('build/variable-management-check');await mkdir(evidence,{recursive:true});
  for(const file of ['report.json','light-1440.png','light-390.png','dark-1440.png','dark-390.png','history-light-1440.png','history-light-390.png','history-dark-1440.png','history-dark-390.png'])await copyFile(resolve(directory,file),resolve(evidence,file));
  expect(result.errors).toEqual([]);
  expect(result.layouts).toHaveLength(10);
  for (const { width, theme, readability, base, overflow, nested, visibleRows, fonts } of result.layouts) {
    const detail = `${theme} ${width}px`;
    expect(overflow, detail).toBe(false);
    expect(nested, detail).toBe(true);
    expect(visibleRows, detail).toBeGreaterThan(0);
    expect(base, detail).not.toBe('rgba(0, 0, 0, 0)');
    if (width < 768) {
      expect(fonts, detail).toMatchObject({ name: { size: 13 }, value: { size: 16 }, tab: { size: 14 } });
      continue;
    }
    const { searchPlaceholder, searchBackground, ...controls } = readability;
    expect(controls, detail).toEqual({
      indicator: true, selectedDirectory: true, tableHeader: true, tableBorder: true,
      versionBorder: true, searchBorder: true, searchFocus: true,
    });
    expect(fonts, detail).toMatchObject({ directory: { size: 13 }, selectedDirectory: { weight: '550' }, value: { size: 14 } });
    const [lighter, darker] = [luminance(searchPlaceholder), luminance(searchBackground)].sort((a, b) => b - a);
    expect((lighter + 0.05) / (darker + 0.05), `${detail} search placeholder`).toBeGreaterThanOrEqual(4.5);
  }
  for (const [action, passed] of Object.entries(result.actions)) {
    expect(passed, action).toBe(true);
  }
 }finally{const target=relative(tmpdir(),directory);if(!target||target.startsWith('..')||isAbsolute(target))throw Error('Invalid fixture cleanup');await rm(directory,{recursive:true,force:true,maxRetries:3});}
},75000);
