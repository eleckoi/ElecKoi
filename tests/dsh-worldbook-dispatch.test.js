import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { AgentRegistry } from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import { expect, it } from 'vitest';
import { scanWorldbooks } from '../packages/dsh-worldbook-compat/src/index.js';
import { installConversationContext } from '../packages/dsh-client-roleplay/src/host/conversation-context.mjs';
import { inputContinuationsProjection } from '../packages/dsh-client-roleplay/src/host/input-continuations-projection.mjs';
import { RequestPreviewStore } from '../packages/dsh-client-roleplay/src/host/request-preview.mjs';

it('dispatches depth-compatible settings once through the official loop without persisting a projected request', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-worldbook-dispatch-')), ctx = new Context();
  const previews = new RequestPreviewStore(), sessionId = SessionId('synthetic-worldbook-session');
  let handle;
  try {
    const contextFile = join(root, 'context.json');
    const context = { historyMode: 'prefix', history: [{ role: 'assistant', content: 'synthetic opening' }], settingLibrary: {
      entries: [{ id: 'native', enabled: true, kind: 'normal', triggerMode: 'always', position: 'insert_point_4', content: 'native fixed setting' }],
    } };
    writeFileSync(contextFile, JSON.stringify(context));
    writeFileSync(join(root, `${sessionId}.json`), JSON.stringify({ model: { systemPrompt: 'native instructions' }, contextFile }));
    for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(plugin);
    ctx.sessionProjections.register(inputContinuationsProjection);
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' });
    await ctx.plugin(AgentLoop, { agents: [] });
    const scan = await scanWorldbooks({ books: { synthetic: { entries: [0, 99].map((depth, uid) => ({ uid, constant: true,
      position: 4, depth, content: `compatibility setting ${uid}` })) } }, messages: [], settings: { budgetTokens: 100 }, tokenCount: () => 1 });
    const round = { fragments: scan.entries, examples: [], authorNote: { position: 'none' } };
    ctx.provide('eleckoiWorldbookRounds', { current: id => id === sessionId ? round : undefined,
      nativeStaticLibrary: preparation => preparation.conversationContext.settingLibrary });
    installConversationContext(ctx, root, sessionId, previews);
    const dispatched = [];
    class Adapter extends LlmAdapter {
      async resolveModel(provider, id) { return { provider, id, name: id }; }
      async *stream(options) {
        dispatched.push(options.messages);
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '<FINAL>synthetic answer</FINAL>' } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      }
    }
    ctx.llm.registerAdapter(['synthetic'], new Adapter());
    handle = await ctx.agentLoop.createAgent(ctx, { sessionId, agentOptions: { provider: 'synthetic', model: 'synthetic' } });
    for (const text of ['synthetic first input', 'synthetic second input']) {
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
      await handle.agent.whenIdle();
    }
    expect(dispatched).toHaveLength(2);
    for (const request of dispatched) {
      const texts = request.flatMap(message => message.content.filter(block => block.type === 'text').map(block => block.text));
      expect(texts.filter(text => text === 'compatibility setting 0')).toHaveLength(1);
      expect(texts.filter(text => text === 'compatibility setting 1')).toHaveLength(1);
      expect(texts.indexOf('compatibility setting 1')).toBeLessThan(texts.indexOf('synthetic opening'));
      expect(texts.at(-1)).toBe('native fixed setting');
    }
    expect(previews.list(sessionId)).toHaveLength(2);
    const stored = JSON.stringify(handle.agent.session.snapshotEvents());
    expect(stored).not.toContain('compatibility setting');
    expect(stored).not.toContain('native fixed setting');
    expect(JSON.stringify(ctx.sessionProjections.snapshot(handle.agent.session))).not.toContain('compatibility setting');
  } finally {
    await handle?.dispose();
    previews.close();
    await ctx.fiber.dispose();
    const child = relative(tmpdir(), root);
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected test cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
