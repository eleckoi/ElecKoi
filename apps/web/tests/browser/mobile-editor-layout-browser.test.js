import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('keeps the five mobile actions at the bottom and uses official controls in both owners and themes', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-mobile-editor-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/mobile-editor-layout.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' }, logLevel: 'silent' });
    const htmlPath = resolve(directory, 'fixture.html'), reportPath = resolve(directory, 'report.json');
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    await writeFile(htmlPath, '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    // A freshly installed Electron image can stay locked for a moment on Windows
    // CI (antivirus scan); retry the launch instead of failing the layout checks.
    const launch = async (attempt = 0) => {
      try {
        return await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/mobile-editor-layout.probe.cjs'), htmlPath, reportPath], { env, timeout: 45000, windowsHide: true });
      } catch (error) {
        if (attempt >= 2 || !['EBUSY', 'ETXTBSY', 'EPERM'].includes(error.code)) throw error;
        await new Promise(done => setTimeout(done, 1000 * (attempt + 1)));
        return launch(attempt + 1);
      }
    };
    await launch();
    const { layouts: reports, merges, searches } = JSON.parse(await readFile(reportPath, 'utf8')); expect(reports).toHaveLength(64);
    expect(searches).toHaveLength(30);
    for (const report of searches) {
      const evidence = JSON.stringify(report);
      expect(report.reachable, evidence).toBe(true);
      expect(report.input.width, evidence).toBeGreaterThan(80);
      expect(report.search.right, evidence).toBeLessThanOrEqual(report.toolbar.right);
      if (report.compact) {
        const reference = reports.find(item => item.kind === 'settings' && item.scope === report.scope && item.theme === report.theme && item.compact);
        expect(report.search.height, evidence).toBe(reference.search.height);
        expect(report.fill, evidence).toBe(reference.searchFill);
        expect(report.radius, evidence).toBe(report.referenceRadius);
        expect(report.border, evidence).toBe(report.referenceBorder);
        expect(report.toolbar.height, evidence).toBeLessThanOrEqual(132);
        expect(report.search.y - report.toolbar.y, evidence).toBe(12);
        expect(report.search.x - report.toolbar.x, evidence).toBe(12);
        expect(report.toolbar.bottom - report.search.bottom, evidence).toBeGreaterThanOrEqual(12);
        expect(report.toolbar.bottom - report.search.bottom, evidence).toBeLessThanOrEqual(70);
        if (report.kind !== 'branches') {
          expect(report.actions.map(action => action.label), evidence).toContain(report.kind === 'prompts' ? '多选' : '管理预设工具');
          for (const action of report.actions) {
            expect(action.rect.y, evidence).toBeGreaterThanOrEqual(report.search.y);
            expect(action.rect.height, evidence).toBe(48);
            expect(action.rect.width, evidence).toBeGreaterThanOrEqual(44);
            expect(action.fill, evidence).toBe(reference.actionFill);
            expect(action.radius, evidence).toBe(report.referenceActionRadius);
          }
        }
      }
    }
    expect(merges).toHaveLength(12);
    for (const report of merges) {
      const evidence = JSON.stringify(report);
      expect(report.mixed, evidence).toBe('mixed');
      expect(report.checked, evidence).toEqual(['true', 'true', 'true']);
      expect(report.canMerge, evidence).toBe(true);
      for (const box of report.boxes) {
        expect(box.mark.width, evidence).toBe(16); expect(box.mark.height, evidence).toBe(16);
        expect(box.hit.height, evidence).toBe(report.compact ? 48 : 16);
        expect(box.hit.width, evidence).toBe(report.compact ? 44 : 16);
        expect(box.hit.right, evidence).toBeLessThanOrEqual(report.dialog.right);
      }
    }
    for (const report of reports) {
      const evidence = JSON.stringify(report), desktop = reports.find(value => value.kind === report.kind && value.scope === report.scope && value.theme === report.theme && !value.compact);
      expect(report.scrollWidth, evidence).toBeLessThanOrEqual(report.browser.width);
      expect(report.searchFill, evidence).toBe(desktop.searchFill); expect(report.actionFill, evidence).toBe(desktop.actionFill);
      expect(report.officialSearch, evidence).toBe(true); expect(report.officialActions, evidence).toBe(true);
      if (report.versionDialog) {
        const { before, after } = report.versionDialog;
        expect(before.input.height, evidence).toBe(48);
        expect(after.error, evidence).toBe('请输入版本名称');
        expect(after.dialog.height, evidence).toBeLessThanOrEqual(260);
        expect(after.dialog.y, evidence).toBeGreaterThanOrEqual(12); expect(after.dialog.bottom, evidence).toBeLessThanOrEqual(328);
        expect(after.input.y, evidence).toBeGreaterThanOrEqual(after.scrollArea.y);
        expect(after.input.bottom, evidence).toBeLessThanOrEqual(after.scrollArea.bottom);
        for (const button of [...after.buttons, after.close]) { expect(button.height, evidence).toBeGreaterThanOrEqual(48); expect(button.bottom, evidence).toBeLessThanOrEqual(328); }
      }
      if (report.compact) {
        for (const action of report.actions) {
          expect(action.y, evidence).toBeGreaterThanOrEqual(report.search.y);
          expect(action.height, evidence).toBe(report.search.height);
          expect(action.right, evidence).toBeLessThanOrEqual(report.browser.right);
        }
        expect(report.toolbar.height, evidence).toBeLessThanOrEqual(132);
        expect(report.topButtons, evidence).not.toContain('新建');
        expect(report.bottomButtons.map(button => button.label), evidence).toEqual(['新建', '编辑', '移动', '删除', '更多']);
        expect(report.bottom.bottom, evidence).toBe(report.browser.bottom);
        for (const button of report.bottomButtons) { expect(button.rect.height, evidence).toBeGreaterThanOrEqual(48); expect(button.rect.width, evidence).toBeGreaterThanOrEqual(44); }
      } else { expect(report.topButtons, evidence).toContain('新建'); expect(report.bottom, evidence).toBeNull(); }
      for (const [index, group] of report.groups.entries()) {
        expect(group.headingTag, evidence).toBe('DIV'); expect(group.headingIcons, evidence).toBe(0);
        expect(group.header.bottom, evidence).toBeLessThanOrEqual(group.rows.y);
        expect(group.borderBottom, evidence).toBe('0px'); expect(group.radius, evidence).toBe('10px');
        expect(group.outline, evidence).not.toBe('none'); expect(group.rowsFill, evidence).toBe(desktop.groups[index].rowsFill);
        expect(group.switchFill, evidence).toBe(desktop.groups[index].switchFill);
        for (const track of group.tracks) { expect(track.width, evidence).toBe(32); expect(track.height, evidence).toBe(18); expect(track.right, evidence).toBeLessThanOrEqual(group.bounds.right); }
        expect(group.toggle.x - group.heading.right, evidence).toBeLessThanOrEqual(16);
        if (report.compact) { expect(group.toggle.width, evidence).toBe(48); expect(group.toggle.height, evidence).toBe(48); }
      }
    }
  } finally {
    const path = relative(tmpdir(), directory);
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected fixture path');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
