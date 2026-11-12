// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageBubble } from '../helpers/officialMarkdown.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const message = { id: 'message-a', role: 'assistant', content: '合成正文', created_at: '2026-10-09T07:30:00+08:00', process: [{ kind: 'tool', toolName: 'synthetic-tool' }] };
let container, root;
const button = label => container.querySelector(`[aria-label="${label}"]`);
const tools = () => container.querySelector('.message-tools');
const tick = async ms => act(async () => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.dataset.eleckoiMobile = 'true';
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); delete document.documentElement.dataset.eleckoiMobile;
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('Android message toolbar', () => {
  it('keeps header clearance independent of the opening slide and still responds to layout resizing', async () => {
    let notify;
    vi.stubGlobal('ResizeObserver', class { constructor(callback) { notify = callback; } observe() {} disconnect() {} });
    await act(async () => root.render(<MessageBubble message={message} name="合成展示角色 - Example with ExtendedName" />));
    const article = container.querySelector('article');
    const content = article.querySelector('.message-content');
    let contentWidth = 249, toolsLeft = 296, slide = 0;
    Object.defineProperties(content, { offsetLeft: { get: () => 75 }, offsetWidth: { get: () => contentWidth } });
    Object.defineProperties(tools(), { offsetLeft: { get: () => toolsLeft }, offsetHeight: { get: () => 48 } });
    content.getBoundingClientRect = () => ({ right: 75 + contentWidth + slide });
    tools().getBoundingClientRect = () => ({ left: toolsLeft, height: 48 });
    const clearance = () => article.style.getPropertyValue('--mobile-message-tool-clearance');
    await act(async () => { notify(); vi.advanceTimersByTime(20); });
    expect(clearance()).toBe('34px');
    for (const translation of [390, -390, 0]) {
      slide = translation;
      content.style.transform = `translateX(${slide}px)`;
      await act(async () => { notify(); vi.advanceTimersByTime(20); });
      expect(clearance()).toBe('34px');
    }
    contentWidth = 279; toolsLeft = 310;
    await act(async () => { notify(); vi.advanceTimersByTime(20); });
    expect(clearance()).toBe('50px');
    expect(article.style.getPropertyValue('--mobile-message-tool-height')).toBe('48px');
  });

  it('reads toolbar geometry before writing and leaves unchanged clearance untouched', async () => {
    let notify;
    vi.stubGlobal('ResizeObserver', class { constructor(callback) { notify = callback; } observe() {} disconnect() {} });
    await act(async () => root.render(<MessageBubble message={message} name="合成角色" />));
    const article = container.querySelector('article'), content = article.querySelector('.message-content');
    const operations = [];
    Object.defineProperties(content, {
      offsetLeft: { get: () => { operations.push('read'); return 75; } },
      offsetWidth: { get: () => { operations.push('read'); return 249; } },
    });
    Object.defineProperties(tools(), {
      offsetLeft: { get: () => { operations.push('read'); return 296; } },
      offsetHeight: { get: () => { operations.push('read'); return 48; } },
    });
    const setProperty = article.style.setProperty.bind(article.style);
    article.style.setProperty = (...args) => { operations.push('write'); return setProperty(...args); };
    await act(async () => { notify(); vi.advanceTimersByTime(20); });
    expect(operations).toEqual(['read', 'read', 'read', 'read', 'write', 'write']);
    operations.length = 0;
    await act(async () => { notify(); vi.advanceTimersByTime(20); });
    expect(operations).not.toContain('write');
    expect(article.style.getPropertyValue('--mobile-message-tool-clearance')).toBe('34px');
  });

  it('fades the old controls before swapping and retains header clearance throughout closing', async () => {
    const onRegenerate = vi.fn();
    await act(async () => root.render(<MessageBubble message={message} name="合成角色" onRegenerate={onRegenerate} />));
    await act(async () => button('更多').click());
    expect(tools().classList.contains('swapping')).toBe(true);
    expect(container.querySelector('article').classList.contains('mobile-tools-reserved')).toBe(false);
    expect(button('重新生成')).toBeNull();
    await tick(124);
    expect(button('重新生成')).toBeNull();
    await tick(1);
    expect(button('更多')).toBeNull();
    expect(button('重新生成')).not.toBeNull();
    expect(container.querySelector('article').classList.contains('mobile-tools-reserved')).toBe(true);
    await tick(20);
    expect(tools().classList.contains('swapping')).toBe(false);
    await act(async () => button('重新生成').click());
    expect(onRegenerate).toHaveBeenCalledWith(message);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(tools().classList.contains('swapping')).toBe(true);
    expect(button('重新生成')).not.toBeNull();
    expect(container.querySelector('article').classList.contains('mobile-tools-reserved')).toBe(true);
    await tick(125);
    expect(button('更多')).not.toBeNull();
    expect(button('重新生成')).toBeNull();
    expect(container.querySelector('article').classList.contains('mobile-tools-reserved')).toBe(false);
    await tick(20);
    expect(tools().classList.contains('swapping')).toBe(false);
  });

  it('cancels an opening swap when an outside press arrives before the fade ends', async () => {
    await act(async () => root.render(<MessageBubble message={message} name="合成角色" />));
    await act(async () => button('更多').click());
    await tick(70);
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    await tick(250);
    expect(button('更多')).not.toBeNull();
    expect(button('复制')).toBeNull();
    expect(tools().classList.contains('swapping')).toBe(false);
    expect(container.querySelector('article').classList.contains('mobile-tools-reserved')).toBe(false);
  });

  it('opens process details through the existing action without a toolbar resize during the sheet entrance', async () => {
    const onOpenProcess = vi.fn();
    await act(async () => root.render(<MessageBubble message={message} name="合成角色" onOpenProcess={onOpenProcess} />));
    await act(async () => button('更多').click());
    await tick(150);
    await act(async () => button('查看过程').click());
    expect(onOpenProcess).toHaveBeenCalledWith(message);
    expect(tools().classList.contains('swapping')).toBe(false);
    expect(button('更多')).not.toBeNull();
    expect(button('查看过程')).toBeNull();
    await tick(150);
    expect(button('更多')).not.toBeNull();
  });

  it('releases and remeasures clearance when streaming temporarily removes the toolbar', async () => {
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class { observe(node) { observe(node); } disconnect() { disconnect(); } });
    await act(async () => root.render(<MessageBubble message={message} name="合成角色" />));
    await act(async () => button('更多').click());
    await tick(150);
    expect(observe).toHaveBeenCalledWith(tools());
    observe.mockClear(); disconnect.mockClear();
    await act(async () => root.render(<MessageBubble message={{ ...message, pending: true }} name="合成角色" />));
    expect(tools()).toBeNull();
    expect(container.querySelector('article').classList.contains('mobile-tools-reserved')).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<MessageBubble message={message} name="合成角色" />));
    expect(observe).toHaveBeenCalledWith(tools());
  });

  it('swaps immediately with reduced motion and preserves contributed actions', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const onPlugin = vi.fn();
    await act(async () => root.render(<MessageBubble message={message} name="合成角色" pluginActions={<button aria-label="扩展操作" onClick={onPlugin}>扩展</button>} />));
    await act(async () => button('更多').click());
    expect(button('复制')).not.toBeNull();
    expect(button('更多')).toBeNull();
    expect(tools().classList.contains('swapping')).toBe(false);
    await act(async () => button('扩展操作').click());
    expect(onPlugin).toHaveBeenCalledTimes(1);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(button('更多')).not.toBeNull();
  });

  it('keeps the PC toolbar immediate and its existing toggle available', async () => {
    document.documentElement.dataset.eleckoiMobile = 'false';
    await act(async () => root.render(<MessageBubble message={message} name="合成角色" />));
    await act(async () => button('更多').click());
    expect(button('复制')).not.toBeNull();
    expect(button('更多')).not.toBeNull();
    expect(tools().classList.contains('swapping')).toBe(false);
    expect(container.querySelector('article').classList.contains('mobile-tools-reserved')).toBe(false);
    await act(async () => button('更多').click());
    expect(button('复制')).toBeNull();
  });
});
