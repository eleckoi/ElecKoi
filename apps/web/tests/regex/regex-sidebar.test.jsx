// @vitest-environment jsdom
import React, { act } from 'react';
import { editorVersionsFixture } from '../helpers/editorLibraryVersions.js';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { RegexRulesPanel } from '../../src/modules/regex/components/RegexRulesPanel.jsx';
import { createRegexRule } from '../../src/modules/regex/model/regexRulesEditing.js';

vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

describe('regex sidebar integration', () => {
  it('uses the shared sidebar and still saves edits to the selected rule', async () => {
    const collection = createRegexRule({ globalRules: [], agentPresetRules: [], characterRules: [] }, 'Character').collection;
    const model = {
      getSnapshot: () => ({ status: 'ready', value: collection }), subscribe: () => () => {}, read: async () => collection,
      save: vi.fn(async value => value),
    };
    model.editor = vi.fn(() => model);
    model.versions = editorVersionsFixture('regex', () => model.read(), async values => [await model.save(values[0])], model.subscribe);
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1400 });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<RegexRulesPanel characterId="synthetic-character" regexRules={model} />));
      await act(async () => container.querySelector('.regex-rule-row').click());
      expect(container.querySelector('[role="separator"]').getAttribute('aria-valuenow')).toBe('480');
      expect(container.querySelector('.setting-document-heading')).toBeTruthy();
      expect(container.querySelectorAll('.setting-library-save-button')).toHaveLength(1);
      const name = container.querySelector('.setting-document-heading input');
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(name, '合成规则');
        name.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => [...container.querySelectorAll('button')].find(item => item.textContent === '保存').click());
      expect(model.save.mock.lastCall[0].characterRules[0].name).toBe('合成规则');
      await act(async () => container.querySelector('.rs-directory-content').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
      expect(container.querySelector('.setting-document-empty')).toBeTruthy();
      expect(container.querySelector('.setting-directory .setting-library-save-button')).toBeTruthy();
    } finally {
      await act(async () => root.unmount());
      measure.mockRestore();
      container.remove();
    }
  });
});
