import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require = createRequire(import.meta.url), { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('matches the roleplay header height and gives the official Studio trajectory a bounded seat above the resident composer', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-mobile-studio-'));
  try {
    const source = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-trajectory/client'), 'utf8');
    const composerSource = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-conversation/client'), 'utf8');
    if (composerSource.split('return module.exports;').length !== 2) throw new Error('Unexpected locked Conversation Client bundle boundary');
    if (source.split('return module.exports;').length !== 2) throw new Error('Unexpected locked Trajectory Client bundle boundary');
    await build({ entryPoints: ['apps/web/tests/browser/mobile-studio-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') }, loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'silent',
      plugins: [{ name: 'official-studio-composer-fixture', setup(build) {
        build.onResolve({ filter: /^official-studio-composer-fixture$/ }, () => ({ path: 'official-studio-composer-fixture', namespace: 'studio-composer' }));
        build.onLoad({ filter: /.*/, namespace: 'studio-composer' }, () => ({ resolveDir: resolve('.'), contents: `
          import * as React from 'react'; import * as jsxRuntime from 'react/jsx-runtime'; import * as ReactDOM from 'react-dom';
          import * as Cordis from '@deepseek-ai/cordis'; import * as zod from 'zod';
          import * as store from '@deepseek-ai/dsh-client-store'; import * as slots from '@deepseek-ai/dsh-client-ui-slots'; import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
          let registration; const captureModule=value=>{registration=value;};
          ${composerSource.replace('window.__ModuleLoader__.load(', 'captureModule(').replace('return module.exports;', 'return {InputBar,DraftEditorRuntime,registerPlainText: O$1,conversationZh: zh};')}
          const modules={react:React,'react/jsx-runtime':jsxRuntime,'react-dom':ReactDOM,zod,'@deepseek-ai/cordis':Cordis,'@deepseek-ai/dsh-client-store':store,'@deepseek-ai/dsh-client-ui-slots':slots,'@deepseek-ai/dsh-client-ui-primitives':primitives};
          export const {InputBar,DraftEditorRuntime,registerPlainText,conversationZh}=registration.factory(name=>{if(!(name in modules))throw new Error(name);return modules[name];});
        ` }));
      } }, { name: 'official-trajectory-fixture', setup(build) {
        build.onResolve({ filter: /^official-trajectory-fixture$/ }, () => ({ path: 'official-trajectory-fixture', namespace: 'trajectory-fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'trajectory-fixture' }, () => ({ resolveDir: resolve('.'), contents: `
          import * as React from 'react'; import * as jsxRuntime from 'react/jsx-runtime'; import * as ReactDOM from 'react-dom';
          import * as virtual from '@tanstack/react-virtual'; import * as store from '@deepseek-ai/dsh-client-store'; import * as primitives from '@deepseek-ai/dsh-client-ui-primitives';
          let registration;const captureModule=value=>{registration=value;};
          ${source.replace('window.__ModuleLoader__.load(', 'captureModule(').replace('return module.exports;', 'return { ...module.exports, TrajectoryView, trajectoryZh: zh };')}
          const modules={'@tanstack/react-virtual':virtual,react:React,'react/jsx-runtime':jsxRuntime,'react-dom':ReactDOM,'@deepseek-ai/dsh-client-store':store,'@deepseek-ai/dsh-client-ui-primitives':primitives};
          export const {TrajectoryView,trajectoryZh}=registration.factory(name=>{if(!(name in modules))throw new Error(name);return modules[name];});
        ` }));
      } }],
    });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    await writeFile(htmlPath, '<!doctype html><html data-eleckoi-mobile="true"><head><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"><style>html,body,#root{height:100%;margin:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/mobile-studio-layout.probe.cjs'), htmlPath, reportPath], { env, timeout: 90000, windowsHide: true });
    const { active: reports, hero } = JSON.parse(await readFile(reportPath, 'utf8')); expect(reports).toHaveLength(24); expect(hero).toHaveLength(12);
    for (const report of hero) {
      const evidence = JSON.stringify(report);
      expect(report.headline, evidence).toBe('人，你会想念我吗？'); expect(report.mascotLoaded, evidence).toBe(true);
      expect(report.tabs, evidence).toBe(false); expect(report.workspace, evidence).toBe('合成工作区'); expect(report.preset, evidence).toBe('合成创作预设');
      expect(report.card.x + report.card.width / 2, evidence).toBeCloseTo(report.width / 2, 0);
      expect(report.stack.y + report.stack.height / 2, evidence).toBeCloseTo(report.body.y + report.body.height / 2, 0);
      expect(report.card.x, evidence).toBeGreaterThanOrEqual(16); expect(report.card.right, evidence).toBeLessThanOrEqual(report.width - 16);
      expect(report.scrollWidth, evidence).toBeLessThanOrEqual(report.width); expect(report.sameInput, evidence).toBe(true); expect(report.rewriteHero, evidence).toBe(false);
      expect(report.draft, evidence).toBe('合成草稿');
      expect(report.inputButtons.length, evidence).toBeGreaterThanOrEqual(3);
      expect(report.inputButtons.every(button => button.height <= 34), evidence).toBe(true);
    }
    for (const report of reports) {
      const evidence = JSON.stringify(report);
      expect(report.header.height, evidence).toBe(40); expect(report.tabs.height, evidence).toBe(28);
      expect(report.header.height + report.tabs.height, evidence).toBe(report.reference.height); expect(report.titleSize, evidence).toBe('14px');
      expect(report.tabs.y, evidence).toBe(report.header.bottom); expect(report.body.y, evidence).toBe(report.tabs.bottom);
      expect(report.actions.every(action => action.height === 40 && action.width === 36), evidence).toBe(true);
      expect(report.actionLabels, evidence).toEqual(['返回', '工作室侧边栏', '打开右侧边栏']);
      expect(report.preset.y, evidence).toBeGreaterThanOrEqual(report.header.y);
      expect(report.preset.bottom, evidence).toBeLessThanOrEqual(report.header.bottom);
      expect(report.preset.width, evidence).toBeGreaterThan(0);
      expect(report.corner.x, evidence).toBeGreaterThanOrEqual(report.preset.right);
      expect(report.more.x, evidence).toBeGreaterThanOrEqual(report.tabs.right);
      expect(report.more.bottom, evidence).toBeLessThanOrEqual(report.tabs.bottom);
      expect(report.utilities, evidence).toBe(false);
      expect(report.tabButtons.every(button => button.height === 28), evidence).toBe(true);
      expect(report.bodyWidth, evidence).toBeLessThanOrEqual(report.body.width); expect(report.dialog, evidence).toBe(false);
      expect(report.composer.bottom, evidence).toBeLessThanOrEqual(report.height); expect(report.composer.y, evidence).toBeGreaterThanOrEqual(report.body.bottom);
      expect(report.draft, evidence).toBe('合成草稿');
      expect(report.inputButtons.length, evidence).toBeGreaterThanOrEqual(3);
      expect(report.inputButtons.every(button => button.height <= 34), evidence).toBe(true);
      expect(report.menu.x, evidence).toBeGreaterThan(report.inputButtons[0].x);
      if (report.view === 'trajectory') { expect(report.native.height, evidence).toBe(report.body.height); expect(report.native.bottom, evidence).toBeLessThanOrEqual(report.composer.y); expect(report.clearance.trim(), evidence).toBe('0px'); }
    }
  } finally {
    const path = relative(tmpdir(), directory); if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 120000);
