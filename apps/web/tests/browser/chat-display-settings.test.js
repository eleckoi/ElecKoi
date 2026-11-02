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
it('preserves precise adjustments and resets while laying out visual settings in both themes', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'eleckoi-chat-settings-'));
  try {
    await build({ entryPoints: ['apps/web/tests/browser/chat-display-settings.fixture.jsx'], outfile: resolve(directory, 'fixture.js'), bundle: true,
      format: 'iife', jsx: 'automatic', alias: { '@shared': resolve('packages/shared/src') },
      loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' }, logLevel: 'silent' });
    await writeFile(resolve(directory, 'theme.css'), browserThemeCss());
    const html = resolve(directory, 'fixture.html'), report = resolve(directory, 'report.json');
    await writeFile(html, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="fixture.css"><style>html,body,#root{margin:0;min-width:0;height:100%}.settings-browser-fixture{height:100dvh;display:flex;background:var(--chat)}.settings-browser-fixture>.app-settings-content{width:100%;margin:0}.settings-browser-fixture>.app-settings-sidebar{width:240px;flex:none}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    await promisify(execFile)(require('electron'), [resolve('apps/web/tests/browser/chat-display-settings.probe.cjs'), html, report], { env, windowsHide: true, timeout: 45000 });
    const result = JSON.parse(await readFile(report, 'utf8'));
    expect(result.layouts).toHaveLength(24);
    for (const layout of result.layouts) {
      const detail = JSON.stringify(layout);
      expect(layout.left, detail).toBeGreaterThanOrEqual(0);
      expect(layout.right, detail).toBeLessThanOrEqual(layout.width);
      expect(layout.scrollWidth, detail).toBe(layout.width);
      expect(layout.scrollbarWidth, detail).toBe(layout.officialScrollbarWidth);
      expect(layout.overflow, detail).toEqual([]);
      for (const frame of layout.frames) {
        expect(parseFloat(frame.right), detail).toBeGreaterThan(0);
        expect(frame.right, detail).toBe(frame.left);
        expect(frame.edge, detail).toBeLessThanOrEqual(layout.editorRight + 1);
      }
      expect(layout.weightSelect).toBe(false);
      if (layout.expanded) {
        const textChannels = layout.selectedText.match(/\d+/g).map(Number);
        expect(textChannels.every(channel => layout.theme === 'dark' ? channel >= 200 : channel <= 80), detail).toBe(true);
      }
      expect(layout.ranges.every(row => row.range && row.number && row.reset)).toBe(true);
      expect(layout.outerShadow).toBe('none');
      expect(layout.outerFill).toBe('rgba(0, 0, 0, 0)');
      expect(layout.composer).toBe(false);
      for (const thumbnail of layout.thumbnails) {
        expect(thumbnail.width, detail).toBeLessThanOrEqual(152);
        expect(thumbnail.width / thumbnail.height, detail).toBeLessThan(1.8);
      }
      expect(layout.fakeStats).toBe(false);
      expect(layout.samples).toHaveLength(6);
      expect(layout.samples.every(sample => sample.children || sample.content)).toBe(true);
      for (const surface of layout.surfaces) {
        expect(surface.header, detail).toBe('rgba(0, 0, 0, 0)');
        expect(surface.body, detail).toBe('rgba(0, 0, 0, 0)');
        expect(surface.material, detail).toBe('translucent');
        expect(parseFloat(surface.separator), detail).toBeGreaterThan(0);
        expect(parseFloat(surface.separator), detail).toBeLessThanOrEqual(1);
        expect(surface.filter, detail).toContain('blur(');
      }
      expect(layout.floors.map(floor => floor.number)).toEqual(['#0', '#1']);
      for (const floor of layout.floors) {
        expect(Math.abs(floor.left - floor.avatarLeft), detail).toBeLessThan(1);
        expect(Math.abs(floor.width - floor.avatarWidth), detail).toBeLessThan(1);
        expect(floor.top, detail).toBeGreaterThanOrEqual(floor.avatarBottom);
      }
      if (layout.width === 1056) {
        expect(layout.previewWidth, detail).toBeGreaterThanOrEqual(300);
        expect(layout.previewWidth, detail).toBeLessThanOrEqual(400);
        expect((layout.editorRight - layout.left) / layout.previewWidth, detail).toBeGreaterThan(1.5);
        expect((layout.editorRight - layout.left) / layout.previewWidth, detail).toBeLessThan(1.8);
        expect(layout.previewLeft - layout.editorRight).toBeCloseTo(24, 2);
      }
      if (layout.width <= 592) expect(layout.previewTop, detail).toBeGreaterThan(layout.editorBottom);
      if (layout.expanded) expect(layout.open).toContain('typography');
      else expect(layout.open).toEqual([]);
    }
    for (let index = 0; index < result.layouts.length; index += 2) {
      const [closed, expanded] = result.layouts.slice(index, index + 2);
      expect(expanded.panelWidth, JSON.stringify({ closed, expanded })).toBe(closed.panelWidth);
      expect(expanded.editorRight).toBe(closed.editorRight);
      expect(expanded.previewWidth).toBe(closed.previewWidth);
    }
    expect(result.strokes).toHaveLength(3);
    for (const stroke of result.strokes) {
      expect(stroke.layer).toBe('1');
      expect(stroke.left).toBeLessThanOrEqual(247);
      expect(stroke.right).toBeLessThanOrEqual(247);
      expect(Math.abs(stroke.left-stroke.right)).toBeLessThanOrEqual(2);
    }
    expect(result.modified.preferences.profiles.roleplay.message_font_weight).toBe(600);
    expect(result.modified.preferences.profiles.roleplay.letter_spacing).toBe(3);
    expect(result.modified.weight).toBe('600');
    expect(result.modified.letter).toBe('3px');
    expect(result.singleReset.profiles.roleplay.letter_spacing).toBe(result.before.profiles.roleplay.letter_spacing);
    expect(result.singleReset.profiles.roleplay.message_font_weight).toBe(600);
    expect(result.reset.profiles.roleplay).toEqual(result.before.profiles.roleplay);
    expect(result.reset.profiles.agent).toEqual(result.before.profiles.agent);
    expect(result.reset.generation_stats_enabled).toBe(false);
    expect(result.agent).toMatchObject({ portraitDisabled: true, bubble: true, timestamps: false, preferences: { layout: 'agent' } });
    expect(result.switchedBack.profiles.agent.message_font_size).toBe(18);
    expect(result.switchedBack.profiles.roleplay).toEqual(result.before.profiles.roleplay);
    expect(result.numeric.profiles.roleplay.letter_spacing).toBe(-.5);
    expect(result.colored.text_colors.italics).toBe('#336699');
    expect(result.shaped.preferences.text_colors).toEqual(result.before.text_colors);
    expect(result.shaped.preferences.profiles.roleplay.avatar_shape).toBe('circle');
    expect(result.shapeReset.profiles.roleplay.avatar_shape).toBe(result.before.profiles.roleplay.avatar_shape);
    expect(result.rich.rich_message_floor_limit).toBe(150);
    expect(result.sidebar.labels).toEqual(['用户资料', '主题风格', '聊天显示', '关于 ElecKoi', '内置插件']);
    expect(result.sidebar.overflow).toBe(false);
    expect(result.sidebar.panel).toBeLessThanOrEqual(1120);
    expect(result.shells).toHaveLength(6);
    for (const shell of result.shells) {
      const detail = JSON.stringify(shell);
      expect(shell.shadow).toBe('none');
      expect(shell.expandedWidth, detail).toBe(shell.beforeWidth);
      expect(shell.expandedPanel, detail).toBe(shell.panelWidth);
      expect(shell.fill).toBe('rgba(0, 0, 0, 0)');
      expect(shell.padding).toBe('0px');
      expect(shell.material).toBe(false);
      expect(shell.titleSize).toBe('26px');
      expect(shell.titleWeight).toBe('760');
      expect(shell.panelLeft - shell.contentLeft, detail).toBeGreaterThanOrEqual(16);
      expect(shell.panelLeft - shell.contentLeft, detail).toBeLessThanOrEqual(72);
      expect(shell.panelRight, detail).toBeLessThanOrEqual(shell.contentRight);

      expect(shell.overflow).toBe(false);
    }
  } finally {
    const target = relative(tmpdir(), directory);
    if (!target || target.startsWith('..') || isAbsolute(target)) throw Error('Invalid probe cleanup target');
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
