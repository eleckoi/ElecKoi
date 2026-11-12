// @vitest-environment jsdom
import { withRegexEditor } from '../helpers/regexEditorModel.js';
import React, { act } from 'react';
import { changeEditorText, editorText } from '../helpers/editorText.js';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingLibraryPanel } from '../../src/modules/settingLibraries/components/SettingLibraryPanel.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { VariableConfigPanel } from '../../src/modules/variables/components/VariableConfigPanel.jsx';
import { createObjectDraft } from '../../src/modules/variables/model/variableConfigEditing.js';
import { RegexRulesPanel } from '../../src/modules/regex/components/RegexRulesPanel.jsx';
import { createRegexRule } from '../../src/modules/regex/model/regexRulesEditing.js';

vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function modelFor(value) {
  return {
    getSnapshot: () => ({ status: 'ready', value }), subscribe: () => () => {}, read: async () => value,
    save: vi.fn(async (_id, next) => next), saveViewState: vi.fn().mockResolvedValue(undefined),
  };
}

async function fill(element, value) {
  await act(async () => {
    changeEditorText(element, value);
  });
}

const cases = [
  {
    name: 'setting library', prefix: 'setting-library', inspector: '.setting-settings-board',
    closeManager: '[aria-label="关闭设定库管理"]', closeInspector: '[aria-label="关闭编辑器"]',
    component() {
      const version = { id: 'version-a', name: '配置 A', groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: true,
        entries: [{ ...createEntryDraft('', 0, []), id: 'entry-a', title: '合成设定', content: '合成正文' }] };
      const model = modelFor({ ...version, characterId: 'synthetic-character', activeVersionId: version.id, versions: [version] });
      return <SettingLibraryPanel characterId="synthetic-character" settingLibraries={model} />;
    },
    async prepare(container) {
      await act(async () => container.querySelector('[role="treeitem"]').click());
      const tab = [...container.querySelectorAll('.setting-view-switch [role=tab]')].find(item => item.textContent === '设置');
      await act(async () => tab.click());
      return () => expect(tab.getAttribute('aria-selected')).toBe('true');
    },
  },
  {
    name: 'variable configuration', prefix: 'variable', inspector: '.vv-writing-board',
    closeManager: '[aria-label="关闭变量配置管理"]', closeInspector: '[aria-label="关闭编辑器"]',
    component() {
      const version = { id: 'version-a', name: '配置 A', initialStateJson: '{}', schemaCode: '', variables: [], expandedObjectIds: [],
        objects: [{ ...createObjectDraft({ objects: [], variables: [] }), id: 'group-a', name: '合成变量组' }] };
      const model = modelFor({ ...version, characterId: 'synthetic-character', activeVersionId: version.id, versions: [version] });
      return <VariableConfigPanel characterId="synthetic-character" variables={model} />;
    },
    async prepare(container) {
      const row = [...container.querySelectorAll('[role="treeitem"]')].find(item => item.textContent.includes('合成变量组'));
      await act(async () => row.click());
      await act(async () => [...container.querySelectorAll('[role=tab]')].find(tab => tab.textContent === '对象内容').click());
      const draft = container.querySelector('[aria-label=对象内容]');
      await fill(draft, '{"pending":');
      return () => expect(editorText(container.querySelector('[aria-label=对象内容]'))).toBe('{"pending":');
    },
  },
  {
    name: 'regex rules', prefix: 'regex', inspector: '.rs-test',
    closeManager: '.regex-manager [aria-label="关闭"]', closeInspector: '[aria-label="关闭详情"]',
    component() {
      const collection = createRegexRule({ globalRules: [], agentPresetRules: [], characterRules: [] }, 'Character').collection;
      return <RegexRulesPanel characterId="synthetic-character" regexRules={withRegexEditor(modelFor(collection))} />;
    },
    async prepare(container) {
      await act(async () => container.querySelector('.regex-rule-main').click());
      await act(async () => [...container.querySelectorAll('.rs-view-tabs [role=tab]')].find(tab=>tab.textContent==='测试').click());
      const draft = container.querySelector('[aria-label=测试输入]');
      await fill(draft, '合成测试文字');
      return () => expect(editorText(container.querySelector('[aria-label=测试输入]'))).toBe('合成测试文字');
    },
  },
];

describe('management dialog and editor sidebar', () => {
  it.each(cases)('keeps the $name editor mounted and preserves its state when management opens and closes', async (scenario) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1400 });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(scenario.component()));
      const checkDraft = await scenario.prepare(container);
      const paneSelector = '.setting-document';
      const pane = container.querySelector(paneSelector);
      const inspector = container.querySelector(scenario.inspector);
      inspector.scrollTop = 123;
      vi.useFakeTimers();

      for (const closeWithBackdrop of [false, true]) {
        if (scenario.name === 'setting library') {
          await act(async () => container.querySelector('[aria-label="设定库更多操作"]').click());
          await act(async () => [...document.querySelectorAll('[role=menuitem]')].find(button => button.textContent === '管理设定库').click());
        } else if (scenario.name === 'variable configuration') {
          await act(async () => container.querySelector('[aria-label=变量目录操作]').click());
          await act(async () => [...document.querySelectorAll('[role=menuitem]')].find(button => button.textContent === '管理版本与导入导出').click());
        } else {
          await act(async () => container.querySelector('[aria-label=正则目录操作]').click());
          await act(async () => [...document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='管理版本与导入导出').click());
        }
        expect(document.querySelector('.editor-management-modal')).toBeTruthy();
        expect(pane.classList.contains('is-closing')).toBe(false);
        await act(async () => vi.advanceTimersByTime(250));
        expect(container.querySelector(paneSelector)).toBe(pane);
        expect(container.querySelector(scenario.inspector)).toBe(inspector);
        checkDraft();

        await act(async () => {
          if (closeWithBackdrop) document.querySelector('.editor-management-modal').parentElement.querySelector(':scope > [aria-hidden="true"]').click();
          else document.querySelector('.editor-management-modal [aria-label="关闭"]').click();
        });
        expect(document.querySelector('.editor-management-modal')).toBeNull();
        expect(container.querySelector(paneSelector)).toBe(pane);
        expect(container.querySelector(scenario.inspector)).toBe(inspector);
        expect(inspector.scrollTop).toBe(123);
        checkDraft();
      }

    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
