import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { PresetPromptEditor, shouldConfirmHiddenTimelineDisable } from '../src/renderer/src/modules/presets/components/PresetPromptEditor.jsx';
import { PresetRegexEditor } from '../src/renderer/src/modules/presets/components/PresetRegexEditor.jsx';
import { PresetToolsEditor } from '../src/renderer/src/modules/presets/components/PresetToolsEditor.jsx';
import { PresetProfileHeader } from '../src/renderer/src/modules/presets/components/PresetProfileHeader.jsx';
import { buildPresetListSections, presetListContextActions, shouldShowPresetCatalogLoading } from '../src/renderer/src/modules/presets/components/PresetPanel.jsx';
import { createEntryDraft } from '../src/renderer/src/modules/settingLibraries/model/settingLibraryEditing.js';
import { SettingLibraryInspector } from '../src/renderer/src/modules/settingLibraries/components/SettingLibraryInspector.jsx';
import { TrashIcon } from '../src/renderer/src/ui/icons/index.jsx';

vi.mock('../src/renderer/src/modules/settingLibraries/index.js', async () => {
  const drafts = await import('../src/renderer/src/modules/settingLibraries/model/settingLibraryEditing.js');
  return { ...drafts, ConfirmationDialog: () => null, SettingEntryGlyph: () => React.createElement('svg'), SettingLibraryInspector: () => null };
});
vi.mock('../src/renderer/src/modules/regex/index.js', () => ({ RegexRuleInspector: () => null, newRegexId: () => crypto.randomUUID() }));

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());
const preset = { id: 'test', name: '测试', groups: [], entries: [], regexRules: [], expandedGroupIds: [], promptPositions: [], activeVersionId: '' };
const props = { preset, onChange: () => {}, saveAction: null };

describe('preset list consistency', () => {
  it('uses the Agent preset title in the sidebar', () => {
    const source = readFileSync(new URL('../src/renderer/src/modules/presets/components/PresetPanel.jsx', import.meta.url), 'utf8');
    expect(source).toContain('<h2>Agent预设</h2>');
    expect(source).not.toContain('<h2>预设</h2>');
  });

  it('stops showing the loading row after an empty-group catalog is loaded', () => {
    expect(shouldShowPresetCatalogLoading(null, '')).toBe(true);
    expect(shouldShowPresetCatalogLoading({ groups: [], presets: [] }, '')).toBe(false);
  });

  it('shows all presets first without inventing a built-in group', () => {
    const groups = [{ id: 'custom-group', name: '收藏' }];
    const presets = [
      { id: 'builtin', libraryGroupId: '' },
      { id: 'custom', libraryGroupId: '' },
    ];
    const sections = buildPresetListSections(groups, presets);
    expect(sections.map((section) => section.name)).toEqual(['全部预设', '收藏']);
    expect(sections[0].presets.map((item) => item.id)).toEqual(['builtin', 'custom']);
  });

  it('keeps model tags stable while the activation control stays in its own header slot', () => {
    const profilePreset = { ...preset, modelTags: [{ id: 'general', label: '通用' }], profile: { authorName: '', authorAvatarPath: '' } };
    const inactive = renderToStaticMarkup(<PresetProfileHeader preset={profilePreset} active={false} onActivate={() => {}} onEdit={() => {}} />);
    const active = renderToStaticMarkup(<PresetProfileHeader preset={profilePreset} active onActivate={() => {}} onEdit={() => {}} />);
    expect(inactive).toContain('preset-profile-hero-tags');
    expect(inactive).toContain('preset-profile-use');
    expect(active).toContain('preset-profile-hero-tags');
    expect(active).toContain('preset-profile-active');
  });

  it('scopes preset manager avatar sizing without stretching the delete marker', () => {
    const css = readFileSync(new URL('../src/renderer/src/modules/presets/styles/preset-panel.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.preset-manager-card-open\s*>\s*\.preset-manager-avatar\s*\{/);
    expect(css).not.toMatch(/\.preset-manager-card-open\s*>\s*span\s*\{/);
    expect(css).toMatch(/\.preset-manager-card-open\s*\{[^}]*width:\s*100%;/s);
  });

  it('uses the shared delete icon throughout preset surfaces', () => {
    const presetComponents = [
      'PresetPanel.jsx',
      'PresetIntroductionEditor.jsx',
      'PresetPromptEditor.jsx',
      'PresetRegexEditor.jsx',
    ];
    for (const file of presetComponents) {
      const source = readFileSync(new URL(`../src/renderer/src/modules/presets/components/${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/import\s*\{[^}]*\bTrash\b[^}]*\}\s*from\s*['"]@phosphor-icons\/react['"]/s);
      expect(source, file).toContain('TrashIcon');
    }
  });

  it('offers icon actions for activation and removable preset deletion', () => {
    const actions = presetListContextActions({ id: 'custom' }, 'active', () => {}, () => {});
    expect(actions.map((action) => action.label)).toEqual(['使用此预设', '删除预设']);
    expect(actions.every((action) => typeof action.icon === 'object' || typeof action.icon === 'function')).toBe(true);
    expect(actions.find((action) => action.label === '删除预设')?.icon).toBe(TrashIcon);
    expect(presetListContextActions({ id: 'agent-preset-standard' }, 'agent-preset-standard', () => {}, () => {})).toEqual([]);
  });

  it.each([
    [PresetPromptEditor, '还没有预设提示词', '预设提示词列表'],
    [PresetRegexEditor, '还没有预设正则', '预设正则列表'],
  ])('uses the shared muted, centered empty state and a keyboard-focusable list', (Editor, empty, label) => {
    const html = renderToStaticMarkup(<Editor {...props} />);
    expect(html).toContain(`<p class="setting-library-empty">${empty}</p>`);
    expect(html).toContain(`tabindex="0" aria-label="${label}"`);
  });

  it('keeps prompt rows to an open action and a switch, without an inline delete button', () => {
    const entry = { ...createEntryDraft('', 1, []), title: '角色核心', enabled: true };
    const html = renderToStaticMarkup(<PresetPromptEditor {...props} preset={{ ...preset, entries: [entry] }} />);
    const row = html.slice(html.indexOf('class="preset-prompt-row'));
    expect(row.match(/<button\b/g)).toHaveLength(2);
    expect(row).toContain('preset-prompt-open');
    expect(row).toContain('role="switch" aria-checked="true"');
    expect(row).not.toContain('删除');
    expect(row).not.toContain('复制');
  });

  it('pins the two preset-owned runtime prompts above ordinary prompts', () => {
    const ordinary = { ...createEntryDraft('', 1, []), id: 'ordinary', title: '普通提示词', treeViewOrder: 1 };
    const hidden = { ...createEntryDraft('', 1, []), id: 'built-in-hidden-tool-timeline', title: '隐藏工具时间线', kind: 'hidden_tool_timeline', treeViewOrder: Number.MIN_SAFE_INTEGER };
    const compaction = { ...createEntryDraft('', 1, []), id: 'built-in-roleplay-history-compaction', title: '自动压缩摘要模板', kind: 'history_compaction', treeViewOrder: Number.MIN_SAFE_INTEGER + 1 };
    const html = renderToStaticMarkup(<PresetPromptEditor {...props} preset={{ ...preset, entries: [ordinary, compaction, hidden] }} />);
    expect(html.indexOf('隐藏工具时间线')).toBeLessThan(html.indexOf('自动压缩摘要模板'));
    expect(html.indexOf('自动压缩摘要模板')).toBeLessThan(html.indexOf('普通提示词'));
  });

  it('keeps hidden tool timeline as a full setting editor and confirms before disabling it', () => {
    const hidden = {
      ...createEntryDraft('', 1, []),
      id: 'built-in-hidden-tool-timeline',
      title: '隐藏工具时间线',
      iconId: 'timeline',
      kind: 'hidden_tool_timeline',
      position: 'after_tool_flow',
    };
    const html = renderToStaticMarkup(<SettingLibraryInspector
      selected={{ kind: 'entry', value: hidden }}
      library={{ ...preset, entries: [hidden], promptPositions: [] }}
      nameInputRef={{ current: null }}
      SelectedIcon={() => React.createElement('svg')}
      onClose={() => {}}
      onUpdateEntry={() => {}}
      onEntriesChange={() => {}}
      onOpenEntry={() => {}}
      onPromptPositionsChange={() => {}}
    />);

    expect(html).toContain('aria-label="设定编辑区域"');
    expect(html).toContain('>触发<');
    expect(html).toContain('>插入<');
    expect(html).not.toContain('时间线协议');
    expect(shouldConfirmHiddenTimelineDisable(hidden, false)).toBe(true);
    expect(shouldConfirmHiddenTimelineDisable(hidden, true)).toBe(false);
    expect(shouldConfirmHiddenTimelineDisable({ ...hidden, id: 'ordinary', kind: 'normal' }, false)).toBe(false);
  });

  it('keeps regex rows to an accessible open action and a switch without overflow actions', () => {
    const rule = { id: 'rule', name: '隐藏状态栏', enabled: true, pattern: '', replacement: '' };
    const html = renderToStaticMarkup(<PresetRegexEditor {...props} preset={{ ...preset, regexRules: [rule] }} />);
    const row = html.slice(html.indexOf('class="preset-regex-row'));
    expect(row.match(/<button\b/g)).toHaveLength(2);
    expect(row).toContain('preset-regex-open');
    expect(row).toContain('role="switch" aria-checked="true"');
    expect(row).not.toContain('删除');
    expect(row).not.toContain('复制');
  });

  it('visually marks disabled regex rules without disabling their controls', () => {
    const html = renderToStaticMarkup(<PresetRegexEditor {...props} preset={{ ...preset, regexRules: [{ id: 'off', name: '停用', pattern: '', replacement: '', enabled: false }] }} />);
    expect(html).toContain('preset-regex-row is-disabled');
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('disabled=""');
  });

  it('shows only tool groups included by the preset and uses add instead of new', () => {
    const toolGroups = [
      { id: 'builtin:variables', name: '剧情变量', description: '读取剧情变量', source: 'built_in', enabled: true, members: [{ name: 'read_variables', description: '' }] },
      { id: 'builtin:web', name: '联网搜索', description: '搜索最新信息', source: 'built_in', enabled: false, members: [{ name: 'web_search', description: '' }] },
    ];
    const html = renderToStaticMarkup(<PresetToolsEditor {...props} preset={{ ...preset, toolGroups }} />);
    expect(html).toContain('placeholder="搜索工具"');
    expect(html).toContain('>添加<');
    expect(html).toContain('剧情变量');
    expect(html).not.toContain('联网搜索');
    expect(html).toContain('预设自带');
    expect(html).toContain('role="switch" aria-checked="true"');
    expect(html).toContain('aria-label="关闭剧情变量"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('read_variables');
    expect(html).not.toContain('>新建<');
    expect(html).toContain('data-tool-group-icon="builtin:variables"');
  });

  it('keeps an included disabled tool visible so it can be re-enabled directly', () => {
    const toolGroups = [
      { id: 'builtin:variables', name: '剧情变量', description: '读取剧情变量', source: 'built_in', included: true, enabled: false, members: [] },
    ];
    const html = renderToStaticMarkup(<PresetToolsEditor {...props} preset={{ ...preset, toolGroups }} />);
    expect(html).toContain('preset-tool-row is-disabled');
    expect(html).toContain('剧情变量');
    expect(html).toContain('role="switch" aria-checked="false"');
    expect(html).toContain('aria-label="开启剧情变量"');
  });
});
