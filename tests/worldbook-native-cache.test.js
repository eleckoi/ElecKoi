import { describe, expect, it, vi } from 'vitest';
import { NativeWorldbookAdapter, normalizeWorldbook, scanWorldbooks, freezeWorldbookRound, projectFrozenWorldbookMessages, worldbookVectorMatches } from '../packages/dsh-worldbook-compat/src/index.js';
import { projectRequestInput, requestProjectionSnapshot, sessionInstructions } from '../packages/dsh-client-roleplay/src/host/conversation-context.mjs';

const text = message => message.content.map(block => block.text ?? '').join('');
const message = (id, role, content) => ({ id, role, content: [{ type: 'text', text: content }], source: { kind: role === 'user' ? 'user' : 'model' } });
const rawEntry = (uid, depth) => ({ uid, comment: `Entry ${uid}`, constant: true, position: 4, role: 0, depth, content: `setting-${uid}` });
const fragment = (uid, depth) => ({ id: `book:${uid}`, worldbookPosition: 'at_depth', role: 'system', depth, order: uid, content: `setting-${uid}` });

describe('Tavern worldbook insertion in the native cache region', () => {
  it('preserves raw depths while assembling them before history through the existing native projection', async () => {
    const raw = { entries: [rawEntry(0, 0), rawEntry(1, 4), rawEntry(2, 99)] };
    const normalized = normalizeWorldbook(raw);
    expect(normalized.entries.map(entry => entry.position.depth)).toEqual([0, 4, 99]);
    const scan = await scanWorldbooks({ books: { book: normalized }, messages: ['old-user', 'old-answer'], scanText: 'latest',
      settings: { scanDepth: 1, budgetTokens: 1000 }, tokenCount: () => 1 });
    const context = { historyMode: 'prefix', history: [], worldbookRound: { fragments: scan.entries, examples: [], authorNote: { position: 'none' } } };
    const surface = [message('sys', 'system', 'native-system'), message('u1', 'user', 'old-user'),
      message('a1', 'assistant', 'old-answer'), message('u2', 'user', 'latest')];
    const projection = requestProjectionSnapshot(context);
    expect(projection.plan).toHaveLength(3);
    expect(projection.plan.every(entry => entry.anchor === 'insert_point_1' && entry.traceSource === '缓存设定区')).toBe(true);
    const actual = projectRequestInput(surface, projection, { instructions: sessionInstructions({ conversationContext: context }), currentPromptText: null });
    expect(actual.map(text)).toEqual(['native-system', 'setting-0', 'setting-1', 'setting-2', 'old-user', 'old-answer', 'latest']);
    expect(raw.entries.map(entry => entry.depth)).toEqual([0, 4, 99]);
  });

  it('uses the explicit cache index, never counts backwards through tool continuations', () => {
    const surface = ['system', 'old-user', 'old-answer', 'latest', 'tool-call', 'tool-result'];
    const result = projectFrozenWorldbookMessages(surface, [fragment(0, 0), fragment(1, 99)], {
      anchorIndexes: { cacheSettings: 1 }, createMessage: item => item.content,
    });
    expect(result).toEqual(['system', 'setting-0', 'setting-1', ...surface.slice(1)]);
    expect(() => projectFrozenWorldbookMessages(surface, [fragment(0, 0)], { anchorIndexes: {}, createMessage: item => item.content }))
      .toThrow('Prompt anchor');
  });

  it('retains keyword scan depth independently of insertion depth', async () => {
    const book = normalizeWorldbook({ entries: [1, 3].map((depth, uid) => ({ uid, content: `scan-${depth}`,
      strategy: { type: 'selective', keys: ['older-key'], scan_depth: depth }, position: { type: 'at_depth', depth: 99 } })) });
    const scan = await scanWorldbooks({ books: { book }, messages: ['older-key', 'recent', 'latest'], settings: { scanDepth: 1 }, tokenCount: () => 1 });
    expect(scan.entries.map(entry => entry.content)).toEqual(['scan-3']);
    expect(scan.entries[0].depth).toBe(99);
  });

  it('matches vectors by book and entry identity even when contents are identical', () => {
    const book = { entries: [{ uid: 0, content: 'same content', strategy: { type: 'vectorized' } }] };
    expect([...worldbookVectorMatches({ first: book, second: book }, [{ id: 'second:0', text: 'same content', score: 1 }], 1)]).toEqual(['second:0']);
  });

  it('freezes a round once and never saves timing or scans for a dry run', async () => {
    const adapter = { readTiming: () => ({}), atomic: operation => operation(), saveTiming: vi.fn(), saveLastScan: vi.fn() };
    const request = { conversationId: 'chat', books: { book: { entries: [rawEntry(0, 4)] } }, messages: ['history'],
      settings: { budgetTokens: 100 }, tokenCount: () => 1, messageCount: 1, dryRun: true };
    const round = await freezeWorldbookRound(adapter, request);
    request.books.book.entries[0].content = 'edited later';
    expect(round.entries[0].content).toBe('setting-0');
    expect(Object.isFrozen(round.entries[0])).toBe(true);
    expect(adapter.saveTiming).not.toHaveBeenCalled();
    expect(adapter.saveLastScan).not.toHaveBeenCalled();
    await freezeWorldbookRound(adapter, { ...request, dryRun: false });
    expect(adapter.saveTiming).toHaveBeenCalledOnce();
    expect(adapter.saveLastScan).toHaveBeenCalledOnce();
  });
});

function nativeHarness() {
  let native = { name: 'Native', entries: ['insert_point_1', 'insert_point_2', 'insert_point_4'].map((position, uid) => ({
    id: `native-${uid}`, title: `Native ${uid}`, kind: 'normal', content: `native-body-${uid}`, enabled: true,
    position, promptPositionId: uid === 2 ? 'custom' : '', triggerMode: 'always', insertRole: 'system', order: uid + 1,
  })) }, companion;
  const adapter = new NativeWorldbookAdapter({ readNative: () => structuredClone(native), saveNative: (_id, next) => { native = structuredClone(next); },
    readCompanion: () => companion, saveCompanion: (_id, next) => { companion = structuredClone(next); }, atomic: operation => operation() });
  return { adapter, read: () => native };
}

describe('native fixed placement through SDK worldbook edits', () => {
  it('does not transfer unchanged native entries to the compatibility scanner on a body edit', () => {
    const { adapter, read } = nativeHarness();
    const book = adapter.read('character');
    book.entries[0].content = 'edited native body';
    adapter.put('character', book);
    expect(read().entries.map(entry => [entry.position, entry.promptPositionId])).toEqual([
      ['insert_point_1', ''], ['insert_point_2', ''], ['insert_point_4', 'custom'],
    ]);
    expect(adapter.scanBook('character').entries).toEqual([]);
    expect(read().entries[0].content).toBe('edited native body');
  });

  it('retains native custom anchor when a strategy edit transfers activation to the scanner', async () => {
    const { adapter } = nativeHarness();
    const book = adapter.read('character');
    book.entries[2].strategy = { ...book.entries[2].strategy, type: 'selective', keys: ['key'], scan_depth: 1 };
    adapter.put('character', book);
    const scan = await scanWorldbooks({ books: { native: adapter.scanBook('character') }, messages: ['key'], tokenCount: () => 1 });
    const plan = requestProjectionSnapshot({ settingLibrary: { entries: [], promptPositions: [{
      id: 'custom', name: 'Native position', anchor: 'insert_point_4', side: 'after_setting_position', order: 2,
    }] }, worldbookRound: { fragments: scan.entries, examples: [] } }).plan;
    expect(plan[0]).toMatchObject({ anchor: 'insert_point_4', placementRank: 2, traceSource: 'Native position' });
  });

  it('keeps raw depth and extension fields across save and export', () => {
    const { adapter } = nativeHarness();
    const raw = { customRoot: { mode: 'synthetic' }, entries: { 42: { ...rawEntry(42, 99), customEntry: { retained: true } } } };
    adapter.put('character', raw);
    expect(adapter.exportRaw('character')).toEqual(raw);
    const read = adapter.read('character');
    read.entries[0].content = 'updated';
    adapter.put('character', read);
    expect(adapter.exportRaw('character').entries[0]).toMatchObject({ position: { type: 'at_depth', depth: 99 }, customEntry: { retained: true }, content: 'updated' });
  });
});
