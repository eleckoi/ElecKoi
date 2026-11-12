import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');

it('keeps the standalone opening editor usable across themes, short windows and compact navigation', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-character-openings-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/character-openings.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'esm', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent', plugins: [{name:'inline-css',setup(builder){
        builder.onResolve({filter:/\.css\?inline$/},args=>({path:resolve(dirname(args.importer),args.path.replace(/\?inline$/,'')),namespace:'inline-css'}));
        builder.onLoad({filter:/.*/,namespace:'inline-css'},async args=>({loader:'text',contents:(await build({stdin:{contents:await readFile(args.path,'utf8'),loader:'css',resolveDir:dirname(args.path)},bundle:true,write:false,logLevel:'warning'})).outputFiles[0].text}));
      }}] });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    await writeFile(htmlPath, '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"></head><body><div id="root" style="height:100vh"></div><script type="module" src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/character-openings.probe.cjs'), htmlPath, reportPath], { env, timeout: 90000, windowsHide: true });
    const reports = JSON.parse(await readFile(reportPath, 'utf8'));
    expect(reports).toHaveLength(4);
    for (const { actions, layout } of reports) {
      expect(Object.values(actions).every(Boolean)).toBe(true);
      expect(layout.navigation.slice(0, 3)).toEqual(['基础资料', '开场白', '设定库']);
    }
    const evidence=resolve('build/opening-workspace-check');await mkdir(evidence,{recursive:true});
    await copyFile(reportPath,resolve(evidence,'report.json'));
    for(const file of await readdir(directory))if(/\.png$/.test(file))await copyFile(resolve(directory,file),resolve(evidence,file));
    const preview=resolve(evidence,'preview');await mkdir(preview,{recursive:true});
    for(const file of await readdir(directory))if(/\.(html|css|js|woff2?|ttf)$/.test(file))await copyFile(resolve(directory,file),resolve(preview,file));
  } finally {
    const evidence=resolve('build/opening-workspace-check');await mkdir(evidence,{recursive:true});
    for(const file of await readdir(directory))if(/\.png$/.test(file)||file==='report.json')await copyFile(resolve(directory,file),resolve(evidence,file));
    const target=relative(tmpdir(),directory);if(!target||target.startsWith('..')||isAbsolute(target))throw Error('Invalid fixture cleanup');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 105000);
