// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterImportDialog } from '../../src/modules/persona/components/CharacterImportDialog.jsx';

let container, root;
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('FileReader', class {
    readAsDataURL() {
      this.result = 'data:application/json;base64,e30=';
      queueMicrotask(() => this.onload());
    }
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function prepare(importable, files = [new File(['{}'], 'synthetic-card.json', { type: 'application/json' })]) {
  const onImported = vi.fn(async () => {});
  const onPrepare = vi.fn(async () => ({ token: 'synthetic-import', items: [{
    id: 'item-1', name: 'Synthetic card', summary: 'Synthetic summary', imageAvailable: false,
    importable, errorMessage: importable ? '' : 'Invalid card structure',
    warnings: importable ? ['Variable rule could not be converted'] : [],
  }] }));
  await act(async () => root.render(<CharacterImportDialog onClose={vi.fn()}
    onImported={onImported} onPrepare={onPrepare} onDiscard={vi.fn(async () => {})} />));
  await act(async () => [...document.querySelectorAll('button')]
    .find(button => button.textContent.includes('酒馆角色卡')).click());
  const input = document.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { configurable: true,
    value: files });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(onPrepare).toHaveBeenCalledWith('sillytavern', files.map(file => ({ displayName: file.name,
    mimeType: 'application/json', base64: 'e30=' })));
  return { button: document.querySelector('.product-dialog-actions button:last-child'), onImported };
}

describe('character import warnings', () => {
  it('passes every selected file and its reported size beyond the former count and byte ceilings', async () => {
    const files = Array.from({ length: 101 }, (_, index) => {
      const file = new File(['{}'], `synthetic-card-${index}.json`, { type: 'application/json' });
      Object.defineProperty(file, 'size', { value: 64 * 1024 * 1024 + 1 });
      return file;
    });
    const { button } = await prepare(true, files);
    expect(button.disabled).toBe(false);
  });

  it('shows a conversion warning while allowing the valid card to import', async () => {
    const { button, onImported } = await prepare(true);
    expect(document.querySelector('.character-import-warning').textContent)
      .toBe('Variable rule could not be converted');
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(onImported).toHaveBeenCalledExactlyOnceWith('synthetic-import');
  });

  it('still blocks a structurally invalid card', async () => {
    const { button, onImported } = await prepare(false);
    expect(button.disabled).toBe(true);
    expect(document.body.textContent).toContain('Invalid card structure');
    expect(onImported).not.toHaveBeenCalled();
  });
});
