// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubagentSettingsLink } from '../../src/modules/agentTools/components/SubagentSettingsLink.jsx';
import { PresetToolsEditor } from '../../src/modules/presets/components/PresetToolsEditor.jsx';

vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('subagent settings navigation', () => {
  it('does not navigate or close its owner when a save reminder blocks opening', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    window.addEventListener('eleckoi:dsh-plugins:select', onSelect);

    try {
      await act(async () => root.render(<SubagentSettingsLink
        onBeforeOpen={() => false}
        onOpen={onOpen}
      />));
      await act(async () => container.querySelector('button').click());

      expect(onSelect).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('eleckoi:dsh-plugins:select', onSelect);
      await act(async () => root.unmount());
    }
  });

  it('keeps the collaboration dialog open while the save reminder owns Escape', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const preset = {
      id: 'preset-1',
      roleplayPlan: {},
      toolGroups: [{
        id: 'builtin:collaboration',
        name: '多代理协作',
        description: '创建和管理并行子任务',
        source: 'built_in',
        included: true,
        enabled: true,
        members: [],
      }],
    };
    const renderEditor = (savePromptOpen) => root.render(<PresetToolsEditor
      preset={preset}
      onChange={() => {}}
      onBeforeOpenSubagentSettings={() => false}
      savePromptOpen={savePromptOpen}
    />);

    try {
      await act(async () => renderEditor(false));
      await act(async () => container.querySelector('.preset-tool-summary').click());
      expect(document.body.querySelector('.preset-tools-modal')).toBeTruthy();

      await act(async () => renderEditor(true));
      await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      expect(document.body.querySelector('.preset-tools-modal')).toBeTruthy();

      await act(async () => renderEditor(false));
      await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      expect(document.body.querySelector('.preset-tools-modal')).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });
});
