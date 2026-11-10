// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { VariableViewerDialog } from '../../src/modules/chat/components/VariableViewerDialog.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); });
it('shows missing historical data on the latest floor without displaying current variables or sending an error notification', async () => {
  const timeline = { id: 'synthetic-chat', status: 'ready', error: '', timeline: {
    current: { rawJson: '{"score":99}', root: { score: 99 }, errorMessage: '', topLevelCount: 1, valueCount: 1 },
    floors: [{ id: 'synthetic-reply', label: '第 1 楼', messagePreview: 'Synthetic reply', createdAt: '',
      state: { rawJson: '', root: null, errorMessage: '无历史状态', topLevelCount: 0, valueCount: 0 },
      changedValueCount: 0, changedPaths: [] }]
  } };
  const model = { readVariableConfiguration: async () => ({ versionId: '', versions: [] }), subscribeTimeline: () => () => {}, getTimelineSnapshot: () => timeline,
    openTimeline: async () => {}, closeTimeline: () => {} };
  const notify = vi.fn();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<VariableViewerDialog conversationId="synthetic-chat" conversationModel={model} onClose={() => {}} onNotify={notify} />));
  await act(async () => [...document.querySelectorAll('[role=tab]')].find(item => item.textContent === '历史快照').click());
  expect(document.querySelector('.vm-raw strong')?.textContent).toBe('无历史状态');
  expect(document.body.textContent).not.toContain('99');
  expect(document.body.textContent).not.toContain('score');
  expect(notify).not.toHaveBeenCalled();
});
