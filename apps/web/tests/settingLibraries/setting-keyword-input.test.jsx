// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VisualPositionPicker } from '../../src/modules/settingLibraries/components/SettingEntryFields.jsx';
import { SettingLibraryDocument } from '../../src/modules/settingLibraries/components/SettingLibraryDocument.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, draft;
beforeEach(async () => {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  function Harness() {
    const [entry, setEntry] = useState(() => ({ ...createEntryDraft('', 1, []), id:'synthetic-entry', title:'合成条目', triggerMode:'agent_tool', agentReadStrategy:'keyword' }));
    draft = entry;
    return <SettingLibraryDocument selected={{kind:"entry",value:entry}} library={{entries:[entry],promptPositions:[]}} onUpdateEntry={setEntry} onEntriesChange={() => {}} />;
  }
  await act(async () => root.render(<Harness />));
  await act(async () => [...container.querySelectorAll('[role=tab]')].find(button=>button.textContent.includes('设置')).click());
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function fill(input, text) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles:true }));
  });
}
async function enter(input, isComposing=false) {
  const event=new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true,isComposing});
  await act(async () => input.dispatchEvent(event)); return event;
}

describe('Setting keyword input keyboard action', () => {
  it('keeps a scan depth above 1000 without clamping the authored value', async () => {
    const input = container.querySelector('input[aria-label="扫描深度"]');
    await fill(input, '10001');
    expect(draft.keywordScanDepth).toBe(10001);
    expect(input.hasAttribute('max')).toBe(false);
  });
  it('keeps a recursion depth above ten without clamping the authored value', async () => {
    await act(async () => container.querySelector('[role="switch"][aria-label="递归匹配"]').click());
    const input = container.querySelector('input[aria-label="递归次数"]');
    await fill(input, '20');
    expect(draft.keywordRecursionDepth).toBe(20);
    expect(input.hasAttribute('max')).toBe(false);
  });
  it('keeps insertion order above 9999 for large libraries', async () => {
    let changed;
    const entry = { ...draft, triggerMode: 'always', position: 'insert_point_1', order: 10001 };
    await act(async () => root.render(<VisualPositionPicker entry={entry} entries={[entry]} promptPositions={[]} onChange={value => { changed = value; }} onEntriesChange={() => {}} />));
    const input = container.querySelector('input[aria-label="位置内顺序"]');
    await fill(input, '10002');
    expect(changed.order).toBe(10002);
    expect(input.hasAttribute('max')).toBe(false);
  });
  it.each([{label:'触发关键词',field:'keywords'},{label:'附加关键词',field:'conditionKeywords'}])('$label commits repeated Enter actions without changing focus or creating duplicates on blur', async ({label,field}) => {
    const input=[...container.querySelectorAll('.setting-library-keyword-field')].find(node=>node.firstElementChild.textContent===label).querySelector('input');
    expect(input.getAttribute('enterkeyhint')).toBe('enter');
    input.focus();
    for(const text of ['合成甲','合成乙']) {
      await fill(input,text); expect((await enter(input)).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(input); expect(input.value).toBe('');
    }
    expect(draft[field]).toEqual(['合成甲','合成乙']);
    await act(async () => container.querySelector('input[aria-label="扫描深度"]').focus());
    expect(draft[field]).toEqual(['合成甲','合成乙']);
  });
  it('keeps an active composition intact until Enter is used to submit the completed keyword', async () => {
    const input=container.querySelector('.setting-library-keyword-field input'); input.focus();
    await fill(input,'合成关键词'); expect((await enter(input,true)).defaultPrevented).toBe(false);
    expect(draft.keywords).toEqual([]); expect(input.value).toBe('合成关键词');
    await enter(input); expect(draft.keywords).toEqual(['合成关键词']); expect(document.activeElement).toBe(input);
  });
});
