import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const facade = readFileSync(new URL('../app/src/main/assets/platform-facade.js', import.meta.url), 'utf8');
const choices = readFileSync(new URL('../app/src/standard/assets/standard-choice-prompts.js', import.meta.url), 'utf8');
let dom, window, select, calls, changes;
const settle = async () => { for (let index = 0; index < 4; index++) await new Promise(resolve => setTimeout(resolve, 0)); };
const commands = action => calls.filter(call => call.method === 'nativeChoice' && call.args[0] === action);
function choose(ids, id = commands('show').at(-1).args[1]) {
  window.ElecKoiPlatform.browserCommand({ type: 'emit', payload: { event: 'eleckoi:platform-result', detail: {
    id, success: true, result: ids === null ? 'cancelled' : JSON.stringify(ids),
  } } });
}
async function open() {
  select.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  select.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await settle(); return commands('show').at(-1)?.args[2];
}
beforeEach(() => {
  dom = new JSDOM('<select><option value="same">合成甲</option><option value="same">合成乙</option></select>', {
    url: 'http://127.0.0.1:31001/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  window = dom.window; calls = []; changes = [];
  window.matchMedia = () => ({ matches: false });
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, fillRect() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) });
  window.ElecKoiAndroidTransport = { invoke(method, input) { calls.push({ method, args: JSON.parse(input) }); return JSON.stringify({ success: true, result: null }); } };
  select = window.document.querySelector('select');
  for (const type of ['input', 'change']) select.addEventListener(type, () => changes.push(type));
  window.eval(facade); window.eval(choices);
});
afterEach(() => dom.window.close());

describe('standard Android choices through the real shared facade', () => {
  it('leaves select gestures and keyboard activation to embedded author documents', async () => {
    const frame = window.document.createElement('iframe');
    window.document.body.append(frame);
    const page = frame.contentWindow;
    page.document.body.innerHTML = '<select><option>合成作者选项</option></select>';
    page.ElecKoiAndroidTransport = window.ElecKoiAndroidTransport;
    page.eval(facade); page.eval(choices);
    const authorSelect = page.document.querySelector('select');
    for (const event of [
      new page.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
      new page.MouseEvent('click', { bubbles: true, cancelable: true }),
      new page.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    ]) {
      authorSelect.dispatchEvent(event);
      expect(event.defaultPrevented, event.type).toBe(false);
    }
    await settle();
    expect(commands('show')).toHaveLength(0);
  });
  it('replaces pointer and click defaults once and selects by option identity despite duplicate values', async () => {
    const payload = await open();
    expect(commands('show')).toHaveLength(1);
    expect(window.document.documentElement.dataset.eleckoiBrowser).toBe('standard');
    choose([payload.choices.find(item => item.label === '合成乙').id]); await settle();
    expect(select.selectedIndex).toBe(1); expect(select.value).toBe('same');
    expect(changes).toEqual(['input', 'change']);
  });
  it('cancels without changing the value and keeps option IDs stable when reopened', async () => {
    const first = await open(); choose(null); await settle();
    expect(select.selectedIndex).toBe(0); expect(changes).toEqual([]);
    const second = await open(); expect(second.choices.map(item => item.id)).toEqual(first.choices.map(item => item.id));
    choose([second.choices.find(item => item.selected).id]); await settle(); expect(changes).toEqual([]);
  });
  it('stops observing before a change handler rerenders the completed select', async () => {
    select.addEventListener('change', () => { select.options[1].label = '合成已更新标题'; });
    const payload = await open();
    choose([payload.choices.find(item => item.label === '合成乙').id]); await settle();
    expect(changes).toEqual(['input', 'change']);
    expect(commands('update')).toHaveLength(0);
  });
  it('sends disabled groups and options and retains already selected disabled multiple choices', async () => {
    select.multiple = true;
    select.innerHTML = '<option value="alpha" selected>合成甲</option><option value="beta">合成乙</option><optgroup label="合成停用组" disabled><option value="locked" selected>合成已选停用项</option><option value="unavailable">合成未选停用项</option></optgroup>';
    const payload = await open(), group = payload.choices.find(item => item.label === '合成停用组');
    expect(payload.multiple).toBe(true); expect(group.disabled).toBe(true);
    expect(group.items.every(item => item.disabled)).toBe(true);
    choose([payload.choices.find(item => item.label === '合成甲').id, payload.choices.find(item => item.label === '合成乙').id,
      group.items.find(item => item.selected).id]); await settle();
    expect([...select.selectedOptions].map(option => option.value)).toEqual(['alpha', 'beta', 'locked']);
    expect(changes).toEqual(['input', 'change']);
  });
  it('updates an open picker from real option mutations and resolves the new option ID', async () => {
    const original = await open();
    const added = new window.Option('合成新增项', 'new'); select.append(added); await settle();
    const updated = commands('update').at(-1).args[2];
    expect(updated.choices.find(item => item.label === '合成甲').id).toBe(original.choices.find(item => item.label === '合成甲').id);
    choose([updated.choices.find(item => item.label === '合成新增项').id]); await settle();
    expect(select.value).toBe('new'); expect(changes).toEqual(['input', 'change']);
  });
  it('dismisses removed or disabled controls and rejects unknown response IDs', async () => {
    await open(); select.disabled = true; await settle(); expect(commands('dismiss')).toHaveLength(1);
    choose(null); await settle(); select.disabled = false;
    await open(); choose(['unknown-option']); await settle();
    expect(select.selectedIndex).toBe(0); expect(changes).toEqual([]);
    expect(calls.some(call => call.method === 'reportError' && call.args[0].includes('unavailable option'))).toBe(true);
    await open(); select.remove(); await settle(); expect(commands('dismiss')).toHaveLength(2);
  });
  it('supports keyboard opening, ignores disabled controls and does not install twice', async () => {
    window.eval(choices);
    select.disabled = true; await open(); expect(commands('show')).toHaveLength(0);
    select.disabled = false;
    const arrow = new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    select.dispatchEvent(arrow); expect(arrow.defaultPrevented).toBe(false);
    const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    select.dispatchEvent(enter); await settle(); expect(enter.defaultPrevented).toBe(true); expect(commands('show')).toHaveLength(1);
    window.dispatchEvent(new window.Event('pagehide')); await settle(); expect(commands('dismiss')).toHaveLength(1);
  });
});
