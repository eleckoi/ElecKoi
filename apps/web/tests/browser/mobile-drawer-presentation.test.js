import {execFile} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {resolve,relative,isAbsolute} from 'node:path';
import {promisify} from 'node:util';
import {expect,it} from 'vitest';
import {browserThemeCss} from '../helpers/browserTheme.js';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild');
it('restores the approved mobile drawer presentation on the retained official frame',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'eleckoi-drawer-presentation-'));
 try{
  // The deployed DSH runtime uses React 18's inert="" DOM contract. The
  // workspace harness uses React 19, which requires the equivalent boolean.
  await build({entryPoints:['apps/web/tests/browser/mobile-drawer-presentation.fixture.jsx'],outfile:resolve(dir,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',jsxImportSource:'eleckoi-native-jsx',alias:{'@shared':resolve('packages/shared/src')},define:{'process.env.NODE_ENV':'"production"','process.env.DSH_CLIENT_TITLE':'"ElecKoi"'},loader:{'.woff2':'file','.woff':'file','.ttf':'file','.png':'dataurl','.svg':'dataurl'},logLevel:'silent',plugins:[{name:'native-inert-dom',setup(builder){
   builder.onResolve({filter:/^eleckoi-native-jsx\/jsx-runtime$/},()=>({path:'runtime',namespace:'native-jsx'}));
   builder.onLoad({filter:/.*/,namespace:'native-jsx'},()=>({loader:'js',resolveDir:process.cwd(),contents:`import {jsx as nativeJsx,jsxs as nativeJsxs,Fragment} from ${JSON.stringify(require.resolve('react/jsx-runtime'))};const bind=render=>(type,props,key)=>render(type,typeof type==='string'&&props?.inert===''?{...props,inert:true}:props,key);export const jsx=bind(nativeJsx),jsxs=bind(nativeJsxs);export {Fragment};`}));
  }}]});
  await writeFile(resolve(dir,'fixture.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root" style="height:100vh"></div><script src="fixture.js"></script></body></html>`);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let failure;
  try{await promisify(execFile)(require('electron'),[resolve('apps/web/tests/browser/mobile-drawer-presentation.probe.cjs'),resolve(dir,'fixture.html'),resolve(dir,'report.json')],{env,timeout:45000,windowsHide:true});}catch(e){failure=e;}
  const report=JSON.parse(await readFile(resolve(dir,'report.json'),'utf8').catch(error=>{throw failure??error;})),evidence=resolve('build/mobile-drawer-restore-check');await mkdir(evidence,{recursive:true});await copyFile(resolve(dir,'report.json'),resolve(evidence,'browser.json'));
  if(report.passed)await copyFile(resolve(dir,'drawer-open-dark.png'),resolve(evidence,'drawer-open-dark.png'));
  expect(failure,JSON.stringify(report)).toBeUndefined();expect(report.errors).toEqual([]);expect(report.cases).toHaveLength(8);
  for(const row of report.cases){
   const detail=JSON.stringify(row);
   if(row.width>=768){expect(row.initial.drawer,detail).toBe(false);expect(row.initial.frontTransform,detail).toBe('none');continue;}
   const expectedWidth=Math.min(row.initial.width*.8,326);
   expect(row.open.side.width,detail).toBeCloseTo(expectedWidth,1);
   expect(row.entering.front.x,detail).toBeGreaterThan(1);expect(row.entering.front.x,detail).toBeLessThan(row.open.front.x);
   expect(row.exiting.front.x,detail).toBeGreaterThan(row.closed.front.x+1);expect(row.exiting.front.x,detail).toBeLessThan(row.open.front.x);
   expect(row.open.front.width,detail).toBeCloseTo(row.initial.width*.95,1);expect(row.open.frontRadius,detail).toBe('36px');expect(row.open.side.height,detail).toBeCloseTo(row.initial.height,1);
   expect(Math.abs(row.open.front.bottom-row.open.nav.top),detail).toBeLessThan(1);
   expect(row.open.maskHit,detail).toBe(true);expect(row.open.centerInert,detail).toBe(true);
   expect(row.bottomMaskHit,detail).toBe(true);
   expect(row.closed.closed,detail).toBe(true);expect(row.closed.sideVisibility,detail).toBe('hidden');expect(row.closed.frontTransform,detail).toBe('none');expect(row.closed.centerInert,detail).toBe(false);
   expect(row.reversed.closed,detail).toBe(false);expect(row.reversed.front.x,detail).toBeCloseTo(row.open.front.x,1);
   for(const phase of ['open','closed','reversed']){expect(row[phase].draftSame,detail).toBe(true);expect(row[phase].pageSame,detail).toBe(true);expect(row[phase].draft,detail).toBe('原草稿追加');expect(row[phase].scroll,detail).toBe(90);expect(row[phase].footer,detail).toBe(true);}
  }
  expect(report.reduced.closed).toBe(false);expect(report.reduced.front.width).toBeCloseTo(report.reduced.width*.95,1);
 }finally{const path=relative(tmpdir(),dir);if(!path||path.startsWith('..')||isAbsolute(path))throw Error('Unexpected fixture cleanup path');await rm(dir,{recursive:true,force:true,maxRetries:3});}
},60000);
