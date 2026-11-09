import { queryFromInspection } from '../helpers/session-query.js'
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Context } from '@deepseek-ai/cordis';
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import { createAssistantMessage } from '@deepseek-ai/dsh-llm';
import { afterEach, expect, it, vi } from 'vitest';
import * as illustration from '../../packages/client/features/dsh-auto-illustration/src/index.js';
import * as roleplay from '../../packages/client/features/dsh-client-roleplay/src/index.js';
import { findGeneratedImage } from '../../packages/client/features/dsh-client-roleplay/src/host/generated-image-result.mjs';
import { ElecKoiConversationsApi } from '@eleckoi/dsh-product-api';

afterEach(() => vi.unstubAllEnvs());
it('binds the real roleplay image APIs after editor readiness and reads, repaints and rereads one image', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-image-services-')), ctx = new Context();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const part of request) body += part;
    requests.push(JSON.parse(body));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ images: [{ image: png.toString('base64') }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const name of ['ELECKOI_PRESET_TEMPLATE_PATH', 'ELECKOI_SESSION_BRIDGE_ROOT', 'ELECKOI_WORKSPACE_ROOT', 'ELECKOI_SESSION_SNAPSHOT_ROOT', 'ELECKOI_PRESET_ROOT']) vi.stubEnv(name, join(root, name));
    for (const plugin of [SessionStore, SessionProjectionRegistry, SystemPrompt]) await ctx.plugin(plugin);
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' });
    await ctx.plugin(LocalAttachmentStore, { dshHome: root });
    const ref = await ctx.attachments.saveImage({ data: png, mediaType: 'image/png' });
    const canonical = await ctx.attachments.readImage(ref);
    const session = Session.create(SessionId('synthetic-image-session'));
    const batchId = 'synthetic-image-batch';
    session.append('eleckoi/illustration', { batchId, turn: 1, step: 1, status: 'complete', frames: [{ id: 1, status: 'ready', attachment: ref }] }, { ignorable: true });
    session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({ source: { provider: 'synthetic', model: 'synthetic' },
      content: [{ type: 'text', text: '<ACTION_CALL name="generate_image">{"frames":[{"id":1,"prompt":"synthetic scene","negative_prompt":"synthetic avoid"}]}</ACTION_CALL><FINAL>合成正文\n[[IMAGE:1]]</FINAL>' }] }) }, { surfaceOp: 'append' });
    const entry = { provider: 'novelai_image', model: 'nai-diffusion-4-5-full', base_url: `http://127.0.0.1:${server.address().port}`, credentialRef: 'SYNTHETIC_KEY' };
    const services = {
      agents: { get: () => undefined, create() {}, resume() {} },
      agentPresets: { register: async () => () => {} },
      agentDefaultModel: { currentSelection: () => ({ provider: 'synthetic', model: 'synthetic' }) },
      llm: { resolveModelInfo: async () => ({}) },
      settings: { describe: () => [{ ns: 'eleckoi-client-models', value: { entries: { 'image-a': entry } } }] },
      eleckoiProductData: { runtimeSessionId: () => session.id, prepareConversationRuntime: () => ({ runtimeSessionId: session.id, agentPreset: { autoIllustration: { enabled: true, modelConfigId: 'image-a' } } }) },
      sessionController: { inspect: async () => ({ events: session.snapshotEvents() }), resolveAgent: async () => ({ agent: { status: 'idle' } }) },
      eleckoiConversationLifecycle: { drain: async () => {}, exclusive: async (_id, action) => action() },
      eleckoiConversationChanges: { publish() {} }, eleckoiCharacterConfigurationChanges: { publish() {} },
      credentials: { resolve: async () => ({ value: 'synthetic-token' }) }
    };
    services.sessionQuery = queryFromInspection(id => services.sessionController.inspect(id));
    for (const [name, value] of Object.entries(services)) ctx.provide(name, value);
    const edit = vi.fn(async (_session, batch, frame, generate) => {
      const current = findGeneratedImage(session.snapshotEvents(), batch, frame);
      const next = await generate(current.frame);
      const { prompt, negative_prompt, after_paragraph, ...outcome } = next;
      session.append('eleckoi/illustration', { ...current.event.data, frames: [outcome] }, { ignorable: true });
      return next;
    });
    const editor = ctx.plugin({ inject: ['eleckoiSessionHandles'], apply(owner) {
      owner.provide('eleckoiSessionEditor', { regenerateImage: edit, discardGeneratedImages: async () => {} });
    } });
    await ctx.plugin(roleplay);
    await editor;
    await vi.waitFor(() => expect(ctx.get('eleckoiRoleplaySessions')).toBeDefined());
    const api = { ownerContext: ctx, changeFeed: { publish() {} } }, signal = new AbortController().signal;
    const read = attachment => ElecKoiConversationsApi.prototype.readGeneratedImage.call(api, 'synthetic-chat', batchId, 1, attachment.attachmentId, signal);
    expect(Buffer.from((await read(ref)).data, 'base64')).toEqual(Buffer.from(canonical.data));
    await expect(ElecKoiConversationsApi.prototype.regenerateImage.call(api, 'synthetic-chat', batchId, 1, signal)).rejects.toMatchObject({ message: expect.stringContaining('插件未启用') });
    const illustrationFork = await ctx.plugin(illustration);
    await ElecKoiConversationsApi.prototype.regenerateImage.call(api, 'synthetic-chat', batchId, 1, signal);
    expect(edit).toHaveBeenCalledOnce();
    expect(requests).toHaveLength(1);
    expect(requests[0].input).toBe('synthetic scene');
    const next = findGeneratedImage(session.snapshotEvents(), batchId, 1).frame;
    expect(next.status).toBe('ready');
    expect(Buffer.from((await read(next.attachment)).data, 'base64')).toEqual(Buffer.from(canonical.data));
    await illustrationFork.dispose();
    expect(Buffer.from((await read(next.attachment)).data, 'base64')).toEqual(Buffer.from(canonical.data));
    await expect(ElecKoiConversationsApi.prototype.regenerateImage.call(api, 'synthetic-chat', batchId, 1, signal)).rejects.toMatchObject({ message: expect.stringContaining('插件未启用') });
    await expect(ElecKoiConversationsApi.prototype.readGeneratedImage.call(api, 'synthetic-chat', 'unknown-batch', 1, ref.attachmentId, signal)).rejects.toThrow('当前聊天记录');
    session.append('eleckoi/illustration', { batchId, turn: 1, step: 1, status: 'failed', frames: [{ id: 1, status: 'failed', error: '合成取消' }] }, { ignorable: true });
    await expect(read(ref)).rejects.toThrow('当前聊天记录');
    await editor.dispose();
    await vi.waitFor(() => expect(ctx.get('eleckoiRoleplaySessions')).toBeUndefined());
    expect(ctx.eleckoiSessionHandles).toBeDefined();
  } finally {
    await ctx.fiber.dispose();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
