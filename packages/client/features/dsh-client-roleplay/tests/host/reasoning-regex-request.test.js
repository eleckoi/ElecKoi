import { runtimeContextsFor } from '../../../../../../tests/helpers/runtime-contexts.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { freezeMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { installConversationContext, projectRequestInput, requestProjectionSnapshot } from '../../src/host/conversation-context.mjs';

const rule = (patch = {}) => ({ id: 'synthetic-reasoning', name: 'Synthetic reasoning', pattern: '/SYNTHETIC/g',
  replacement: 'CHANGED', targets: ['Reasoning'], enabled: true, displayOnly: false, promptOnly: true,
  runOnEdit: false, order: 0, ...patch });
const user = (id, text) => freezeMessage({ id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] });
const assistant = (id, content, replayState) => freezeMessage({ id, role: 'assistant', source: {
  kind: 'model', provider: 'synthetic', model: 'synthetic', ...(replayState === undefined ? {} : { replayState }),
}, content });

describe('reasoning regex in the actual roleplay request projection', () => {
  it('applies the real llm/stream contribution before submission and captures the same transformed request without writing to Session', () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-reasoning-request-'));
    try {
      const sessionId = 'synthetic-session';
      const contexts = runtimeContextsFor(sessionId, { conversationContext: { historyMode: 'prefix', history: [], reasoningPromptRules: [rule({ promptOnly: false })] } });
      writeFileSync(join(directory, `${sessionId}.json`), JSON.stringify({ conversationId: 'synthetic-chat', }));
      const messages = [user('synthetic-input', 'New input'), assistant('synthetic-step', [{ type: 'reasoning', text: 'SYNTHETIC' },
        { type: 'tool-call', id: 'synthetic-call', name: 'synthetic-tool', arguments: '{}' }])];
      const session = { id: sessionId, deriveMessages: () => messages, append: vi.fn() };
      const listeners = new Map(), capture = vi.fn(), stream = vi.fn(options => options);
      const dispose = installConversationContext({ get(name) { return this[name]; }, eleckoiRuntimeContexts: contexts, on: (type, listener) => { listeners.set(type, listener); return () => listeners.delete(type); },
        sessions: { get: () => session }, sessionProjections: { stateOf: () => ({ inputs: [{ messageId: messages[0].id }] }) },
        llm: { stream } }, directory, sessionId, { capture });
      listeners.get('session/event')(session, { type: 'step/start', data: { turn: 1, step: 2 } });
      const sent = listeners.get('llm/stream')(markAgentLoopRequest({ sessionId, provider: 'synthetic', model: 'synthetic', messages }), vi.fn());
      expect(sent.messages[1].content[0].text).toBe('CHANGED');
      expect(capture.mock.calls[0][1].messages).toBe(sent.messages);
      expect(messages[1].content[0].text).toBe('SYNTHETIC');
      expect(session.append).not.toHaveBeenCalled();
      expect(stream).toHaveBeenCalledOnce();
      dispose();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('transforms active-turn reasoning only and preserves the tool flow, final body, identities and original log values', () => {
    const old = assistant('synthetic-old-reply', [{ type: 'reasoning', text: 'SYNTHETIC old' }, { type: 'text', text: '<FINAL>Old reply</FINAL>' }]);
    const current = assistant('synthetic-current-step', [{ type: 'reasoning', text: 'SYNTHETIC current' },
      { type: 'text', text: 'SYNTHETIC body' }, { type: 'tool-call', id: 'synthetic-call', name: 'synthetic-tool', arguments: '{"value":"SYNTHETIC"}' }]);
    const result = freezeMessage({ id: 'synthetic-result', role: 'tool', source: { kind: 'tool', callId: 'synthetic-call' },
      toolCallId: 'synthetic-call', content: [{ type: 'text', text: 'SYNTHETIC result' }] });
    const source = [user('synthetic-old-input', 'Old input'), old, user('synthetic-input', 'New input'), current, result];
    const snapshot = requestProjectionSnapshot({ historyMode: 'prefix', history: [], reasoningPromptRules: [rule()] });
    const output = projectRequestInput(source, snapshot, { instructions: null, currentPromptText: null });
    expect(output.find(message => message.id === old.id).content).toEqual([{ type: 'text', text: 'Old reply' }]);
    expect(output.find(message => message.id === current.id).content).toEqual([
      { type: 'reasoning', text: 'CHANGED current' }, current.content[1], current.content[2],
    ]);
    expect(output.at(-1)).toBe(result);
    expect(current.content[0].text).toBe('SYNTHETIC current');
    expect(old.content[0].text).toBe('SYNTHETIC old');
  });

  it('rejects a text-changing prompt rule on opaque replay data instead of submitting changed text with an old signature', () => {
    const replayState = { response: { kind: 'deepseek-messages', version: 1, model: 'synthetic' },
      blocks: [{ type: 'reasoning', signature: 'synthetic-signature' }, { type: 'tool-call' }] };
    const message = assistant('synthetic-signed-step', [{ type: 'reasoning', text: 'SYNTHETIC signed' },
      { type: 'tool-call', id: 'synthetic-call', name: 'synthetic-tool', arguments: '{}' }], replayState);
    const snapshot = requestProjectionSnapshot({ reasoningPromptRules: [rule()] });
    expect(() => projectRequestInput([user('synthetic-input', 'New input'), message], snapshot, {})).toThrow('模型回放数据');
    expect(message.content[0].text).toBe('SYNTHETIC signed');
    expect(message.source.replayState).toEqual(replayState);
    const noMatch = requestProjectionSnapshot({ reasoningPromptRules: [rule({ pattern: '/ABSENT/g' })] });
    expect(projectRequestInput([user('synthetic-input', 'New input'), message], noMatch, {}).at(-1)).toBe(message);
  });
});
