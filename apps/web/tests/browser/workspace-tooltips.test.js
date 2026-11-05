import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url),shellRequire=createRequire(resolve('packages/client/features/dsh-client-shell/package.json'));
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild');
it('lets the official workspace tooltip escape the product sidebar while retaining caption controls',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'eleckoi-workspace-tooltip-'));
  try {
    await build({entryPoints:['apps/web/tests/browser/workspace-tooltips.fixture.jsx'],outfile:resolve(directory,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',
      alias:{'@shared':resolve('packages/shared/src'),'@deepseek-ai/dsh-client-ui-sidebar/client':shellRequire.resolve('@deepseek-ai/dsh-client-ui-sidebar/client'),
        '@deepseek-ai/dsh-client-store':shellRequire.resolve('@deepseek-ai/dsh-client-store'),'@deepseek-ai/dsh-client-ui-slots':shellRequire.resolve('@deepseek-ai/dsh-client-ui-slots')},
      loader:{'.png':'file','.svg':'dataurl','.woff2':'file','.woff':'file','.ttf':'file'},logLevel:'silent'});
    const html=resolve(directory,'fixture.html'),report=resolve(directory,'report.json');
    await writeFile(html,`<!doctype html><html><head><meta charset="utf-8"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/workspace-tooltips.probe.cjs'),html,report],{env,timeout:30000,windowsHide:true});
    const {rows,errors}=JSON.parse(await readFile(report,'utf8'));
    expect(errors).toEqual([]); expect(rows).toHaveLength(6);
    for(const row of rows){const detail=JSON.stringify(row);
      expect(row.before.visible,detail).toBe(true); expect(row.before.rightHit,detail).toBe(true);
      expect(row.clippedBefore,detail).toBe(true);
      expect(row.before.tip.right,detail).toBeGreaterThan(row.before.panel.right);
      expect(row.before.tip.left+row.before.tip.width/2,detail).toBeCloseTo(row.before.button.left+row.before.button.width/2,0);
      expect(row.before.toggle.left-row.before.panel.left,detail).toBeCloseTo(12,0);
      expect(row.before.toggle.top,detail).toBeCloseTo(6,0);
      expect(row.collapsed.open,detail).toBe(true);expect(row.collapsed.panelWidth,detail).toBe(0);expect(row.restored,detail).toBeCloseTo(280,0);
    }
  }finally{await rm(directory,{recursive:true,force:true,maxRetries:3});}
},40000);
