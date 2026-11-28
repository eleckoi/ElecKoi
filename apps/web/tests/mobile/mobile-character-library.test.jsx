// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { DisplayPreferencesProvider } from '../../src/modules/settings/model/DisplayPreferencesContext.jsx';
import { MobileCharacterLibraryBar } from '../../src/mobile/MobileCharacterLibraryBar.jsx';
import { sortMobileCharacters, useMobileCharacterSort } from '../../src/mobile/mobileCharacterSorting.js';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, save, handlers, capture;
beforeEach(() => {
  handlers = []; capture = new Set(); save = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 48, width: 100, height: 48 }));
  Element.prototype.setPointerCapture = id => capture.add(id);
  Element.prototype.hasPointerCapture = id => capture.has(id);
  Element.prototype.releasePointerCapture = id => capture.delete(id);
});
afterEach(async () => {
  if (root) await act(() => root.unmount()); root = null;
  document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function mount(element) { const node = document.createElement('div'); document.body.append(node); root = createRoot(node); await act(() => root.render(element)); }
async function click(selector) { await act(async () => document.querySelector(selector).click()); }
async function pointer(node, type, x = 30, y = 20) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'touch' } });
  await act(() => node.dispatchEvent(event));
}
function Bar() {
  const [groups, setGroups] = useState(['合成甲', '合成乙']), [open, setOpen] = useState(true);
  const view = { registerBackHandler: fn => { handlers.push(fn); return () => { handlers = handlers.filter(item => item !== fn); }; } };
  return <MainPageContext.Provider value={view}><main className="mobile-shell"><div className="mobile-character-library-body">
    <MobileCharacterLibraryBar groups={groups} characters={[]} selected="" onSelect={() => {}} sort="default" onSort={() => {}}
      open={open} onOpenChange={setOpen} onSave={async next => { await save(next); setGroups(next); }} />
  </div></main></MainPageContext.Provider>;
}
const chip = name => document.querySelector(`[data-reorder-group="${name}"] .mobile-character-library-group-chip`);

describe('mobile character library sorting and gestures', () => {
  it.each(['newest', 'oldest', 'edited'])('sorts real local %s metadata, places unknown history last and keeps source order for ties', mode => {
    const a = { id: 'a', addedAtEpochMs: 10, editedAtEpochMs: 40 }, b = { id: 'b', addedAtEpochMs: 30, editedAtEpochMs: 20 };
    const unknown = { id: 'u', name: '1', orderIndex: 100000 }, tied = { id: 't', addedAtEpochMs: 30, editedAtEpochMs: 20 };
    const input = [a, unknown, b, tied];
    expect(sortMobileCharacters(input, mode, 'zh-CN').map(item => item.id)).toEqual(mode === 'newest' ? ['b', 't', 'a', 'u'] : ['a', 'b', 't', 'u']);
    expect(input.map(item => item.id)).toEqual(['a', 'u', 'b', 't']);
    expect(sortMobileCharacters(input, 'default')).toBe(input);
  });
  it('orders all 1001 cards by the displayed name and retains first, middle and last long values', () => {
    const items = Array.from({ length: 1001 }, (_, index) => ({ id: `${index}`, name: `合成角色 ${1000 - index} ${'资料'.repeat(1000)}`, persona: { assistant_name: '角色扮演名称' } }));
    const sorted = sortMobileCharacters(items, 'name', 'zh-CN');
    expect(sorted).toHaveLength(1001);
    expect([sorted[0].id, sorted[500].id, sorted[1000].id]).toEqual(['1000', '500', '0']);
    expect(sorted[500].name).toBe(items[500].name);
  });
  it('persists the mobile sort preference, restores it on remount and exposes failed persistence', async () => {
    let snapshot = { status: 'ready', ui: { retained: 'value', mobile_character_sort: 'oldest' } };
    const listeners = new Set();
    const model = { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => snapshot,
      updateUi: vi.fn(async update => { snapshot = { ...snapshot, ui: update(snapshot.ui) }; listeners.forEach(fn => fn()); }) };
    function Sort() { const { sort, chooseSort, error } = useMobileCharacterSort(); return <><output>{sort}</output><button onClick={() => chooseSort('edited')}>Change</button><p role="alert">{error}</p></>; }
    const component = <DisplayPreferencesProvider model={model}><Sort /></DisplayPreferencesProvider>;
    await mount(component); expect(document.querySelector('output').textContent).toBe('oldest');
    await click('button'); expect(snapshot.ui).toEqual({ retained: 'value', mobile_character_sort: 'edited' });
    await act(() => root.unmount()); root = null; await mount(component);
    expect(document.querySelector('output').textContent).toBe('edited');
    model.updateUi.mockRejectedValueOnce(new Error('Synthetic preference failure'));
    await click('button'); expect(document.querySelector('[role=alert]').textContent).toContain('Synthetic preference failure');
  });
  it('lifts a single chip, hides the entire source, keeps editing locked and saves the drop on Done', async () => {
    await mount(<Bar />); await click('.mobile-character-library-edit-mode'); vi.useFakeTimers();
    await pointer(chip('合成乙'), 'pointerdown'); await act(() => vi.advanceTimersByTime(360));
    expect(document.querySelectorAll('.mobile-character-library-drag-ghost')).toHaveLength(1);
    expect(chip('合成乙').parentElement.classList.contains('is-dragging')).toBe(true);
    expect(document.querySelector('.mobile-character-library-drag-ghost').style.transform).toBe('');
    expect(capture.has(1)).toBe(true);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => chip('合成甲') });
    const panel = document.querySelector('.mobile-character-library-group-panel'); await pointer(panel, 'pointermove', 45, 35);
    await pointer(panel, 'pointerup', 45, 35);
    expect(document.querySelector('.mobile-character-library-drag-ghost')).toBeNull(); expect(capture.size).toBe(0);
    expect(save).not.toHaveBeenCalled();
    await act(() => handlers.at(-1)()); expect(document.querySelector('.mobile-character-library-panel-reveal.is-open')).toBeTruthy();
    await click('.mobile-character-library-edit-mode'); expect(save).toHaveBeenLastCalledWith(['合成乙', '合成甲']);
    expect(document.querySelector('.mobile-character-library-group-cell.is-dragging')).toBeNull();
  });
  it('cancels a gesture before or after lifting without leaving a floating chip or saving a reorder', async () => {
    await mount(<Bar />); await click('.mobile-character-library-edit-mode'); vi.useFakeTimers();
    const panel = document.querySelector('.mobile-character-library-group-panel');
    await pointer(chip('合成乙'), 'pointerdown'); await pointer(panel, 'pointercancel'); await act(() => vi.advanceTimersByTime(400));
    expect(document.querySelector('.mobile-character-library-drag-ghost')).toBeNull();
    await pointer(chip('合成乙'), 'pointerdown'); await act(() => vi.advanceTimersByTime(360));
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => chip('合成甲') });
    await pointer(panel, 'pointermove', 45, 35); await pointer(panel, 'pointercancel');
    await click('.mobile-character-library-edit-mode'); expect(save).not.toHaveBeenCalled();
    expect(document.querySelector('.mobile-character-library-drag-ghost')).toBeNull();
  });
  it('scrolls an editing panel before the long-press threshold without starting a reorder', async () => {
    await mount(<Bar />); await click('.mobile-character-library-edit-mode'); vi.useFakeTimers();
    const panel = document.querySelector('.mobile-character-library-group-panel'); panel.scrollTop = 100;
    await pointer(chip('合成乙'), 'pointerdown', 30, 80); await pointer(panel, 'pointermove', 30, 50); await pointer(panel, 'pointermove', 30, 30);
    expect(panel.scrollTop).toBe(150);
    await pointer(panel, 'pointerup', 30, 30); await act(() => vi.advanceTimersByTime(400));
    expect(document.querySelector('.mobile-character-library-drag-ghost')).toBeNull(); expect(capture.size).toBe(0);
    await click('.mobile-character-library-edit-mode'); expect(save).not.toHaveBeenCalled();
  });
});
