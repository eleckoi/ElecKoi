import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('renders independent global and role sections, shared editing and save in light/dark desktop windows', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-global-setting-ui-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/global-setting-libraries.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.png': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent', plugins: [{ name: 'inline-css', setup(builder) {
        builder.onResolve({ filter: /\.css\?inline$/ }, args => ({ path: resolve(dirname(args.importer), args.path.replace(/\?inline$/, '')), namespace: 'inline-css' }));
        builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
      } }] });
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    await writeFile(html, '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"></head><body style="margin:0"><div id="root" style="height:100vh"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    try { await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/global-setting-libraries.probe.cjs'), html, report], { env, timeout: 45000, windowsHide: true }); }
    catch (cause) { throw new Error(await readFile(report, 'utf8').catch(() => cause.message)); }
    const result = JSON.parse(await readFile(report, 'utf8')); expect(result.errors).toEqual([]); expect(result.reports).toHaveLength(6);
    await mkdir(resolve('output/playwright'), { recursive: true });
    await copyFile(report, resolve('output/playwright/global-setting-libraries-report.json'));
    for (const theme of ['light', 'dark']) for (const width of [1440, 1024, 768]) await copyFile(resolve(directory, `global-setting-libraries-${theme}-${width}.png`), resolve('output/playwright', `global-setting-libraries-${theme}-${width}.png`));
    for (const item of result.reports) {
      expect(item.initial.tabs).toEqual(['角色','全局']); expect(item.initial.selected).toBe('角色'); expect(item.initial.globalsVisible).toBe(false);
      expect(item.initial.width).toBeLessThanOrEqual(item.width); expect(item.initial.border).toBe('0px'); expect(item.initial.tabsInContent).toBe(true);expect(item.initial.tabsBelowToolbar).toBe(true); expect(item.layout.count).toBe(2); expect(item.layout.readOnly).toBe(false);expect(item.layout.canCreate).toBe(true);expect(item.layout.noManager).toBe(true);
      expect(item.layout.overflow, JSON.stringify(item)).toBe(false); expect(item.layout.inspector.right).toBeLessThanOrEqual(item.width);
      expect(item.rightClickKeptClosed).toBe(true);
      expect(item.layout.owner).toContain('全局设定库 / 通用叙事'); expect(item.disabledSaved).toBe(true); expect(item.contentsSaved).toBe(true); expect(item.reordered).toEqual(['环境描写','节奏控制','叙事视角']);
      const {enabled,disabled,collapsed,restored}=item.appearance;
      expect(enabled.nameOpacity).toBe(1); expect(enabled.disabled).toBe(false);
      expect(disabled.disabled).toBe(true); expect(disabled.nameOpacity).toBe(.46);
      expect(disabled.labels.every(label=>label.opacity===.46)).toBe(true);
      expect(disabled.nameColor).not.toBe(enabled.nameColor);
      expect(collapsed.nameOpacity).toBe(.46); expect(collapsed.disabled).toBe(true);
      expect(restored.disabled).toBe(false); expect(restored.nameOpacity).toBe(1); expect(restored.nameColor).toBe(enabled.nameColor);
      expect(restored.labels).toEqual(enabled.labels);
      expect(enabled.switches).toEqual(['true','false','true']);
      expect(disabled.switches).toEqual(enabled.switches); expect(restored.switches).toEqual(enabled.switches);
    }
    await mkdir(resolve('output/playwright'), { recursive: true });
    for (const theme of ['light', 'dark']) for (const width of [1440, 1024, 768]) await copyFile(resolve(directory, `global-setting-libraries-${theme}-${width}.png`), resolve('output/playwright', `global-setting-libraries-${theme}-${width}.png`));
    for (const theme of ['light','dark']) for (const width of [1440,1024,768]) await copyFile(resolve(directory, `role-setting-libraries-${theme}-${width}.png`),resolve('output/playwright',`role-setting-libraries-${theme}-${width}.png`));
    await copyFile(report, resolve('output/playwright/global-setting-libraries-report.json'));
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }); }
}, 60000);
