import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { Context } from '@deepseek-ai/cordis'
import { initProfile } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { ELECKOI_ANDROID_BUNDLES } from '../../apps/android-host/dist/index.mjs'

const root = mkdtempSync(join(tmpdir(), 'eleckoi-android-host-'))
const config = join(root, 'runtime-config.json')
const hosts = []
let modelRequests = 0
const held = Promise.withResolvers()
const cancelled = Promise.withResolvers()
const modelServer = createServer(async (request, response) => {
  assert.equal(request.method, 'POST')
  assert.equal(request.url, '/v1/responses')
  let body = ''
  for await (const chunk of request) body += chunk
  assert.equal(JSON.parse(body).model, 'example-model')
  const count = ++modelRequests
  const text = count === 1 ? 'Synthetic Android reply' : 'Synthetic unfinished reply'
  const item = { id: `synthetic-message-${count}`, type: 'message', role: 'assistant', content: [] }
  const events = [
    { type: 'response.created', response: { id: 'synthetic-response', model: 'example-model', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.content_part.added', output_index: 0, content_index: 0, item_id: item.id, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: item.id, delta: text },
  ]
  const wire = events => events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.write(wire(events))
  if (count === 2) {
    response.once('close', () => cancelled.resolve())
    held.resolve()
    return
  }
  response.end(wire([{ type: 'response.completed', response: { id: 'synthetic-response', model: 'example-model', status: 'completed',
    output: [{ ...item, status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }]))
})
await new Promise(resolve => modelServer.listen(0, '127.0.0.1', resolve))
const profile = join(root, 'home', 'profiles', 'android')
initProfile(profile, [...PROFILE_TEMPLATES.web.bundles, ...ELECKOI_ANDROID_BUNDLES])
writeFileSync(join(profile, 'cordis.patch.yml'), JSON.stringify([
  { id: 'llm-pi-ai', config: { providers: { synthetic: { api: 'openai-responses',
    baseURL: `http://127.0.0.1:${modelServer.address().port}/v1`, apiKeyEnv: 'ELECKOI_ANDROID_PROBE_KEY',
    models: [{ id: 'example-model', contextWindow: 65536, maxTokens: 8192 }] } } } },
  { id: 'agent-default-model', config: { provider: 'synthetic', model: 'example-model' } },
]))
writeFileSync(config, JSON.stringify({ schemaVersion: 1, runtimeDataRoot: join(root, 'data'),
  homeRoot: join(root, 'home'), workspaceRoot: join(root, 'workspace'),
  productDatabasePath: join(root, 'data', 'product.sqlite'), productMediaRoot: join(root, 'media'),
  resourceRoot: resolve('apps/desktop/resources/dsh') }))

async function connect() {
  const child = spawn(process.execPath, [resolve('apps/android-host/dist/host.mjs'), '--config', config], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, ELECKOI_ANDROID_PROBE_KEY: 'synthetic-probe-key' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  })
  hosts.push(child)
  let diagnostic = ''
  child.stderr.on('data', value => { diagnostic += value })
  const exited = new Promise(resolveExit => child.once('exit', (code, signal) => resolveExit({ code, signal })))
  const ready = await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Android Host startup timed out: ${diagnostic}`)), 90_000)
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => {
      if (!line.startsWith('ELECKOI_HOST\t')) return
      const event = JSON.parse(line.slice('ELECKOI_HOST\t'.length))
      if (event.protocolVersion !== 1) reject(new Error('Invalid Host control version'))
      if (event.type === 'fatal') { clearTimeout(timeout); reject(new Error(event.message)) }
      if (event.type === 'ready') { clearTimeout(timeout); resolveReady(event) }
    })
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Host exited before ready (${code}): ${diagnostic}`)) })
  })
  const health = await fetch(ready.healthUrl)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).architecture, 'dsh-remote')
  assert.equal((await fetch(new URL('/_eleckoi/health', ready.url))).status, 401)
  const handshake = await fetch(ready.url, { redirect: 'manual' })
  const cookie = handshake.headers.get('set-cookie')?.split(';', 1)[0]
  await handshake.body?.cancel()
  assert.equal(handshake.status, 303)
  assert(cookie)
  const document = await fetch(new URL('/', ready.url), { headers: { cookie } })
  assert.equal(document.status, 200)
  assert.match(await document.text(), /__ELECKOI_CLIENT_ASSETS__/)
  const asset = ready.injections.find(row => row.kind === 'global' && row.name === '__ELECKOI_CLIENT_ASSETS__')
  assert(asset)
  for (const url of [asset.value.script, asset.value.style]) {
    const response = await fetch(new URL(url, ready.url))
    assert.equal(response.status, 200)
    await response.body?.cancel()
  }
  return {
    async call(method, args) {
      const response = await fetch(new URL(`/api/${method}`, ready.url), {
        method: 'POST', headers: { cookie, origin: new URL(ready.url).origin,
          'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'android-host-probe', method, payload: { args } }),
        signal: AbortSignal.timeout(90_000)
      })
      const result = (await response.json()).result
      if (!response.ok || result.ok === false) throw new Error(`${method}: ${JSON.stringify(result)}`)
      return result.value ?? result
    },
    async close() {
      child.stdin.write('{"type":"shutdown"}\n')
      const exit = await Promise.race([exited, new Promise((_, reject) => {
        const timeout = setTimeout(() => reject(new Error('Android Host graceful shutdown timed out')), 20_000)
        timeout.unref()
      })])
      assert.equal(exit.code, 0)
    }
  }
}

let probeFailure
try {
  const first = await connect()
  const status = await first.call('eleckoiSystem/status', {})
  assert.equal(status.architecture, 'dsh-remote')
  assert.deepEqual(await first.call('eleckoiConversations/list', {}), [])
  const namespace = async (host, ns) => {
    const rows = (await host.call('settings/describe', {})).namespaces.filter(row => row.ns === ns)
    assert.equal(rows.length, 1)
    return rows[0]
  }
  const provider = 'synthetic-dynamic', credentialRef = 'ELECKOI_ANDROID_DYNAMIC_PROBE_KEY'
  const piAi = await namespace(first, 'llm-pi-ai')
  const profile = { api: 'openai-responses', baseURL: `http://127.0.0.1:${modelServer.address().port}/v1`,
    apiKeyEnv: credentialRef, models: [{ id: 'example-model', contextWindow: 65536, maxTokens: 8192, input: ['text'] }] }
  const changed = await first.call('settings/mutate', { ns: piAi.ns, expectedRevision: piAi.revision,
    ops: [{ op: 'set', path: ['providers', provider], value: profile }] })
  const ownedProfile = changed.value.providers[provider]
  for (const field of Object.keys(profile).filter(field => field !== 'models')) assert.deepEqual(ownedProfile[field], profile[field])
  assert.equal(ownedProfile.models.length, profile.models.length)
  for (const model of profile.models) {
    const matches = ownedProfile.models.filter(value => value.id === model.id)
    assert.equal(matches.length, 1)
    for (const field of Object.keys(model)) assert.deepEqual(matches[0][field], model[field])
  }
  assert.equal((await first.call('credentials/describe', { refs: [credentialRef] }))[credentialRef].configured, false)
  await first.call('credentials/set', { ref: credentialRef, value: 'synthetic-probe-key' })
  assert.equal((await first.call('credentials/describe', { refs: [credentialRef] }))[credentialRef].configured, true)
  const created = await first.call('eleckoiConversations/create', { input: { title: 'Synthetic Android chat' } })
  const conversationId = created.conversation.id
  const original = await first.call('eleckoiConversationModels/current', { conversationId })
  assert.deepEqual(original, { provider: 'synthetic', model: 'example-model' })
  const selected = await first.call('eleckoiConversationModels/select', { conversationId, selection: { provider, model: 'example-model' } })
  assert.deepEqual(selected, { provider, model: 'example-model' })
  const prompt = async text => {
    const prepared = await first.call('eleckoiConversations/preparePrompt', { conversationId, text })
    assert.equal(prepared.runtimeSessionId, conversationId)
    await first.call('session/prompt', { request: { requestId: `synthetic-${modelRequests + 1}`, sessionId: conversationId,
      mode: 'queue', content: [{ type: 'text', text }] } })
    return prepared.operationId
  }
  const waitForTurn = async count => {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const projections = await first.call('session/projections', { request: { sessionId: conversationId } })
      const page = await first.call('session/page', { request: { address: { kind: 'session', sessionId: conversationId },
        throughSeq: projections.asOfSeq, maxMessages: 100 } })
      const events = page.records.map(record => record.event)
      if (events.filter(event => event.type === 'turn/end').length === count) return events
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw new Error(`Session did not settle turn ${count}`)
  }
  const firstOperation = await prompt('Synthetic Android input')
  const completed = await waitForTurn(1)
  assert(completed.some(event => event.type === 'turn/end' && event.data.reason.kind === 'completed'))
  await first.call('eleckoiConversations/waitForGeneration', { conversationId, operationId: firstOperation })
  const secondOperation = await prompt('Synthetic cancellation input')
  await Promise.race([held.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('No second model request')), 20_000).unref())])
  await first.call('session/cancel', { request: { sessionId: conversationId } })
  await Promise.race([cancelled.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Model stream was not cancelled')), 20_000).unref())])
  const stopped = await waitForTurn(2)
  assert(stopped.some(event => event.type === 'turn/end' && event.data.reason.kind === 'aborted' && event.data.reason.reason.kind === 'user'))
  await first.call('eleckoiConversations/waitForGeneration', { conversationId, operationId: secondOperation })
  await first.close()
  const ctx = new Context()
  try {
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'data', 'sessions'), compression: 'none' })
    const handle = await ctx.sessionPersistence.open(SessionId(conversationId), 'read')
    try {
      const { events } = await handle.read()
      const replies = events.filter(event => event.type === 'assistant/message')
      assert(replies.some(event => event.data.message.content.some(part => part.type === 'text' && part.text === 'Synthetic Android reply')))
      assert(events.some(event => event.type === 'turn/end' && event.data.reason.kind === 'aborted' && event.data.reason.reason.kind === 'user'))
    } finally { await handle.close() }
  } finally { await ctx.fiber.dispose() }
  const second = await connect()
  assert.deepEqual(await second.call('eleckoiConversationModels/current', { conversationId }), selected)
  const conversations = await second.call('eleckoiConversations/list', {})
  assert(conversations.some(conversation => conversation.id === conversationId))
  const modelSettings = await namespace(second, 'agent-default-model')
  await second.call('settings/replace', { ns: modelSettings.ns, section: original, expectedRevision: modelSettings.revision })
  assert.deepEqual(await second.call('eleckoiConversationModels/current', { conversationId }), original)
  const restoredPiAi = await namespace(second, 'llm-pi-ai')
  assert.deepEqual(restoredPiAi.value.providers[provider], ownedProfile)
  await second.call('settings/mutate', { ns: restoredPiAi.ns, expectedRevision: restoredPiAi.revision,
    ops: [{ op: 'unset', path: ['providers', provider] }] })
  await second.call('credentials/unset', { ref: credentialRef })
  assert.equal((await second.call('credentials/describe', { refs: [credentialRef] }))[credentialRef].configured, false)
  await second.call('eleckoiConversations/delete', { conversationId })
  assert.deepEqual(await second.call('eleckoiConversations/list', {}), [])
  await second.close()
  process.stdout.write('Android Node Host authentication, current product Remote, model settings and credentials, send, cancellation, restart and probe cleanup passed.\n')
} catch (error) {
  probeFailure = error
  throw error
} finally {
  for (const child of hosts) if (child.exitCode === null) {
    const closed = once(child, 'close')
    child.kill()
    await closed
  }
  modelServer.closeAllConnections()
  await new Promise(resolve => modelServer.close(resolve))
  const absolute = resolve(root)
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('eleckoi-android-host-')) {
    throw new Error('Refusing to remove an unexpected probe directory')
  }
  try { rmSync(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
  catch (cleanupError) {
    throw probeFailure ? new AggregateError([probeFailure, cleanupError], 'Host probe and temporary directory cleanup failed') : cleanupError
  }
}
