import { runtimeContextsFor } from '../../../../../../tests/helpers/runtime-contexts.js'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeNovelAiImageSettings, novelAiImageSettingsError } from '../../../../../shared/src/contracts/agent/novelAiImageSettings';
import { materializeAgentPreset } from '../../../dsh-client-roleplay/src/host/session-runtime.mjs';
import { readRuntimePresetDefinition } from '../../../dsh-client-roleplay/src/host/preset-definition.mjs';
import { writeSessionSnapshot } from '../../../dsh-client-roleplay/src/host/session-snapshot.mjs';
import * as imagePlugin from '../../src/index.js';
import { readSessionSnapshot } from '../../../dsh-client-roleplay/src/host/session-snapshot.mjs';
import { createNovelAiImageGeneration } from '../../src/host/novelai-image-generation.mjs';
import { installConversationContext } from '../../../dsh-client-roleplay/src/host/conversation-context.mjs';
import { illustrationProjection } from '../../../dsh-client-roleplay/src/host/illustration-projection.mjs';
import { IMAGE_PROMPT_OPEN, IMAGE_PROMPT_CLOSE } from '../../../dsh-client-roleplay/src/host/generated-image-result.mjs';
import { inputContinuationsProjection } from '../../../dsh-client-roleplay/src/host/input-continuations-projection.mjs';

const directories = [], servers = [];
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const frame = { id: 1, prompt: 'synthetic scene', negative_prompt: 'synthetic avoid', after_paragraph: 0, seed: 42 };
const temporary = () => { const dir = mkdtempSync(join(tmpdir(), 'eleckoi-nai-')); directories.push(dir); return dir; };
async function server(respond) {
  const requests = [];
  const instance = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
    await respond(req, res, requests.length);
  });
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve)); servers.push(instance);
  return { url: `http://127.0.0.1:${instance.address().port}`, requests };
}
afterEach(async () => {
  delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT;
  for (const instance of servers.splice(0)) { instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve)); }
  for (const dir of directories.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe('NAI preset illustration', () => {
  it('keeps image handling out of generated tool compositions and retires the old mounted handler', () => {
    const dir = temporary(), template = resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml');
    const preset = { id: 'synthetic-preset', name: '合成预设', versionId: 'v1', roleplayPlan: { steps: [] }, autoIllustration: { enabled: true, modelConfigId: 'image-a' } };
    const result = materializeAgentPreset(dir, template, preset, { disabledGroupIds: [] }, {});
    const path = join(dir, result.id, 'preset.json');
    const definition = JSON.parse(readFileSync(path, 'utf8'));
    expect(definition.plugins.some(plugin => plugin.id === 'image-generation-tools')).toBe(false);
    definition.plugins.push({ id: 'image-generation-tools', name: 'eleckoi:agent-preset/image-generation-tools', config: { configId: 'image-a' } });
    writeFileSync(path, JSON.stringify(definition));
    expect(readRuntimePresetDefinition(path, result.id, template).plugins.some(plugin => plugin.id === 'image-generation-tools')).toBe(false);
  });

  it('rejects invalid saved parameters and reversed automatic ranges', () => {
    expect(novelAiImageSettingsError({ automaticImageCount: true, automaticImageMin: 4, automaticImageMax: 2 })).toContain('不能大于');
    expect(normalizeNovelAiImageSettings({ fixedImageCount: 25 }).fixedImageCount).toBe(25);
    expect(normalizeNovelAiImageSettings({ steps: 51 }).steps).toBe(51);
    expect(() => normalizeNovelAiImageSettings({ steps: 0 })).toThrow();
    expect(() => normalizeNovelAiImageSettings({ sampler: 'unknown' })).toThrow();
  });

  it.each(['image-first', 'text-first', 'agent-close', 'plugin-close'])('publishes %s completion independently of the real Agent text stream', async order => {
    let finishImage, imageFinished = false, bodyStreamed = false, requestArrived, resultArrived;
    const bodyVisible = new Promise(resolve => { finishImage = resolve; });
    const imageRequested = new Promise(resolve => { requestArrived = resolve; });
    const imageReady = new Promise(resolve => { resultArrived = resolve; });
    const remote = await server(async (_req, res) => { requestArrived(); await bodyVisible; imageFinished = true; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ images: [{ image: png, index: 0, seed: 42 }] })); });
    if (order === 'image-first') finishImage();
    const dir = temporary(), snapshotRoot = join(dir, 'snapshots'), sessionId = 'synthetic-image-session';
    process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = snapshotRoot;

    const contexts = runtimeContextsFor(sessionId, { conversationContext: { currentPromptText: '合成场景', history: [] } });
    const snapshot = { model: { systemPrompt: '合成角色指令' }, autoIllustration: { enabled: true, modelConfigId: 'image-a' }, disabledToolGroupIds: [] };
    writeSessionSnapshot(snapshotRoot, sessionId, snapshot);
    const entry = { provider: 'novelai_image', model: 'nai-diffusion-4-5-full', base_url: remote.url, credentialRef: 'SYNTHETIC_NAI_KEY', image_settings: { promptPrefix: 'synthetic prefix', negativePrompt: 'synthetic negative' } };
    const ctx = new Context(), requests = [], previews = [];
    class Adapter extends LlmAdapter {
      async resolveModel(provider, id) { return { provider, id, name: id }; }
      async *stream(options) {
        requests.push(options);
        const instructions = options.messages.filter(message => message.role === 'system').flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n');
        let text = '<FINAL>合成角色回复</FINAL>';
        if (requests.length === 1) {
          expect(instructions).toContain('当前角色对话已启用每轮自动配图');
          expect(instructions).toContain('不要发起 Tool Call/function_call');
          expect(instructions).toContain('professional prompt compiler for NovelAI');
          expect((options.tools || []).some(tool => tool.name === 'generate_image')).toBe(false);
          entry.image_settings.promptPrefix = 'changed during turn';
          text = `${IMAGE_PROMPT_OPEN}\n${JSON.stringify({ frames: [frame] })}\n${IMAGE_PROMPT_CLOSE}\n<FINAL>合成角色回复\n[[IMAGE:1]]\n</FINAL>`;
        }
        yield { type: 'block-start', index: 0, blockType: 'text' };
        const boundary = text.indexOf(IMAGE_PROMPT_CLOSE) + IMAGE_PROMPT_CLOSE.length;
        if (requests.length === 1) {
          yield { type: 'text-delta', index: 0, text: text.slice(0, 15) };
          yield { type: 'text-delta', index: 0, text: text.slice(15, boundary) };
          await imageRequested;
          if (order === 'image-first') await imageReady;
          yield { type: 'text-delta', index: 0, text: text.slice(boundary) };
        } else yield { type: 'text-delta', index: 0, text };
        yield { type: 'block-end', index: 0, block: { type: 'text', text } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      }
    }
    try {
      for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(plugin);
      ctx.sessionProjections.register(inputContinuationsProjection);
      ctx.sessionProjections.register(illustrationProjection);
      ctx.provide('eleckoiSessionEditor', { discardGeneratedImages: async () => {} });
      ctx.systemPrompt.section({ name: 'synthetic-complete', order: 0, text: '合成完整提示词', complete: true });
      await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(LocalAttachmentStore, { dshHome: dir });
      ctx.provide('credentials', { resolve: vi.fn(async () => ({ value: 'synthetic-token' })) });
      await ctx.plugin({ name: 'synthetic-settings', apply(settingsCtx) {
        settingsCtx.provide('settings', { describe: () => [{ ns: 'eleckoi-client-models', value: { entries: { 'image-a': entry } } }] });
      } });
      ctx.provide('eleckoiRuntimeContexts', contexts);
      ctx.provide('eleckoiRoleplaySessions', { configuration: id => id === sessionId ? readSessionSnapshot(snapshotRoot, id) : undefined });
      const imageFork = await ctx.plugin(imagePlugin);
      ctx.llm.registerAdapter(['synthetic'], new Adapter());
      const handle = await ctx.agents.create({ sessionId: SessionId(sessionId), agentOptions: { provider: 'synthetic', model: 'synthetic' } });
      ctx.on('agent/assistant-stream', event => {
        if (!bodyStreamed && event.frame.type === 'chunk' && event.frame.chunk.type === 'text-delta' && event.frame.chunk.text.includes('<FINAL>')) {
          bodyStreamed = true;
          expect(imageFinished).toBe(order === 'image-first');
        }
      });
      ctx.on('session/event', (_session, event) => {
        if (event.type === 'eleckoi/illustration' && event.data.status === 'complete') resultArrived(event);
      });
      await ctx.plugin({ name: 'synthetic-request-scope', inject: ['llm', 'sessions', 'sessionProjections', 'eleckoiRuntimeContexts'], apply(scopedCtx) {
        expect(() => scopedCtx.settings).toThrow('without inject');
        return installConversationContext(scopedCtx, snapshotRoot, sessionId, { capture: (_session, request) => previews.push(request) }, ctx.settings);
      } });
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成场景' }], source: { kind: 'user' } }));
      await handle.agent.whenIdle();
      if (order === 'agent-close' || order === 'plugin-close') {
        if (order === 'agent-close') await handle.dispose();
        else await imageFork.dispose();
        const outcomes = handle.agent.session.snapshotEvents().filter(event => event.type === 'eleckoi/illustration');
        expect(outcomes.at(-1).data.status).toBe('failed');
        expect(outcomes.at(-1).data.frames.every(frame => frame.status === 'failed' && !frame.attachment)).toBe(true);
        expect(Boolean(ctx.get('eleckoiAutoIllustration'))).toBe(order === 'agent-close');
        finishImage();
        if (order === 'plugin-close') {
          handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '停用插件后继续合成对话' }], source: { kind: 'user' } }));
          await handle.agent.whenIdle();
          expect(handle.agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' });
          expect(requests).toHaveLength(2);
          expect(JSON.stringify(requests[1].messages)).not.toContain('当前角色对话已启用每轮自动配图');
        }
        return;
      }
      if (order === 'text-first') {
        expect(imageFinished).toBe(false);
        expect(handle.agent.session.snapshotEvents().filter(event => event.type === 'eleckoi/illustration').map(event => event.data.status)).toEqual(['generating']);
        finishImage();
      }
      const published = await imageReady;
      const events = handle.agent.session.snapshotEvents();
      const result = events.find(event => event.type === 'eleckoi/illustration' && event.data.status === 'complete');
      expect(result).toBe(published);
      const ended = events.find(event => event.type === 'turn/end');
      expect(result.seq < ended.seq).toBe(order === 'image-first');
      expect(result.data.frames[0].status).toBe('ready');
      expect(JSON.stringify(events.filter(event => event.type === 'eleckoi/illustration'))).not.toContain('synthetic scene');
      const attachment = result.data.frames[0].attachment;
      expect((await ctx.attachments.readImage(attachment)).data.byteLength).toBeGreaterThan(0);
      expect(events.filter(event => event.type === 'assistant/message')).toHaveLength(1);
      expect(events.some(event => event.type === 'tool/call')).toBe(false);
      expect(requests).toHaveLength(1); expect(remote.requests).toHaveLength(1);
      expect(bodyStreamed).toBe(true);
      expect(previews.map(request => request.messages)).toEqual(requests.map(request => request.messages));
      expect(JSON.stringify(events.filter(event => event.type !== 'request/header'))).not.toContain('当前角色对话已启用每轮自动配图');
      expect(remote.requests[0]).toMatchObject({ url: '/ai/generate-image', headers: { authorization: 'Bearer synthetic-token', accept: 'application/json' }, body: { input: 'synthetic prefix, synthetic scene', model: 'nai-diffusion-4-5-full', parameters: { width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral', negative_prompt: 'synthetic avoid, synthetic negative', seed: 42, n_samples: 1 } } });
      if (order === 'text-first') await imageFork.dispose();
      else writeSessionSnapshot(snapshotRoot, sessionId, { ...snapshot, autoIllustration: { ...snapshot.autoIllustration, enabled: false } });
      expect((await ctx.systemPrompt.assemble({ agent: handle.agent, scope: handle.agent })).tools.some(tool => tool.name === 'generate_image')).toBe(false);
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '关闭配图后的合成场景' }], source: { kind: 'user' } }));
      await handle.agent.whenIdle();
      expect(requests).toHaveLength(2);
      expect((requests[1].tools || []).some(tool => tool.name === 'generate_image')).toBe(false);
      expect(JSON.stringify(requests[1].messages)).not.toContain('当前角色对话已启用每轮自动配图');
      expect(remote.requests).toHaveLength(1);
      const peer = await ctx.agents.create({ sessionId: SessionId('synthetic-independent-studio'), agentOptions: { provider: 'synthetic', model: 'synthetic' } });
      peer.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成独立会话请求' }], source: { kind: 'user' } }));
      await peer.agent.whenIdle();
      expect(peer.agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toEqual({ kind: 'completed' });
      expect(requests).toHaveLength(3);
      expect(remote.requests).toHaveLength(1);
      rmSync(join(snapshotRoot, `${sessionId}.json`));
      handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '合成所属会话缺失快照' }], source: { kind: 'user' } }));
      await handle.agent.whenIdle();
      expect(handle.agent.session.snapshotEvents().findLast(event => event.type === 'turn/end').data.reason).toMatchObject({ kind: 'error', error: { message: expect.stringContaining('ENOENT') } });
      expect(requests).toHaveLength(3);
    } finally { await ctx.fiber.dispose(); }
  }, 30000);

  it('keeps completed images on a later HTTP failure, redacts the key and serializes batches', async () => {
    let active = 0, maximum = 0;
    const remote = await server(async (_req, res, index) => {
      active++; maximum = Math.max(active, maximum);
      await new Promise(resolve => setTimeout(resolve, 12)); active--;
      res.statusCode = index === 2 ? 429 : 200;
      res.end(index === 2 ? 'synthetic-token' : JSON.stringify({ images: [{ image: png }] }));
    });
    const ctx = new Context();
    try {
      await ctx.plugin(LocalAttachmentStore, { dshHome: temporary() });
      ctx.provide('credentials', { resolve: async () => ({ value: 'synthetic-token' }) });
      const service = createNovelAiImageGeneration(ctx), signal = new AbortController().signal;
      const entry = { model: 'nai-diffusion-4-5-full', base_url: remote.url, credentialRef: 'SYNTHETIC_KEY' };
      const settings = normalizeNovelAiImageSettings();
      const [partial, complete] = await Promise.all([service.generate(entry, settings, [frame, { ...frame, id: 2 }], signal), service.generate(entry, settings, [frame], signal)]);
      expect(maximum).toBe(1); expect(partial).toMatchObject({ status: 'partial', frames: [{ id: 1 }] });
      expect(partial.error).toContain('429'); expect(partial.error).not.toContain('synthetic-token');
      expect(complete.status).toBe('complete');
      expect((await ctx.attachments.readImage(partial.frames[0].attachment)).data.byteLength).toBeGreaterThan(0);
      service.close();
    } finally { await ctx.fiber.dispose(); }
  }, 30000);
});
