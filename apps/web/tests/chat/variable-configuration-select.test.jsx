// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { VariableConfigurationSelect } from '../../src/modules/chat/components/VariableConfigurationSelect.jsx';
let root, host;
afterEach(async () => { if (root) await act(async () => root.unmount());host?.remove();vi.unstubAllGlobals(); });
it('releases pending selection state when the client owner changes and ignores the previous save result', async () => {
  vi.stubGlobal('React', React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const versions = [{ id: 'a', name: '版本 A' }, { id: 'b', name: '版本 B' }];
  let finish;
  const old = { readVariableConfiguration: async () => ({ versionId: 'a', versions }),
    selectVariableVersion: vi.fn(() => new Promise(resolve => { finish = resolve; })) };
  const next = { readVariableConfiguration: async () => ({ versionId: 'a', versions }), selectVariableVersion: vi.fn() };
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  await act(async () => root.render(<VariableConfigurationSelect conversationId="synthetic" model={old} />));
  await act(async () => document.querySelector('.vm-config-trigger').click());
  await act(async () => [...document.querySelectorAll('[role=menuitemradio]')].find(item => item.textContent==='版本 B').click());
  expect(document.querySelector('.vm-config-trigger').disabled).toBe(true);
  await act(async () => root.render(<VariableConfigurationSelect conversationId="synthetic" model={next} />));
  expect(document.querySelector('.vm-config-trigger').disabled).toBe(false);
  await act(async () => finish({ versionId:'b',versions }));
  expect(document.querySelector('.vm-config-trigger').textContent).toBe('版本 A');
  expect(old.selectVariableVersion).toHaveBeenCalledExactlyOnceWith('synthetic','b','a');
});
