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
it('automatically saves profile edits and avatar changes, retries failures, and aligns the settings pages', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-settings-companion-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/chat-display-settings.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'silent' });
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"><style>html,body,#root{margin:0;min-width:0;height:100%}.settings-browser-fixture{height:100dvh;display:flex;background:var(--chat)}.settings-browser-fixture>.app-settings-content{width:100%;margin:0}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/settings-companion.probe.cjs'), html, report], { env, windowsHide: true, timeout: 45000 });
    const result = JSON.parse(await readFile(report, 'utf8'));
    expect(result.layouts).toHaveLength(16);
    for (const layout of result.layouts) {
      const detail = JSON.stringify(layout);
      expect(layout.scrollWidth, detail).toBe(layout.width);
      expect(layout.right, detail).toBeLessThanOrEqual(layout.width);
      expect(layout.hasSave, detail).toBe(false);
      expect(layout.choices.every(choice => !choice.overflow), detail).toBe(true);
      if (layout.page === 'profile') {
        expect(layout.manageEntries).toBe(1);
        expect(layout.inputShadow).toBe('none');
        expect(layout.hasPreview).toBe(false);
        expect(layout.avatarAboveName).toBe(true);
        expect(layout.avatarSizes).toHaveLength(1);
        expect(layout.avatarSizes.every(avatar => avatar.width >= 70), detail).toBe(true);
        expect(layout.avatarSizes[0].width).toBe(layout.avatarSizes[0].height);
        expect(layout.circle.clip).toBe('circle(50%)');
        expect(['round', 'superellipse(1)']).toContain(layout.circle.shape);
        expect(layout.inventory).toBeNull();
      } else {
        expect(layout.colorSurface).toBe('rgba(0, 0, 0, 0)');
      }
    }
    expect(result.before).toEqual({ stored: '访客', name: '新名字' });
    expect(result.initial).toEqual({ name: '新名字', tab: '圆形', returns: false, material: 'translucent' });
    expect(result.pickerClicks).toBe(3);
    expect(result.draft).toMatchObject({ stored: '新名字', error: '' });
    expect(result.draft.saves).toBeGreaterThanOrEqual(2);
    expect(result.draft.source).toMatch(/^data:image\/png;base64,/);
    expect(result.cropping).toBe(2);
    expect(result.afterCropEscape).toEqual({ dialogs: 1, manager: true });
    expect(result.afterClose.focus).toBe('管理头像');
    expect(result.afterClose.name).toBe('新名字');
    expect(result.afterClose.saves).toBeGreaterThanOrEqual(2);
    expect(result.afterClose.source).toBe(result.draft.source);
    expect(result.failure).toEqual({ error: '合成保存失败 重试', name: '重试名字', disabled: false });
    expect(result.saved.persona.user_name).toBe('重试名字');
    expect(result.saved.payload.name).toBe('重试名字');
    expect(result.saved.payload.avatars.circle).toMatch(/^data:image\/png;base64,/);
    expect(result.saved.payload.avatars.portrait).toBe(result.draft.portrait);
    expect(result.saved.hasError).toBe(false);
    for (const theme of ['light','dark']) {
      const margins=result.margins.filter(row=>row.theme===theme);
      expect(margins).toHaveLength(4);
      expect(new Set(margins.map(row=>row.left)).size).toBe(1);
      expect(new Set(margins.map(row=>row.top)).size).toBe(1);
    }
    expect(result.themeChanged).toEqual({ appearance: 'dark', artwork: 'avatar' });
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
