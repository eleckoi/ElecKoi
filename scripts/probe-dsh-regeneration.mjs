import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { initProfile } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createAssistantMessage, createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { DshDesktopPluginHost, ELECKOI_DESKTOP_BUNDLES } from '@eleckoi/desktop-host'

const root = mkdtempSync(join(tmpdir(), 'eleckoi-dsh-regeneration-'))
const profile = join(root, 'home', 'profiles', 'desktop')
initProfile(profile, [...PROFILE_TEMPLATES.web.bundles, ...ELECKOI_DESKTOP_BUNDLES])
writeFileSync(join(profile, 'cordis.patch.yml'), JSON.stringify([
  { id: 'llm-pi-ai', config: { providers: {
    'synthetic-old': { api: 'openai-responses', baseURL: 'http://127.0.0.1:1/v1',
      apiKeyEnv: 'ELECKOI_SYNTHETIC_PROBE_KEY', models: [{ id: 'example-old', contextWindow: 65536, maxTokens: 8192 }] },
    'synthetic-current': { api: 'openai-completions', baseURL: 'http://127.0.0.1:1/v1',
      apiKeyEnv: 'ELECKOI_SYNTHETIC_PROBE_KEY', models: [{ id: 'example-current', contextWindow: 65536, maxTokens: 8192 }] },
  } } },
  { id: 'agent-default-model', config: { provider: 'synthetic-old', model: 'example-old' } },
]))
process.env.ELECKOI_SYNTHETIC_PROBE_KEY = 'synthetic-probe-key'
const options = {
  runtimeDataRoot: root, workspaceRoot: join(root, 'workspace'),
  productDatabasePath: join(root, 'product.sqlite'), productMediaRoot: join(root, 'media'),
  presetTemplatePath: resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'),
  agentPatchPath: resolve('apps/desktop/resources/dsh/desktop-agent.patch.yml'), executablePath: process.execPath,
}
const hosts = []
async function connect() {
  const host = new DshDesktopPluginHost(options)
  hosts.push(host)
  const ready = await host.start()
  const handshake = await fetch(ready.url, { redirect: 'manual' })
  const cookie = handshake.headers.get('set-cookie')?.split(';', 1)[0]
  await handshake.body?.cancel()
  assert(cookie)
  return { host, async call(method, args) {
    const response = await fetch(new URL(`/api/${method}`, ready.url), {
      method: 'POST', headers: { cookie, origin: new URL(ready.url).origin,
        'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'synthetic-probe', method, payload: { args } }),
    })
    const result = (await response.json()).result
    if (!response.ok || result.ok === false) throw new Error(`${method}: ${JSON.stringify(result)}`)
    return result.value ?? result
  } }
}
try {
  const first = await connect()
  const created = await first.call('eleckoiConversations/create', { input: { title: 'Synthetic chat' } })
  const id = created.conversation.id
  await first.host.close()
  const ctx = new Context()
  let userSeq
  try {
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
    const writer = await ctx.sessionPersistence.open(SessionId(id), 'write')
    try {
      const stored = await writer.read()
      const session = Session.create(SessionId(id), stored.events, writer.header, writer.inheritedEventCount)
      const from = stored.events.length
      session.append('turn/start', { turn: 1 })
      session.append('step/start', { turn: 1, step: 1 })
      session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('Synthetic system') }, { surfaceOp: 'append' })
      userSeq = session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Synthetic input' }],
        source: { kind: 'user' } }), { surfaceOp: 'append' }).seq
      session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({
        content: [{ type: 'text', text: 'Synthetic reply' }], source: { provider: 'synthetic-old', model: 'example-old' },
      }) }, { surfaceOp: 'append' })
      session.append('step/end', { turn: 1, step: 1 })
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      await writer.append(session.snapshotEvents().slice(from))
      await writer.flush()
    } finally { await writer.close() }
  } finally { await ctx.fiber.dispose() }
  const patch = JSON.parse(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8'))
  delete patch[0].config.providers['synthetic-old']
  patch[1].config = { provider: 'synthetic-current', model: 'example-current' }
  writeFileSync(join(profile, 'cordis.patch.yml'), JSON.stringify(patch))
  const second = await connect()
  const selection = { provider: 'synthetic-current', model: 'example-current' }
  await second.call('eleckoiConversationModels/select', { conversationId: id, selection })
  await second.call('eleckoiConversations/regenerateMessage', { conversationId: id,
    eventSeq: userSeq, requestId: 'synthetic-regeneration' })
  const current = await second.call('eleckoiConversationModels/current', { conversationId: id })
  assert.deepEqual(current, selection)
  const snapshot = JSON.parse(readFileSync(join(root, 'session-snapshots', `${id}.json`), 'utf8'))
  assert.equal(snapshot.model.provider, selection.provider)
  assert.equal(snapshot.model.model, selection.model)
  assert.equal(snapshot.runtimeThreadId, id)
  await second.call('eleckoiConversations/startRegeneration', { conversationId: id,
    requestId: 'synthetic-regeneration', cancelled: true })
  process.stdout.write('DSH regeneration retains the current model across closed-writer rewind and Host restart.\n')
} finally {
  await Promise.all(hosts.map(host => host.close()))
  delete process.env.ELECKOI_SYNTHETIC_PROBE_KEY
  const absolute = resolve(root)
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('eleckoi-dsh-regeneration-')) {
    throw new Error('Refusing to remove an unexpected probe directory')
  }
  rmSync(absolute, { recursive: true, force: true })
}
