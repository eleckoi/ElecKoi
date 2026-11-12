// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PresetProfileHeader } from '../../src/modules/presets/components/PresetProfileHeader.jsx';
import { PresetIntroductionEditor } from '../../src/modules/presets/components/PresetIntroductionEditor.jsx';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';
import { changeEditorText, editorText } from '../helpers/editorText.js';

vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
afterAll(() => vi.unstubAllGlobals());
const roots = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.replaceChildren();
});

const preset = {
  id: 'preset-layout', name: '测试预设', modelTags: [{ id: 'general', label: '通用' }],
  profile: { authorName: '测试作者', authorAvatarPath: '', usageInstructions: '选择角色后开始对话。', timeline: [] },
};

async function mount(element) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return { container, root };
}

const composerAction = label => [...document.querySelectorAll('.preset-content-composer button, .mobile-overlay-primary')].find(button => button.textContent === label);

describe('preset profile grouping', () => {
  it('keeps activation next to the name in the identity group for both states', async () => {
    const { container, root } = await mount(<PresetProfileHeader preset={preset} active={false} onActivate={() => {}} onEdit={() => {}} />);
    const heading = container.querySelector('.preset-profile-hero-heading');
    expect(heading.querySelector('h1').textContent).toBe(preset.name);
    expect(heading.querySelector('.preset-profile-hero-actions button').textContent).toBe('使用此预设');
    expect(container.querySelector('header > .preset-profile-use')).toBeNull();
    const tags = container.querySelector('.preset-profile-hero-tags');

    await act(async () => root.render(<PresetProfileHeader preset={preset} active onActivate={() => {}} onEdit={() => {}} />));
    expect(heading.querySelector('.preset-profile-hero-actions .preset-profile-active').textContent).toBe('使用中');
    expect(heading.querySelector('.preset-profile-use')).toBeNull();
    expect(container.querySelector('.preset-profile-hero-tags')).toBe(tags);
    expect(tags.textContent).toBe('通用');
  });

  it('preserves activation and profile editing without changing the model tags', async () => {
    const onActivate = vi.fn();
    const onEdit = vi.fn();
    const { container } = await mount(<PresetProfileHeader preset={preset} active={false} onActivate={onActivate} onEdit={onEdit} />);
    await act(async () => container.querySelector('.preset-profile-use').click());
    await act(async () => container.querySelector('[aria-label="编辑预设资料"]').click());
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(preset.modelTags).toEqual([{ id: 'general', label: '通用' }]);
  });

  it('retains the activation slot when there are no model tags and exposes the full name', async () => {
    const name = '测试预设名称'.repeat(12);
    const { container } = await mount(<PresetProfileHeader preset={{ ...preset, name, modelTags: [] }} active onEdit={() => {}} />);
    expect(container.querySelector('h1').title).toBe(name);
    expect(container.querySelector('.preset-profile-hero-actions').textContent).toBe('使用中');
    expect(container.querySelector('.preset-profile-hero-tags')).toBeNull();
  });

  it('uses a bounded two-column header with wrapping actions and visible keyboard focus', () => {
    const css = readFileSync(resolve('apps/web/src/modules/presets/styles/preset-panel.css'), 'utf8');
    const hero = css.match(/\.preset-profile-hero\s*\{([^}]+)\}/)?.[1];
    expect(hero).toContain('grid-template-columns: var(--preset-hero-avatar-size) minmax(0, 1fr);');
    expect(hero).toContain('border: 1px solid var(--line-strong);');
    expect(css).toMatch(/\.preset-profile-hero-heading\s*\{[^}]*flex-wrap: wrap;/s);
    expect(css).toMatch(/\.preset-profile-hero button:focus-visible\s*\{[^}]*outline:/s);
  });
});

describe('preset introduction regions', () => {
  it.each([false, true])('edits an existing record directly and reopens the saved record without adding a duplicate (compact=%s)', async compact => {
    const original = [
      { id: 'synthetic-latest', title: '合成新版记录', dateLabel: '2026-10-18', note: '合成新版内容' },
      { id: 'synthetic-earlier', title: '合成旧版记录', dateLabel: '2026-10-09', note: '合成旧版内容' },
    ];
    let stored = { ...preset.profile, timeline: original };
    const saves = vi.fn();
    function Editor() {
      const [profile, setProfile] = React.useState(stored);
      return <EditorPresentationContext.Provider value={{ compact }}><PresetIntroductionEditor
        preset={{ ...preset, profile }} saving={false} error="" onClearError={() => {}}
        onSaveProfile={async patch => { saves(patch); stored = { ...profile, ...patch }; setProfile(stored); return true; }}
      /></EditorPresentationContext.Provider>;
    }
    const { container, root } = await mount(<Editor />);
    await act(() => container.querySelector('[aria-label="编辑更新：合成旧版记录"]').click());
    expect(container.querySelector('[aria-label="更新标题"]').value).toBe('合成旧版记录');
    for (const [label, value] of [['更新标题', '修订后的合成旧版记录'], ['更新日期', '2026-10-10'], ['更新内容', '修订后的合成内容']]) {
      await act(() => {
        const field = container.querySelector(`[aria-label="${label === '更新内容' ? '更新内容输入区' : label}"]`);
        changeEditorText(field, value);
      });
    }
    await act(() => container.querySelector('.preset-content-composer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(saves).toHaveBeenCalledTimes(1);
    expect(stored.timeline).toEqual([original[0], { ...original[1], title: '修订后的合成旧版记录', dateLabel: '2026-10-10', note: '修订后的合成内容' }]);
    expect(original[1].note).toBe('合成旧版内容');
    await act(() => root.render(null));
    await act(() => root.render(<Editor />));
    expect(container.querySelectorAll('.preset-update-record')).toHaveLength(2);
    expect(container.querySelector('[aria-label="更新记录：修订后的合成旧版记录"]').textContent).toContain('修订后的合成内容');
  });

  it('keeps a failed existing-record edit available and cancels without changing saved content', async () => {
    const timeline = [{ id: 'synthetic-record', title: '合成更新', dateLabel: '2026-10-18', note: '合成原文' }];
    const onSaveProfile = vi.fn(async () => false);
    const { container } = await mount(<PresetIntroductionEditor preset={{ ...preset, profile: { ...preset.profile, timeline } }}
      saving={false} error="" onClearError={() => {}} onSaveProfile={onSaveProfile} />);
    await act(() => container.querySelector('[aria-label="编辑更新：合成更新"]').click());
    await act(() => {
      const field = container.querySelector('[aria-label="更新内容输入区"]');
      changeEditorText(field, '合成待保存内容');
    });
    await act(() => container.querySelector('button[type="submit"]').click());
    expect(editorText(container.querySelector('[aria-label="更新内容输入区"]'))).toBe('合成待保存内容');
    expect(onSaveProfile).toHaveBeenCalledTimes(1);
    await act(() => composerAction('取消').click());
    expect(container.querySelector('.preset-content-composer')).toBeNull();
    expect(container.querySelector('.preset-update-record p').textContent).toBe('合成原文');
    expect(timeline).toHaveLength(1);
  });

  it('contains the empty state and add action in the same update region', async () => {
    const { container } = await mount(<PresetIntroductionEditor preset={preset} saving={false} error="" onClearError={() => {}} onSaveProfile={async () => true} />);
    const region = container.querySelector('section[aria-label="更新记录"]');
    expect(region.classList.contains('preset-content-section')).toBe(true);
    expect(region.querySelector('h2').textContent).toBe('更新记录');
    expect(region.querySelector('button').textContent).toBe('添加更新');
    expect(region.querySelector('.preset-updates-empty').textContent).toBe('暂无更新记录');
    expect(container.querySelector('section[aria-label="使用说明"]').classList.contains('preset-content-section')).toBe(true);
  });

  it('keeps editing and saving inside the usage region with the existing save contract', async () => {
    const onSaveProfile = vi.fn(async () => true);
    const { container } = await mount(<PresetIntroductionEditor preset={preset} saving={false} error="" onClearError={() => {}} onSaveProfile={onSaveProfile} />);
    const region = container.querySelector('.preset-usage-section');
    await act(async () => region.querySelector('button').click());
    expect(region.querySelector('form')).not.toBeNull();
    expect(editorText(region.querySelector('[aria-label="使用说明输入区"]'))).toBe(preset.profile.usageInstructions);
    expect(composerAction('取消')).not.toBeUndefined();
    await act(async () => {
      changeEditorText(region.querySelector('[aria-label="使用说明输入区"]'), '修改后的使用说明。');
    });
    await act(async () => region.querySelector('button[type="submit"]').click());
    expect(onSaveProfile).toHaveBeenCalledWith({ usageInstructions: '修改后的使用说明。' });
    expect(region.querySelector('form')).toBeNull();
    expect(region.querySelector('.preset-usage-copy').textContent).toBe(preset.profile.usageInstructions);
  });

  it('centers the empty state within a bordered section instead of an unbounded canvas', () => {
    const css = readFileSync(resolve('apps/web/src/modules/presets/styles/preset-usage.css'), 'utf8');
    expect(css).toMatch(/\.preset-content-section\s*\{[^}]*border: 1px solid var\(--line-strong\);/s);
    expect(css).toMatch(/\.preset-updates-empty\s*\{[^}]*place-items: center;[^}]*text-align: center;/s);
    expect(css).toMatch(/\.preset-usage-section > \.preset-content-composer\s*\{[^}]*border: 0;[^}]*box-shadow: none;/s);
  });
});
