import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('keeps mobile capability controls compact in the configuration page', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-mobile-model-layout-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/mobile-model-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.png': 'file', '.svg': 'file', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent', plugins: [{ name: 'inline-css', setup(builder) {
        builder.onResolve({ filter: /\.css\?inline$/ }, args => ({ path: resolve(dirname(args.importer), args.path.replace(/\?inline$/, '')), namespace: 'inline-css' }));
        builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
      } }] });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/mobile-model-layout.probe.cjs'), htmlPath, reportPath], { env, timeout: 45000, windowsHide: true });
    const reports = JSON.parse(await readFile(reportPath, 'utf8'));
    await mkdir(resolve('build/model-controls-compact-check'), { recursive: true });
    await copyFile(reportPath,resolve('build/model-controls-compact-check/report.json'));
    for (const file of ['preset-groups-dark.png','model-capabilities-dark.png','updates-dark.png','add-update-light.png','add-update-dark.png']) await copyFile(resolve(directory,file),resolve('build/model-controls-compact-check',file));
    expect(reports).toHaveLength(6);
    for (const report of reports) {
      const [add,fetch]=report.modelActions;
      for(const key of ['width','height','background','color','fontSize','borderRadius']) expect(add[key],JSON.stringify(report)).toBe(fetch[key]);
      expect(report.groups.overflow).toBe(false);
      expect(report.groups.bar.height).toBe(44);
      for(const button of report.groups.buttons) { expect(button.height).toBeGreaterThanOrEqual(48); expect(button.left).toBeGreaterThanOrEqual(16); expect(button.right).toBeLessThanOrEqual(report.width-16); }
      for(const row of report.groups.rows) expect(row.height).toBeGreaterThanOrEqual(48);
      expect(report.groups.name.height).toBeGreaterThanOrEqual(48);
      const evidence = JSON.stringify(report);
      expect(report.scrollWidth, evidence).toBeLessThanOrEqual(report.formWidth);
      expect(report.inputs.height, evidence).toBeLessThanOrEqual(60);
      expect(report.inputBorderRight, evidence).toBe('0px');
      for (const input of report.checkboxes) {
        expect(input.width, evidence).toBe(16);
        expect(input.height, evidence).toBe(16);
        expect(input.label.height, evidence).toBeGreaterThanOrEqual(48);
      }
      if (report.mode === 'editor') {
        expect(report.controls.track.width, evidence).toBe(32);
        expect(report.controls.track.height, evidence).toBe(18);
        expect(report.controls.track.background, evidence).toBe(report.controls.reference.background);
        expect(report.controls.thumb.background, evidence).toBe(report.controls.referenceThumb.background);
        expect(report.controls.labelLines, evidence).toBe(1);
        expect(report.controls.customEditable, evidence).toBe(true);
        expect(report.controls.defaultsRestored, evidence).toBe(true);
        for (const accent of report.controls.accents) expect(accent, evidence).toBe(report.controls.referenceAccent);
        expect(report.updates.height, evidence).toBe(32);
        expect(report.updates.fontSize, evidence).toBe('13px');
        expect(report.updates.iconColor, evidence).toBe(report.updates.color);
        expect(report.updates.iconColor, evidence).not.toBe(report.updates.background);
        expect(report.updates.iconPresent, evidence).toBe(true);
        expect(report.updates.iconInk, evidence).toBeGreaterThan(12);
        expect(report.updates.missingIconInk, evidence).toBe(0);
        expect(report.updates.sameRow, evidence).toBe(true);
        expect(report.updates.overflow, evidence).toBe(false);
        expect(report.updates.opened, evidence).toBe(true);
        expect(report.modelActions.map(button => button.text), evidence).toEqual(['添加模型', '读取模型']);
        expect(report.modelActions[0].right, evidence).toBeLessThanOrEqual(report.modelActions[1].x);
        expect(report.modelActions[0].y, evidence).toBe(report.modelActions[1].y);
        expect(report.modelActions.every(button => button.height === 48), evidence).toBe(true);
        expect(report.modelList.text, evidence).not.toContain('添加模型');
        expect(report.modelList.inputBorder, evidence).toBe('0px'); expect(report.modelList.inputRadius, evidence).toBe('0px');
        expect(report.parameterHeadingVisible, evidence).toBe(true);
          expect(report.remove.width, evidence).toBe(28);
          expect(report.remove.height, evidence).toBe(28);
          expect(report.remove.icon.width, evidence).toBe(16);
          expect(report.remove.icon.height, evidence).toBe(16);
          expect(report.remove.background, evidence).toBe('rgba(0, 0, 0, 0)');
          expect(report.remove.touchSize, evidence).toBeGreaterThanOrEqual(48);
        expect(report.capabilities.height, evidence).toBeLessThanOrEqual(250);
        expect(report.reasoning.legend.bottom, evidence).toBeLessThanOrEqual(report.reasoning.buttons[0].y);
        for (const button of report.reasoning.buttons) {
          expect(button.height, evidence).toBe(48);
          expect(button.width, evidence).toBeGreaterThanOrEqual(48);
          expect(button.x + button.width, evidence).toBeLessThanOrEqual(report.reasoning.x + report.reasoning.width);
        }
      } else {
        expect(report.save.expected.background, evidence).not.toBe('rgba(0, 0, 0, 0)');
        expect(report.save.disabled.disabled, evidence).toBe(true);
        expect(report.save.disabled.background, evidence).toBe(report.save.expected.background);
        expect(report.save.disabled.color, evidence).toBe(report.save.expected.color);
        expect(Number(report.save.disabled.opacity), evidence).toBeLessThan(1);
        expect(report.save.enabled.background, evidence).toBe(report.save.expected.background);
        expect(report.save.enabled.color, evidence).toBe(report.save.expected.color);
        expect(report.save.enabled.opacity, evidence).toBe('1');
        expect(report.parameterHeadingVisible, evidence).toBe(false);
        expect(report.capabilities.height, evidence).toBeLessThanOrEqual(96);
      }
    }
  } finally {
    const path = relative(tmpdir(), directory);
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
