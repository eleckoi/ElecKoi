import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { browserThemeCss } from '../helpers/browserTheme.js';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
it('keeps roleplay surfaces flush, independent, and readable in both desktop and mobile settings', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-roleplay-style-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/roleplay-style.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'silent' });
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"><style>
      html,body,#root{margin:0;min-width:0;height:100%}.style-chat-fixture{display:block;height:100%}
      .style-chat-fixture>.chat-panel{height:100%}.app-settings-content{height:100%;overflow:auto}.mobile-shell{height:100dvh;display:flex}.inputbar textarea{width:100%;height:60px;background:transparent;border:0;color:var(--text)}
      </style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>`);
    const output = process.env.ELECKOI_ROLEPLAY_STYLE_REPORT;
    if (output) await mkdir(output, { recursive: true });
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/roleplay-style.probe.cjs'), html, report, ...(output ? [output] : [])], { env, windowsHide: true, timeout: 55000 });
    if (output) await copyFile(report, resolve(output, 'verified.json'));
    const result = JSON.parse(await readFile(report, 'utf8'));
    expect(result.errors).toEqual([]);
    expect(result.initial).toEqual({backdrop:false,bubbles:false});
    expect(result.layouts).toHaveLength(16);
    for (const layout of result.layouts) {
      const detail = JSON.stringify(layout);
      expect(layout.overflow, detail).toBe(false);
      expect(layout.scrollable, detail).toBe(true);
      expect(layout.atTail, detail).toBe(true);
      expect(layout.composers).toBe(1);
      expect(layout.gaps.every(gap => Math.abs(gap-12)<.1), detail).toBe(true);
      expect(layout.base).toMatchObject({ top: '0px', bottom: '0px', radius: '0px', border: '0px', blur: 'blur(20px) saturate(0.88)' });
      expect(layout.bodyBottom, detail).toBe(layout.panelBottom);
      expect(layout.wallpaperTop, detail).toBe(layout.headerBottom);
      expect(layout.headerFill, detail).not.toBe('rgba(0, 0, 0, 0)');
      expect(layout.gradient, detail).toContain('linear-gradient');
      expect(layout.rows).toHaveLength(20);
      expect(layout.rows.every(row => row.floorInside && row.portrait && row.aligned && row.insideBackdrop && !row.overflow), detail).toBe(true);
      expect(layout.rows.every(row => row.bubble === (layout.bubbles ? '""' : 'none')), detail).toBe(true);
      if (layout.bubbles) expect(new Set(layout.rows.map(row => row.fill)).size, detail).toBe(1);
    }
    for (const material of result.materials) for (const layer of ['Base','Bubble']) {
      expect(material[`actual${layer}`].every((channel,index)=>Math.abs(channel-material[`reference${layer}`][index])<=2), JSON.stringify(material)).toBe(true);
    }
    expect(result.authoredWallpaper).toEqual({opacity:'0.42',blur:'blur(7px)',wash:'rgba(23, 23, 23, 0.3)'});
    expect(result.custom.user).not.toBe(result.custom.ai);
    expect(result.custom.blur).toBe('blur(8px)');
    expect(result.gallery).toBe(false);
    expect(result.agent).toEqual({ backdrop: false, bubbles: false, tint: '' });
    expect(result.disabled.content).toBe('none');
    expect(result.restored).toMatchObject({ ...result.custom.prefs, backdrop_enabled: true, bubbles_enabled: true });
    expect(result.customGap).toBe(24);
    expect(result.settings).toHaveLength(8);
    expect(result.mobile).toHaveLength(6);
    for (const layout of [...result.settings, ...result.mobile]) {
      expect(layout.overflow, JSON.stringify(layout)).toBe(false);
      expect(layout.rows, JSON.stringify(layout)).toEqual([]);
    }
  } finally {
    const target = relative(tmpdir(), directory);
    if (!target || target.startsWith('..') || isAbsolute(target)) throw Error('Invalid probe cleanup target');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 75000);
