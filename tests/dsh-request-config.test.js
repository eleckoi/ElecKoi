import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { LlmAdapter, LlmRuntime, createUserMessage } from '@deepseek-ai/dsh-llm';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import TokenMeter from '@deepseek-ai/dsh-token-meter';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import { installRequestConfig, projectCompactionRequest } from '../apps/desktop/resources/dsh/request-config.mjs';

describe('DSH request configuration', () => {
  it('routes compaction once to its owning session with multiple live request configurations', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-compaction-scope-'));
    const ctx = new Context();
    const calls = [];
    const agents = [];
    try {
      for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry, TokenMeter]) {
        await ctx.plugin(plugin);
      }
      await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' });
      await ctx.plugin(BasicCompactionEngine, { retainTokens: 0 });
      await ctx.plugin(AgentLoop, { agents: [] });
      class Adapter extends LlmAdapter {
        async *stream(request) {
          calls.push(request);
          yield { type: 'block-start', index: 0, blockType: 'text' };
          yield { type: 'block-end', index: 0, block: { type: 'text', text: '合成摘要' } };
          yield { type: 'finish', reason: { kind: 'stop' } };
        }
      }
      ctx.llm.registerAdapter(['synthetic'], new Adapter());
      for (const id of ['session-a', 'session-b']) {
        writeFileSync(join(root, `${id}.json`), JSON.stringify({
          model: { provider: 'synthetic', model: id },
          historyCompactionInstructions: `摘要要求 ${id}`,
        }));
        const handle = await ctx.agentLoop.createAgent(ctx, {
          sessionId: SessionId(id), agentOptions: { provider: 'synthetic', model: id },
        });
        agents.push(handle.agent);
        installRequestConfig(handle.agent.ctx, root, id);
      }
      await Array.fromAsync(ctx.llm.stream({
        provider: 'synthetic', model: 'session-a', sessionId: 'session-a', purpose: 'compaction',
        messages: [{ id: 'synthetic-input', role: 'user', content: [{ type: 'text', text: '默认摘要要求' }], source: { kind: 'user' } }],
        signal: new AbortController().signal,
      }));
      expect(calls).toHaveLength(1);
      expect(calls[0].messages.at(-1).content[0].text).toContain('摘要要求 session-a');
      expect(calls[0].messages.at(-1).content[0].text).not.toContain('session-b');
      const agent = agents[0];
      const events = [];
      ctx.on('session/event', (session, event) => { if (session === agent.session) events.push(event); });
      agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成历史输入。'.repeat(200) }], source: { kind: 'user' } }));
      await agent.whenIdle();
      const compacted = await ctx.compaction.compactNow(agent, new AbortController().signal);
      expect(compacted).not.toBeNull();
      expect(agent.status).toBe('idle');
      expect(calls.filter(request => request.purpose === 'compaction')).toHaveLength(2);
      expect(events.some(event => event.type === 'compaction/end')).toBe(true);
    } finally {
      await ctx.fiber.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
  it('overrides a persisted legacy route with the model frozen for the current turn', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-request-route-'));
    try {
      const path = join(root, 'session-a.json');
      writeFileSync(path, JSON.stringify({
        model: { provider: 'legacy-provider-label', model: 'synthetic-model' },
      }));
      const listeners = new Map();
      const registrations = [];
      const agentCtx = {
        on(name, listener, options) {
          listeners.set(name, listener);
          registrations.push({ name, listener, options });
          return () => undefined;
        },
        llm: { stream: vi.fn() },
      };
      installRequestConfig(agentCtx, root, 'session-a');
      await listeners.get('system-prompt/assemble')({}, {}, async () => ({ variables: {} }));

      writeFileSync(path, JSON.stringify({
        model: {
          provider: 'current-provider-route', model: 'synthetic-model',
          reasoningEffort: 'high', temperature: 0.4, topP: 0.9, maxTokens: 8_000,
        },
      }));
      expect(registrations.find(({ name }) => name === 'agent/request')?.options)
        .toEqual({ prepend: true });
      const resolved = await listeners.get('agent/request')({}, async () => ({
        provider: 'legacy-provider-label', model: 'synthetic-model', reasoningEffort: 'low',
        temperature: 0.1, topP: 0.2, maxTokens: 1_000, purpose: 'agent',
      }));

      expect(resolved).toEqual({
        provider: 'current-provider-route', model: 'synthetic-model', reasoningEffort: 'high',
        temperature: 0.4, topP: 0.9, maxTokens: 8_000, purpose: 'agent',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('wins after the official Session selection restores a legacy request header', async () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-request-waterfall-'));
    try {
      writeFileSync(join(root, 'session-a.json'), JSON.stringify({
        model: { provider: 'current-provider-route', model: 'synthetic-model' },
      }));
      const listeners = [async (_payload, next) => ({
        ...await next(),
        provider: 'deepseek-default',
        model: 'synthetic-model',
      })];
      const agentCtx = {
        on(name, listener, options) {
          if (name === 'agent/request') {
            if (options?.prepend) listeners.unshift(listener);
            else listeners.push(listener);
          }
          return () => undefined;
        },
        llm: { stream: vi.fn() },
      };
      installRequestConfig(agentCtx, root, 'session-a');
      const dispatch = (index) => index === listeners.length
        ? Promise.resolve({ provider: 'agent-options', model: 'synthetic-model' })
        : listeners[index]({}, () => dispatch(index + 1));

      await expect(dispatch(0)).resolves.toMatchObject({
        provider: 'current-provider-route',
        model: 'synthetic-model',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('replaces only the final compaction instruction with the active preset template', () => {
    const first = { id: 'earlier', role: 'user', content: [{ type: 'text', text: '较早对话' }] };
    const upstream = { id: 'upstream', role: 'user', content: [{ type: 'text', text: 'DSH 默认英文压缩模板' }] };
    const projected = projectCompactionRequest({
      provider: 'deepseek-official',
      model: 'deepseek-flash',
      purpose: 'compaction',
      reasoningEffort: 'high',
      tools: [{ name: 'read', description: 'read', parameters: {} }],
      messages: [first, upstream],
    }, '请用中文保留角色状态和未完成剧情。', 'low');

    expect(projected.messages[0]).toBe(first);
    expect(projected.messages[1]).toMatchObject({ id: 'upstream', role: 'user' });
    expect(projected.messages[1].content[0].text).toContain('请用中文保留角色状态和未完成剧情。');
    expect(projected.messages[1].content[0].text).not.toContain('DSH 默认英文压缩模板');
    expect(projected).not.toHaveProperty('tools');
    expect(projected.reasoningEffort).toBe('high');
  });

  it('leaves ordinary requests and blank preset templates untouched', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: '你好' }] }];
    expect(projectCompactionRequest({ purpose: undefined, messages }, '模板')).toBeUndefined();
    expect(projectCompactionRequest({ purpose: 'compaction', messages }, '   ')).toBeUndefined();
  });

  it('inherits the active main-model reasoning effort when compaction has no explicit override', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: '上游默认模板' }] }];
    const projected = projectCompactionRequest({
      provider: 'example-provider', model: 'always-thinking-model', purpose: 'compaction', messages,
    }, '   ', 'low');

    expect(projected).toMatchObject({ reasoningEffort: 'low', messages });
  });

  it('keeps the durable prompt definition out of compaction input', () => {
    const history = { id: 'history', role: 'assistant', content: [{ type: 'text', text: '较早回复' }] };
    const projection = {
      id: 'eleckoi-request-projection:v1',
      role: 'user',
      source: { kind: 'plugin:eleckoi-request-projection' },
      content: [{ type: 'text', text: 'ELECKOI_REQUEST_PROJECTION_V1\n[]' }],
    };
    const upstream = { id: 'upstream', role: 'user', content: [{ type: 'text', text: 'DSH 默认英文压缩模板' }] };

    const customized = projectCompactionRequest({
      purpose: 'compaction',
      messages: [history, projection, upstream],
    }, '请保留剧情状态。');
    expect(customized.messages).toHaveLength(2);
    expect(customized.messages).not.toContain(projection);
    expect(customized.messages[0]).toBe(history);
    expect(customized.messages[1].content[0].text).toContain('请保留剧情状态。');

    const upstreamOnly = projectCompactionRequest({
      purpose: 'compaction',
      messages: [history, projection, upstream],
    }, '   ');
    expect(upstreamOnly.messages).toEqual([history, upstream]);
  });

  it('routes a compaction through the public DSH llm stream with the session preset template', () => {
    const root = mkdtempSync(join(tmpdir(), 'eleckoi-request-config-'));
    try {
      writeFileSync(join(root, 'session-a.json'), JSON.stringify({
        model: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'low' },
        historyCompactionInstructions: '只保留角色状态与剧情伏笔。',
      }));
      const listeners = new Map();
      const disposers = [];
      let streamListener;
      const terminal = vi.fn((request) => request);
      const agentCtx = {
        on(name, listener) {
          listeners.set(name, listener);
          if (name === 'llm/stream') streamListener = listener;
          const dispose = vi.fn();
          disposers.push(dispose);
          return dispose;
        },
        llm: {
          stream(request) {
            return streamListener(request, () => terminal(request));
          },
        },
      };
      const dispose = installRequestConfig(agentCtx, root, 'session-a');
      const options = deepFreeze({
        provider: 'deepseek-official', model: 'deepseek-flash', sessionId: 'session-a', purpose: 'compaction',
        tools: [{ name: 'read', description: 'read', parameters: {} }],
        messages: [{ role: 'user', content: [{ type: 'text', text: '上游默认模板' }] }],
      });
      const frozenMessages = options.messages;
      const originalContinuation = vi.fn(() => {
        throw new Error('the frozen request must be replaced before terminal dispatch');
      });

      const projected = listeners.get('llm/stream')(options, originalContinuation);
      expect(originalContinuation).not.toHaveBeenCalled();
      expect(terminal).toHaveBeenCalledOnce();
      expect(options.messages).toBe(frozenMessages);
      expect(projected).not.toBe(options);
      expect(projected.messages[0].content[0].text).toContain('只保留角色状态与剧情伏笔。');
      expect(projected).not.toHaveProperty('tools');
      expect(projected.reasoningEffort).toBe('low');

      dispose();
      expect(disposers.every((entry) => entry.mock.calls.length === 1)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
