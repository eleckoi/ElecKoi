// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useEditorLibraryVersions } from '../../src/ui/hooks/useEditorLibraryVersions.js';

it.each([
  ['scripts', true], ['scripts', false], ['regex', true], ['regex', false],
])('preserves the saved %s library switch %s when importing and exporting a named version', async (kind, enabled) => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node), state = {}, applied = vi.fn();
  const content = kind === 'scripts' ? { enabled, variables: { setting: 3 }, files: [], trees: [
    { type: 'folder', id: 'synthetic-folder', name: 'Synthetic folder', enabled: false, icon: '', color: '', scripts: [
      { type: 'script', id: 'synthetic-script', name: 'Synthetic script', enabled: true, content: 'export default () => {};',
        info: '', data: {}, button: { enabled: false, buttons: [] }, export_with: { data: true, button: true } },
    ] },
  ] } : { enabled, rules: [{ id: 'synthetic-regex', name: 'Synthetic regex', pattern: 'ALPHA', replacement: 'BETA', targets: ['AiOutput'],
    enabled: false, displayOnly: true, promptOnly: false, runOnEdit: true, order: 0 }] };
  const initial = kind === 'scripts' ? { enabled: false, trees: [], variables: {}, files: [] } : { enabled: true, rules: [] };
  const current = { global: structuredClone(initial), character: structuredClone(initial) };
  const service = { subscribe: () => () => {}, read: vi.fn(async (scope, ownerId) => ({ kind, scope, ownerId, revision: 0,
    resourceRevision: kind === 'scripts' ? '0'.repeat(64) : '', activeVersionId: 'synthetic-default',
    versions: [{ id: 'synthetic-default', name: 'Default', content: JSON.stringify(initial) }] })) };
  function Harness() {
    state.versions = useEditorLibraryVersions({ kind, scope: 'character', ownerId: 'synthetic-character', service,
      capture: scope => current[scope], apply: (scope, value) => { current[scope] = value; applied(scope, value); }, editorDirty: false });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(state.versions.ready).toBe(true);
    await act(() => state.versions.importVersion('character', JSON.stringify({ format: 'eleckoi.editor-library-version',
      version: 1, kind, name: 'Imported', content: JSON.stringify(content) })));
    expect(current.character).toMatchObject(content);
    expect(current.global).toEqual(initial);
    expect(applied).toHaveBeenCalledTimes(1);
    const exported = JSON.parse(state.versions.exportVersion('character').json);
    expect(JSON.parse(exported.content)).toMatchObject(content);
    expect(state.versions.prepare().find(value => value.scope === 'character').activeVersionId).toBe(state.versions.current('character').activeVersionId);
  } finally { await act(() => root.unmount()); node.remove(); }
});
