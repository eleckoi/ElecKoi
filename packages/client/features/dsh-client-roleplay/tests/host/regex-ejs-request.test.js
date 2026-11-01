import { runtimeContextsFor } from '../../../../../../tests/helpers/runtime-contexts.js'
import { describe, expect, it } from 'vitest';
import { createUserMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installConversationContext } from '../../src/host/conversation-context.mjs';
import { writeSessionSnapshot } from '../../src/host/session-snapshot.mjs';
import { renderRequestEjs } from '../../src/host/regex-ejs.mjs';
import { renderRegexEjs } from '@eleckoi/dsh-product-data/regex';

describe('regex EJS actual request computation', () => {
  it('preserves multi-megabyte EJS source and its entire evaluated request content', async () => {
    const text = 'Synthetic long literal '.repeat(100001) + 'tail-marker';
    const source = `<!-- eleckoi:regex-ejs:start --><%- ${JSON.stringify(text)} %><!-- eleckoi:regex-ejs:end -->`;
    const message = createUserMessage({ content: [{ type: 'text', text: source }], source: { kind: 'user' } });
    const output = await renderRequestEjs([message], { conversationId: 'synthetic-large-ejs' });
    expect(output[0].content[0].text).toBe(text);
    expect(output[0].id).toBe(message.id);
    expect(message.content[0].text).toBe(source);
  }, 30000);

  it('finishes EJS before the real llm/stream submission and captures the same evaluated request', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-regex-ejs-'));
    let dispose;
    try {
      const sessionId = 'synthetic-session';
      const template = '<!-- eleckoi:regex-ejs:start -->Score <%= await Promise.resolve(getvar("score")) %><!-- eleckoi:regex-ejs:end -->';
      const contexts = runtimeContextsFor(sessionId, { conversationContext: { currentPromptText: template }, variables: { enabled: true, state: { score: 12 } } });
      writeSessionSnapshot(directory, sessionId, { conversationId: 'synthetic-chat', variablesEnabled: true });
      const original = createUserMessage({ content: [{ type: 'text', text: 'Synthetic original' }], source: { kind: 'user' } });
      const session = { deriveMessages: () => [original] }, listeners = new Map();
      let sent, captured;
      dispose = installConversationContext({ get(name) { return this[name]; }, eleckoiRuntimeContexts: contexts, on: (event, handler) => { listeners.set(event, handler); return () => listeners.delete(event); },
        sessions: { get: () => session }, sessionProjections: { stateOf: () => ({ inputs: [{ messageId: original.id }] }) },
        llm: { stream: async function* (options) { sent = options; yield { type: 'synthetic-accepted' }; } },
      }, directory, sessionId, { capture: (_session, options) => { captured = options; } });
      listeners.get('session/event')({ id: sessionId }, { type: 'step/start', data: { turn: 1, step: 1 } });
      const events = [];
      for await (const event of listeners.get('llm/stream')(markAgentLoopRequest({ sessionId, messages: [original], signal: new AbortController().signal }), () => {})) events.push(event);
      expect(events).toEqual([{ type: 'synthetic-accepted' }]);
      expect(sent.messages[0].content[0].text).toBe('Score 12');
      expect(captured.messages).toBe(sent.messages);
      expect(original.content[0].text).toBe('Synthetic original');
    } finally { dispose?.(); rmSync(directory, { recursive: true, force: true }); }
  });
  it('evaluates text sent to the model without mutating Session messages or their IDs', async () => {
    const message = createUserMessage({ content: [{ type: 'text', text: '<!-- eleckoi:regex-ejs:start -->Score <%= await Promise.resolve(getvar("score")) %><!-- eleckoi:regex-ejs:end -->' }], source: { kind: 'user' } });
    const original = JSON.stringify(message);
    const output = await renderRequestEjs([message], { conversationId: 'synthetic-chat', variables: { score: 12 } });
    expect(output[0].id).toBe(message.id);
    expect(output[0].content[0].text).toBe('Score 12');
    expect(JSON.stringify(message)).toBe(original);
    expect(await renderRequestEjs(output, { conversationId: 'synthetic-chat' })).toEqual(output);
  });
  it('exposes no Node process, require or Host objects and reports missing snapshot or author errors', async () => {
    const input = { content: '<!-- eleckoi:regex-ejs:start --><%= typeof process %>:<%= typeof require %>:<%= typeof api %><!-- eleckoi:regex-ejs:end -->', rawContent: '', variables: null, surface: 'Prompt',
      message: { id: 'synthetic-message', conversationId: 'synthetic-chat', role: 'user', status: 'complete', content: '' } };
    expect(await renderRegexEjs(input)).toBe('undefined:undefined:undefined');
    await expect(renderRegexEjs({ ...input, content: '<!-- eleckoi:regex-ejs:start --><%= getvar("score", {defaults:0}) %><!-- eleckoi:regex-ejs:end -->' })).rejects.toThrow('快照');
    await expect(renderRegexEjs({ ...input, content: '<!-- eleckoi:regex-ejs:start --><%= getvar("score") %><!-- eleckoi:regex-ejs:end -->' })).rejects.toMatchObject({ code: 'eleckoi/data/shape-invalid', details: { what: '本次内容的变量快照' } });
    await expect(renderRegexEjs({ ...input, content: '<!-- eleckoi:regex-ejs:start --><% throw new Error("Synthetic request failure") %><!-- eleckoi:regex-ejs:end -->' })).rejects.toThrow('Synthetic request failure');
  });
  it('cancels an unfinished calculation and releases its worker without accepting a late result', async () => {
    const controller = new AbortController();
    const request = renderRegexEjs({ content: '<!-- eleckoi:regex-ejs:start --><% await new Promise(() => {}) %><!-- eleckoi:regex-ejs:end -->', rawContent: '', variables: null, surface: 'Prompt',
      message: { id: 'synthetic-message', conversationId: 'synthetic-chat', role: 'user', status: 'complete', content: '' } }, controller.signal);
    controller.abort(new Error('Synthetic cancellation'));
    await expect(request).rejects.toThrow('Synthetic cancellation');
  });
});
