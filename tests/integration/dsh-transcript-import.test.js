import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog';
import { readDshSessionLog } from '@eleckoi/dsh-runtime';
import { importDshTranscript } from '../../packages/host/runtime/src/sessionTranscriptImport';
import { SqliteDatabase } from '../helpers/SqliteDatabase';
import { ConversationRepository } from '../../packages/host/product-data/src/domain/conversations/ConversationRepository';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-transcript-import-'));
  roots.push(root);
  const session = Session.create(SessionId('synthetic-import'));
  session.append('permission/preset', { preset: 'danger-full-access' });
  session.append('sandbox/mode', { mode: 'danger-full-access' });
  session.append('approval/policy', { policy: 'never' });
  const initialization = session.snapshotEvents();
  const directory = join(root, 'project', 'session');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `session.v${sessionFormatCatalog.currentVersion}.jsonl`);
  writeFileSync(path, [sessionFormatCatalog.encodeCurrentHeader({ ...session.header, delegationDepth: 0 }, 0),
    ...initialization.map(event => sessionFormatCatalog.encodeCurrentEvent(event))]
    .map(row => JSON.stringify(row)).join('\n') + '\n');
  return { root, path, initialization };
}

it('keeps initialized Session policies and restores imported dialogue through official messages', () => {
  const { root, initialization } = fixture();
  const imported = importDshTranscript(root, 'synthetic-import', [
    { role: 'user', content: 'Synthetic input' },
    { role: 'assistant', content: 'Synthetic reply', variableStateJson: '{"score":7}' },
  ]);
  const log = readDshSessionLog(root, 'synthetic-import');
  expect(log.events.slice(0, initialization.length)).toEqual(initialization);
  const resumed = Session.create(SessionId('synthetic-import'), log.events, log.header);
  expect(resumed.deriveMessages().filter(message => message.role !== 'system').map(message => message.content))
    .toEqual([[{ type: 'text', text: 'Synthetic input' }], [{ type: 'text', text: 'Synthetic reply' }]]);
  expect(imported[1]).toMatchObject({ role: 'assistant', turn: 2, variableStateJson: '{"score":7}' });
});

it('does not replace a Session that already contains imported dialogue', () => {
  const { root, path } = fixture();
  importDshTranscript(root, 'synthetic-import', [{ role: 'user', content: 'Synthetic existing input' }]);
  const before = readFileSync(path);
  expect(() => importDshTranscript(root, 'synthetic-import', [{ role: 'user', content: 'Replacement input' }]))
    .toThrow('尚未开始对话');
  expect(readFileSync(path)).toEqual(before);
});

it('reuses the native speaker when replacing a chat opening', () => {
  const { root } = fixture();
  const database = new SqliteDatabase(join(root, 'product.sqlite3'));
  database.open();
  try {
    const conversations = new ConversationRepository(database);
    const id = conversations.create({}).conversation.id;
    conversations.restoreImportedOpening(id, { content: 'Synthetic original opening' });
    const before = database.native.prepare('SELECT id FROM conversation_speakers WHERE conversationId=?').all(id);
    conversations.restoreImportedOpening(id, { content: 'Synthetic imported opening', variableStateJson: '{"score":2}' });
    expect(database.native.prepare('SELECT id FROM conversation_speakers WHERE conversationId=?').all(id)).toEqual(before);
    expect(conversations.openingText(id)).toBe('Synthetic imported opening');
    expect(database.native.prepare('SELECT variableStateJson FROM agent_turns WHERE conversationId=?').get(id))
      .toEqual({ variableStateJson: '{"score":2}' });
    conversations.restoreImportedOpening(id);
    expect(conversations.openingText(id)).toBe('');
    expect(database.native.prepare('SELECT historyMessageCount FROM chat_sessions WHERE id=?').get(id))
      .toEqual({ historyMessageCount: 0 });
    expect(database.native.prepare('SELECT id FROM conversation_speakers WHERE conversationId=?').all(id)).toEqual(before);
    expect(database.native.pragma('foreign_key_check')).toEqual([]);
  } finally { database.close(); }
  // Windows CI 上偶发超过默认 5s（建库 + 迁移 + 杀软扫描）；放宽超时，断言不变。
}, 30_000);
