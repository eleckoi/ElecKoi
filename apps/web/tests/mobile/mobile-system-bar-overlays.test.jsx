// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal, ImageLightbox } from '@deepseek-ai/dsh-client-ui-primitives';
import { ConfirmationDialog } from '../../src/ui/ui/ConfirmationDialog.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => {
  if (root) await act(() => root.unmount());
  root = null; document.body.replaceChildren();
  document.getElementById('synthetic-portal-css')?.remove();
  delete window.ElecKoiPlatform; delete window.ElecKoiAndroid;
  vi.restoreAllMocks();
});

function bridge() {
  const appearances = [];
  const style = document.createElement('style'); style.id = 'synthetic-portal-css';
  style.textContent = 'body > [role="presentation"],body > [role="dialog"][aria-modal="true"] { position:fixed;inset:0;z-index:1000 }'
    + 'body > [role="presentation"] > [aria-hidden="true"],body > [role="dialog"][aria-modal="true"] > div > [aria-hidden="true"] { position:absolute;inset:0;background-color:rgba(0,0,0,0.25) }';
  document.head.append(style);
  const app = document.createElement('div'); app.id = 'eleckoi-root';
  app.innerHTML = '<main class="mobile-shell" style="--mobile-system-bar-bg:#ffffff"></main>';
  document.body.append(app); document.documentElement.dataset.theme = 'light';
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    let bytes = [0, 0, 0];
    return { globalAlpha: 1, fillStyle: '#000000', clearRect() { bytes = [0, 0, 0]; },
      fillRect() {
        const value = this.fillStyle;
        const color = value.startsWith('#') ? value.slice(1).match(/../g).map(byte => parseInt(byte, 16)) : value.match(/[\d.]+/g).map(Number);
        const alpha = (color[3] ?? 1) * this.globalAlpha;
        bytes = color.slice(0, 3).map((value, index) => value * alpha + bytes[index] * (1 - alpha));
      }, getImageData() { return { data: new Uint8ClampedArray([...bytes, 255]) }; } };
  });
  window.ElecKoiAndroid = { appearance: (mode, surface) => appearances.push({ mode, surface }) };
  window.eval(readFileSync(resolve('apps/android/app/src/main/assets/platform-facade.js'), 'utf8'));
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  return appearances;
}

const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

describe('Android appearance adapter for unchanged official modals', () => {
  it('discovers the official body portal, composites a declared product mask and restores colors on closing', async () => {
    const appearances = bridge();
    const render = (official, product) => act(() => root.render(<>
      <Modal open={official} onClose={() => {}} title="合成插件安装" closeLabel="关闭">合成内容</Modal>
      <ConfirmationDialog open={product} title="合成确认" description="合成操作" onCancel={() => {}} onConfirm={() => {}} />
    </>));
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => pseudo === '::after' && element.parentElement?.getAttribute('role') === 'presentation'
      ? { backgroundColor: 'rgba(0,0,0,0.25)', opacity: '1' } : original(element));
    await render(true, false);
    await settle();
    expect(appearances.at(-1).surface).toBe('#bfbfbf');
    await render(true, true);
    const product = document.querySelector('.confirmation-overlay');
    product.style.cssText = 'background-color:rgba(0,0,0,0.5);z-index:1200';
    await settle();
    expect(appearances.at(-1).surface).toBe('#606060');
    await render(true, false); await settle();
    expect(appearances.at(-1).surface).toBe('#bfbfbf');
    const before = appearances.length;
    document.querySelector('.mobile-shell').append(document.createElement('p')); await settle();
    expect(appearances).toHaveLength(before);
    await render(false, false); await settle();
    expect(appearances.at(-1).surface).toBe('#ffffff');
  });

  it('discovers the official image portal and releases its mask at unmount', async () => {
    const appearances = bridge();
    await act(() => root.render(<ImageLightbox src="data:image/svg+xml,%3Csvg/%3E" alt="合成图片" labels={{ dialog: '图片预览', close: '关闭' }} onClose={() => {}} />));
    await settle(); expect(appearances.at(-1).surface).toBe('#bfbfbf');
    await act(() => root.unmount()); root = null;
    await settle(); expect(appearances.at(-1).surface).toBe('#ffffff');
  });
});
