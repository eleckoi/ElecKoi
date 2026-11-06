import { queryFromInspection } from '../helpers/session-query.js'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { Context } from '@deepseek-ai/cordis';
import { Session, SessionId, SessionStore } from '@deepseek-ai/dsh-session';
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import productDataPlugin from '@eleckoi/dsh-product-data';
import { ElecKoiConversationsApi, ElecKoiCharactersApi } from '@eleckoi/dsh-product-api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as sessionEditPlugin from '../../packages/host/runtime/src/sessionEditPlugin';
import { readDshSessionLog } from '../../packages/host/runtime/src/trajectory';
import { illustrationProjection } from '../../packages/client/features/dsh-client-roleplay/src/host/illustration-projection.mjs';
import { findGeneratedImage } from '../../packages/client/features/dsh-client-roleplay/src/host/generated-image-result.mjs';
import { deleteRemovedGeneratedImages, generatedImageReferences } from '../../packages/host/runtime/src/generatedImageCleanup';
import ToolResultStore from '../../packages/client/features/dsh-client-roleplay/src/host/tool-result-store.mjs';

const cleanups = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-generated-cleanup-')), ctx = new Context(), sessions = join(root, 'sessions');
  cleanups.push(async () => {
    const child = relative(tmpdir(), root);
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected test cleanup path');
    await rm(root, { recursive: true, force: true });
  });
  cleanups.push(() => ctx.fiber.dispose());
  for (const [key, value] of Object.entries({ DSH_SESSION_ROOT: sessions, ELECKOI_DATABASE_PATH: join(root, 'product.sqlite'), ELECKOI_MEDIA_ROOT: join(root, 'media'), ELECKOI_WORKSPACE_ROOT: join(root, 'workspace') })) vi.stubEnv(key, value);
  await ctx.plugin(SessionStore);
  await ctx.plugin(JsonlSessionPersistence, { root: sessions, compression: 'none' });
  await ctx.plugin(LocalAttachmentStore, { dshHome: root });
  await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(productDataPlugin);
  ctx.provide('sessionQuery', {});
  await ctx.plugin(ToolResultStore, { root: join(root, 'tool-results') });
  ctx.provide('eleckoiSessionHandles', { withClosed: async (_id, action) => action() });
  ctx.provide('sessionProjectionCache', { write: async () => {} });
  ctx.provide('workspaceRegistry', { list: () => [], unpinSession: async () => {}, unarchiveSession: async () => {} });
  await ctx.sessionProjections.register(illustrationProjection);
  await ctx.plugin(sessionEditPlugin);
  const save = async (size = 1) => {
    const sharp = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-attachment-local'))('sharp');
    const data = await sharp(png).resize(size, size).png().toBuffer();
    return ctx.attachments.saveImage({ data, mediaType: 'image/png' });
  };
  const persist = async session => {
    const previous = readDshSessionLog(sessions, session.id);
    const handle = previous ? await ctx.sessionPersistence.open(session.id, 'write') : await ctx.sessionPersistence.create(session.header, { inheritedEventCount: session.inheritedEventCount });
    try { await handle.append(session.snapshotEvents().slice(previous?.events.length || 0)); await handle.flush(); }
    finally { await handle.close(); }
  };
  const turn = (session, ref, number, withInput = true) => {
    const input = withInput ? session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '合成输入' }] }), { surfaceOp: 'append' }) : undefined;
    session.append('turn/start', { turn: number });
    session.append('step/start', { turn: number, step: 1 });
    const refs = Array.isArray(ref) ? ref : [ref];
    const frames = refs.map((attachment, index) => ({ id: index + 1, prompt: `synthetic scene ${index + 1}`, negative_prompt: `synthetic avoid ${index + 1}` }));
    const text = `<ACTION_CALL name="generate_image">${JSON.stringify({ frames })}</ACTION_CALL>\n<FINAL>合成回复\n${frames.map(frame => `[[IMAGE:${frame.id}]]`).join('\n')}\n</FINAL>`;
    session.append('eleckoi/illustration', { batchId: `${session.id}:images:${number}`, turn: number, step: 1, status: 'complete',
      frames: refs.map((attachment, index) => ({ id: index + 1, width: attachment.width, height: attachment.height, status: 'ready', attachment })) }, { ignorable: true });
    session.append('assistant/message', { turn: number, step: 1, stream: [], message: createAssistantMessage({ source: { provider: 'synthetic', model: 'synthetic' }, content: [{ type: 'text', text }] }) }, { surfaceOp: 'append' });
    session.append('step/end', { turn: number, step: 1 });
    session.append('turn/end', { turn: number, reason: { kind: 'completed' } });
    return input;
  };
  const owner = {
    eleckoiSessionEditor: ctx.eleckoiSessionEditor,
    eleckoiRequestPreviews: { forget() {} },
    eleckoiConversationLifecycle: { exclusive: async (_id, action) => action() },
    eleckoiRoleplaySessions: { removeArtifacts: async () => {}, prepareSessionAccess: async () => {}, prepareRestoreBeforeTurn: () => ({ apply() {}, rollback() {} }), prepareRegeneration: async () => ({ rollback() {} }), preparePrompt: async () => {}, currentOperation: () => 'synthetic-operation' },
    sessionController: { inspect: async id => { const log = readDshSessionLog(sessions, id); return { meta: log.header, events: log.events }; } },
    eleckoiConversationChanges: { publish() {} },
    eleckoiCharacterConfigurationChanges: { publish() {} }
  };
  owner.sessionQuery = queryFromInspection(id => owner.sessionController.inspect(id));
  const api = { productData: ctx.eleckoiProductData, ownerContext: owner, changeFeed: { publish() {} }, pendingRegenerations: new Map() };
  const create = async (ref, characterId) => {
    const id = ctx.eleckoiProductData.createConversation({ metadata: characterId ? { characterId } : {} }).conversation.id;
    const session = Session.create(SessionId(id));
    const input = turn(session, ref, 1);
    await persist(session);
    return { id, session, input };
  };
  const saveResult = (sessionId, toolName = 'eleckoi_read_setting_files') => ctx.spillStore.saveText({
    owner: { sessionId }, source: { kind: 'tool', toolName, callId: `synthetic-${toolName}` },
    suggestedName: 'synthetic-result.txt', content: `合成开头|${'合成续读正文𠮷'.repeat(10001)}|合成末尾`
  });
  return { root, sessions, ctx, save, persist, turn, create, api, owner, saveResult };
}

describe('generated image deletion in existing Host operations', { timeout: 30000 }, () => {
  it('deletes an early completed image when its live batch is cancelled before persistence catches up', async () => {
    const f = await fixture(), ref = await f.save(), chat = await f.create(ref), batchId = `${chat.id}:images:1`;
    chat.session.append('eleckoi/illustration', { batchId, turn: 1, step: 1, status: 'failed',
      frames: [{ id: 1, width: ref.width, height: ref.height, status: 'failed', error: '合成取消' }] }, { ignorable: true });
    expect(readDshSessionLog(f.sessions, chat.id).events.find(event => event.type === 'eleckoi/illustration').data.status).toBe('complete');
    expect(findGeneratedImage(chat.session.snapshotEvents(), batchId, 1).frame).toMatchObject({ status: 'failed', prompt: 'synthetic scene 1' });
    await deleteRemovedGeneratedImages({ eleckoiProductData: f.ctx.eleckoiProductData, sessionPersistence: f.ctx.sessionPersistence, attachments: f.ctx.attachments,
      sessions: { list: () => [chat.session] } }, new Map([[ref.attachmentId, ref]]));
    expect(existsSync(f.ctx.attachments.imageHostPath(ref))).toBe(false);
  });
  it('deletes a chat and its generated file and complete tool results immediately', async () => {
    const f = await fixture(), ref = await f.save(), chat = await f.create(ref), retained = await f.create(await f.save(2));
    const removed = await Promise.all(['eleckoi_read_setting_files', 'eleckoi_read_variables', 'eleckoi_call_capability'].map(tool => f.saveResult(chat.id, tool)));
    const kept = await f.saveResult(retained.id);
    await ElecKoiConversationsApi.prototype.delete.call(f.api, chat.id);
    expect(f.ctx.eleckoiProductData.readConversationCatalog().map(item => item.id)).toEqual([retained.id]);
    for (const result of removed) {
      expect(existsSync(result.locator)).toBe(false);
      expect(existsSync(`${result.locator}.owner.json`)).toBe(false);
      expect(existsSync(dirname(result.locator))).toBe(false);
    }
    expect(readFileSync(kept.locator, 'utf8')).toContain('合成末尾');
    expect(existsSync(`${kept.locator}.owner.json`)).toBe(true);
    expect(existsSync(f.ctx.attachments.imageHostPath(ref))).toBe(false);
  });
  it('deletes a character and the generated files and tool results of all its chats while leaving other chats intact', async () => {
    const f = await fixture(), first = await f.save(), second = await f.save(2), retained = await f.save(3);
    f.ctx.eleckoiProductData.createCharacter({ id: 'synthetic-card', name: '合成角色' });
    const chats = [await f.create(first, 'synthetic-card'), await f.create(second, 'synthetic-card')], other = await f.create(retained);
    const results = await Promise.all(chats.map(chat => f.saveResult(chat.id))), kept = await f.saveResult(other.id);
    await ElecKoiCharactersApi.prototype.delete.call({ productData: f.ctx.eleckoiProductData, ownerContext: f.owner, publishChange() {} }, ['synthetic-card']);
    for (const result of results) {
      expect(existsSync(result.locator)).toBe(false);
      expect(existsSync(`${result.locator}.owner.json`)).toBe(false);
    }
    expect(readFileSync(kept.locator, 'utf8')).toContain('合成末尾');
    expect(f.ctx.eleckoiProductData.readConversationCatalog().map(item => item.id)).toEqual([other.id]);
    expect(existsSync(f.ctx.attachments.imageHostPath(first))).toBe(false);
    expect(existsSync(f.ctx.attachments.imageHostPath(second))).toBe(false);
    expect((await f.ctx.attachments.readImage(retained)).data.byteLength).toBeGreaterThan(0);
  });
  it.each(['chat', 'character'])('keeps the %s available for retry when complete result cleanup fails', async kind => {
    const f = await fixture();
    f.ctx.eleckoiProductData.createCharacter({ id: 'synthetic-card', name: '合成角色' });
    const chat = await f.create(await f.save(), 'synthetic-card'), result = await f.saveResult(chat.id);
    const failure = new Error('合成文件占用');
    const remove = vi.spyOn(f.ctx.spillStore, 'removeSessionResults').mockRejectedValue(failure);
    const operation = () => kind === 'chat' ? ElecKoiConversationsApi.prototype.delete.call(f.api, chat.id)
      : ElecKoiCharactersApi.prototype.delete.call({ productData: f.ctx.eleckoiProductData, ownerContext: f.owner, publishChange() {} }, ['synthetic-card']);
    await expect(operation()).rejects.toThrow('合成文件占用');
    expect(f.ctx.eleckoiProductData.readConversationCatalog().map(item => item.id)).toEqual([chat.id]);
    expect(readDshSessionLog(f.sessions, chat.id)).toBeDefined();
    expect(existsSync(result.locator)).toBe(true);
    remove.mockRestore();
    await operation();
    expect(f.ctx.eleckoiProductData.readConversationCatalog()).toEqual([]);
    expect(readDshSessionLog(f.sessions, chat.id)).toBeUndefined();
    expect(existsSync(result.locator)).toBe(false);
    if (kind === 'character') expect(f.ctx.eleckoiProductData.readCharacters().items).toEqual([]);
  });
  it('cleans child-only images and input images while preserving images shared by another Session', async () => {
    const f = await fixture(), shared = await f.save(), childImage = await f.save(2), inputImage = await f.save(3);
    const chat = await f.create(shared), other = await f.create(shared);
    const child = Session.create(SessionId('synthetic-image-child'), [], { ...Session.create(SessionId('synthetic-image-child')).header, parentSession: chat.session.id });
    f.turn(child, childImage, 1);
    child.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'image', attachment: inputImage }] }), { surfaceOp: 'append' });
    await f.persist(child);
    await ElecKoiConversationsApi.prototype.delete.call(f.api, chat.id);
    expect(readDshSessionLog(f.sessions, child.id)).toBeUndefined();
    expect(existsSync(f.ctx.attachments.imageHostPath(childImage))).toBe(false);
    expect(existsSync(f.ctx.attachments.imageHostPath(inputImage))).toBe(false);
    expect(existsSync(f.ctx.attachments.imageHostPath(shared))).toBe(true);
    expect(readDshSessionLog(f.sessions, other.id)).toBeDefined();
  });
  it('removes descendant results and also handles a result whose Session log is already absent', async () => {
    const f = await fixture(), chat = await f.create(await f.save());
    const leave = f.ctx.sessions.enter(chat.session);
    const child = f.ctx.sessions.create(SessionId('synthetic-child'), { meta: { parentSession: chat.session.id, origin: 'subagent' } });
    const grandchild = f.ctx.sessions.create(SessionId('synthetic-grandchild'), { meta: { parentSession: child.id, origin: 'subagent' } });
    await f.persist(child); await f.persist(grandchild);
    leave();
    const results = await Promise.all([child.id, grandchild.id, 'synthetic-missing-log'].map(id => f.saveResult(id)));
    await ElecKoiConversationsApi.prototype.delete.call(f.api, chat.id);
    await f.ctx.eleckoiSessionEditor.deleteSession('synthetic-missing-log');
    await f.ctx.eleckoiSessionEditor.deleteSession('synthetic-missing-log');
    for (const result of results) expect(existsSync(dirname(result.locator))).toBe(false);
    expect(readDshSessionLog(f.sessions, child.id)).toBeUndefined();
    expect(readDshSessionLog(f.sessions, grandchild.id)).toBeUndefined();
  });
  it('removes the replaced reply file during regeneration, keeps earlier images and saves the new reply on the same Session', async () => {
    const f = await fixture(), retained = await f.save(), removed = await f.save(2), next = await f.save(3), chat = await f.create(retained);
    const input = f.turn(chat.session, removed, 2); await f.persist(chat.session);
    await ElecKoiConversationsApi.prototype.regenerateMessage.call(f.api, chat.id, input.seq, 'synthetic-request');
    expect(existsSync(f.ctx.attachments.imageHostPath(removed))).toBe(false);
    expect((await f.ctx.attachments.readImage(retained)).data.byteLength).toBeGreaterThan(0);
    const log = readDshSessionLog(f.sessions, chat.id), replacement = Session.create(SessionId(chat.id), log.events, log.header, log.inheritedEventCount);
    f.turn(replacement, next, 2, false); await f.persist(replacement);
    expect(readDshSessionLog(f.sessions, chat.id).header.id).toBe(chat.id);
    expect((await f.ctx.attachments.readImage(next)).data.byteLength).toBeGreaterThan(0);
  });
  it('preserves the original log and image when regeneration preparation fails', async () => {
    const f = await fixture(), ref = await f.save(), chat = await f.create(ref), log = readDshSessionLog(f.sessions, chat.id), original = readFileSync(log.path);
    f.owner.eleckoiRoleplaySessions.preparePrompt = async () => { throw new Error('合成准备失败'); };
    await expect(ElecKoiConversationsApi.prototype.regenerateMessage.call(f.api, chat.id, chat.input.seq, 'synthetic-request')).rejects.toThrow('合成准备失败');
    expect(readFileSync(log.path)).toEqual(original);
    expect((await f.ctx.attachments.readImage(ref)).data.byteLength).toBeGreaterThan(0);
  });
  it('deletes the image file when removing an assistant reply and later messages', async () => {
    const f = await fixture(), retained = await f.save(), removed = await f.save(2), chat = await f.create(retained);
    f.turn(chat.session, removed, 2); await f.persist(chat.session);
    const reply = chat.session.snapshotEvents().filter(event => event.type === 'assistant/message').at(-1);
    await ElecKoiConversationsApi.prototype.deleteMessagesFrom.call(f.api, chat.id, reply.seq, 'assistant');
    expect(existsSync(f.ctx.attachments.imageHostPath(removed))).toBe(false);
    expect((await f.ctx.attachments.readImage(retained)).data.byteLength).toBeGreaterThan(0);
  });
  it('keeps an image that the remaining input still references', async () => {
    const f = await fixture(), ref = await f.save();
    const id = f.ctx.eleckoiProductData.createConversation({}).conversation.id;
    const input = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'image', attachment: ref }] });
    const session = Session.create(SessionId(id));
    const user = session.append('user/message', input, { surfaceOp: 'append' });
    f.turn(session, ref, 1, false); await f.persist(session);
    await f.ctx.eleckoiSessionEditor.transaction(id, () => f.ctx.eleckoiSessionEditor.rewind(id, 1, user.seq, true));
    expect((await f.ctx.attachments.readImage(ref)).data.byteLength).toBeGreaterThan(0);
  });
  it('rejects a file path outside the attachment objects directory', async () => {
    const f = await fixture(), ref = await f.save(), outside = join(f.root, 'outside.png');
    writeFileSync(outside, png);
    vi.spyOn(f.ctx.attachments, 'imageHostPath').mockReturnValue(outside);
    await expect(deleteRemovedGeneratedImages(f.ctx, new Map([[ref.attachmentId, ref]]))).rejects.toThrow('对象路径');
    expect(existsSync(outside)).toBe(true);
    expect(generatedImageReferences([]).size).toBe(0);
  });
  it('reparses the selected frame from the original AI reply, replaces only its image and deletes the old file', async () => {
    const f = await fixture(), retained = await f.save(), previous = await f.save(2), next = await f.save(3);
    const chat = await f.create([retained, previous]), batchId = `${chat.id}:images:1`;
    const before = readDshSessionLog(f.sessions, chat.id), generate = vi.fn(async frame => ({ ...frame, status: 'ready', attachment: next }));
    await f.ctx.eleckoiSessionEditor.regenerateImage(chat.id, batchId, 2, generate);
    expect(generate).toHaveBeenCalledOnce(); expect(generate.mock.calls[0][0]).toMatchObject({ id: 2, prompt: 'synthetic scene 2', negative_prompt: 'synthetic avoid 2' });
    const after = readDshSessionLog(f.sessions, chat.id);
    expect(after.header.id).toBe(chat.id); expect(after.events.length).toBe(before.events.length);
    expect(after.events.filter(event => event.type !== 'eleckoi/illustration')).toEqual(before.events.filter(event => event.type !== 'eleckoi/illustration'));
    expect(findGeneratedImage(after.events, batchId, 1).frame.attachment).toEqual(retained);
    expect(findGeneratedImage(after.events, batchId, 2).frame.attachment).toEqual(next);
    expect(JSON.stringify(after.events.filter(event => event.type === 'eleckoi/illustration'))).not.toContain('synthetic scene');
    expect(existsSync(f.ctx.attachments.imageHostPath(previous))).toBe(false);
    expect(existsSync(f.ctx.attachments.imageHostPath(retained))).toBe(true);
  });
  it('keeps an existing image and the original reply when its repaint fails', async () => {
    const f = await fixture(), previous = await f.save(), chat = await f.create(previous), batchId = `${chat.id}:images:1`;
    const original = readDshSessionLog(f.sessions, chat.id).events.filter(event => event.type === 'assistant/message');
    await f.ctx.eleckoiSessionEditor.regenerateImage(chat.id, batchId, 1, async frame => ({ ...frame, error: '合成生图失败' }));
    const log = readDshSessionLog(f.sessions, chat.id);
    expect(log.events.filter(event => event.type === 'assistant/message')).toEqual(original);
    expect(findGeneratedImage(log.events, batchId, 1).frame).toMatchObject({ status: 'ready', error: '合成生图失败' });
    expect(existsSync(f.ctx.attachments.imageHostPath(previous))).toBe(true);
  });
  it('keeps the repainted image when a later reply is removed', async () => {
    const f = await fixture(), previous = await f.save(), later = await f.save(2), next = await f.save(3), chat = await f.create(previous);
    f.turn(chat.session, later, 2); await f.persist(chat.session);
    await f.ctx.eleckoiSessionEditor.regenerateImage(chat.id, `${chat.id}:images:1`, 1, async frame => ({ ...frame, attachment: next }));
    await f.ctx.eleckoiSessionEditor.rewind(chat.id, 2);
    expect(findGeneratedImage(readDshSessionLog(f.sessions, chat.id).events, `${chat.id}:images:1`, 1).frame.attachment).toEqual(next);
    expect(existsSync(f.ctx.attachments.imageHostPath(next))).toBe(true);
    expect(existsSync(f.ctx.attachments.imageHostPath(previous))).toBe(false);
    expect(existsSync(f.ctx.attachments.imageHostPath(later))).toBe(false);
  });
  it('preserves the captured prompt when editing only the displayed final body', async () => {
    const f = await fixture(), previous = await f.save(), chat = await f.create(previous), batchId = `${chat.id}:images:1`;
    const reply = readDshSessionLog(f.sessions, chat.id).events.find(event => event.type === 'assistant/message');
    await f.ctx.eleckoiSessionEditor.editMessage(chat.id, reply.seq, 'assistant', '修改后的合成正文\n[[IMAGE:1]]');
    const log = readDshSessionLog(f.sessions, chat.id);
    expect(findGeneratedImage(log.events, batchId, 1).frame.prompt).toBe('synthetic scene 1');
    expect(log.events.find(event => event.type === 'assistant/message').data.message.content[0].text).toContain('修改后的合成正文');
  });
  it('removes a newly saved file when replacement validation fails, while retaining the old image', async () => {
    const f = await fixture(), previous = await f.save(), next = await f.save(2), chat = await f.create(previous);
    await expect(f.ctx.eleckoiSessionEditor.regenerateImage(chat.id, `${chat.id}:images:1`, 1, async frame => ({ ...frame, id: 2, attachment: next }))).rejects.toThrow('分镜编号');
    expect(existsSync(f.ctx.attachments.imageHostPath(next))).toBe(false);
    expect(existsSync(f.ctx.attachments.imageHostPath(previous))).toBe(true);
  });
});
