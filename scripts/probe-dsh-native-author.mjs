import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { initProfile, PROFILE_TEMPLATES, readProfileManifest, writeProfileBundles } from '@deepseek-ai/dsh-app-boot'
import { DshDesktopPluginHost, ELECKOI_DESKTOP_BUNDLES, registerDesktopBundles } from '@eleckoi/desktop-host'
import { AUTHOR_API_VERSION } from '@eleckoi/author-sdk'

const root = mkdtempSync(join(tmpdir(), 'eleckoi-native-author-'))
const profile = join(root, 'home', 'profiles', 'desktop')
const htmlResources = ['@eleckoi/dsh-client-html-resources']
initProfile(profile, [...PROFILE_TEMPLATES.web.bundles, ...ELECKOI_DESKTOP_BUNDLES])
registerDesktopBundles(profile)
const manifest = readProfileManifest('dsh', profile)
writeProfileBundles(profile, manifest, manifest.dsh.profile.bundles.filter(name => !htmlResources.includes(name)))
mkdirSync(join(root, 'workspace'))
const hosts = []
const options = {
  runtimeDataRoot: root, workspaceRoot: join(root, 'workspace'),
  productDatabasePath: join(root, 'product.sqlite'), productMediaRoot: join(root, 'media'),
  presetTemplatePath: resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'),
  agentPatchPath: resolve('apps/desktop/resources/dsh/desktop-agent.patch.yml'), executablePath: process.execPath,
}

async function connect() {
  const host = new DshDesktopPluginHost(options)
  hosts.push(host)
  const ready = await host.start()
  const boot = ready.injections.find(row => row?.kind === 'global' && row.name === '__DSH_BOOT__')
  const entries = boot.value.entries.map(entry => entry.id)
  assert(entries.includes('@eleckoi/dsh-client-author'))
  assert(entries.includes('@eleckoi/dsh-client-character-configuration'))
  for (const name of htmlResources) assert(!entries.includes(name))
  assert(!readProfileManifest('dsh', profile).dsh.profile.bundles.some(name => htmlResources.includes(name)))
  const handshake = await fetch(ready.url, { redirect: 'manual' })
  const cookie = handshake.headers.get('set-cookie')?.split(';', 1)[0]
  await handshake.body?.cancel()
  assert.equal(handshake.status, 303)
  assert(cookie)
  const response = async (method, args, expectedStatus = 200) => {
    const http = await fetch(new URL(`/api/${method}`, ready.url), {
      method: 'POST', headers: { cookie, origin: new URL(ready.url).origin,
        'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'synthetic-native-author', method, payload: { args } }),
    })
    assert.equal(http.status, expectedStatus, method)
    if (expectedStatus !== 200) { await http.body?.cancel(); return }
    return (await http.json()).result
  }
  const call = async (method, args) => {
    const result = await response(method, args)
    assert.notEqual(result.ok, false, `${method}: ${JSON.stringify(result)}`)
    return result.value ?? result
  }
  await response('eleckoiCompatibility/capabilities', {}, 404)
  await response('eleckoiAuthorPlugins/capabilities', {}, 404)
  const asset = async path => {
    const http = await fetch(new URL(path, ready.url), { headers: { cookie } })
    assert(http.ok, `${path}: HTTP ${http.status}`)
    return http.text()
  }
  const legacy = await fetch(new URL('/eleckoi/html/html-libraries.global.js', ready.url), { headers: { cookie } })
  assert.equal(legacy.status, 404)
  await legacy.body?.cancel()
  return { host, call, response, asset }
}

try {
  const first = await connect()
  const characterId = 'synthetic-native-character'
  await first.call('eleckoiCharacters/create', { character: { id: characterId, name: 'Synthetic native character' } })
  const preset = await first.call('eleckoiAgentPresets/create', { name: 'Synthetic native preset', libraryGroupId: '', purpose: 'roleplay' })
  await first.call('eleckoiAgentPresets/setActive', { presetId: preset.id })
  const config = await first.call('eleckoiCharacterConfiguration/readVariableConfig', { characterId })
  const active = config.versions.filter(version => version.id === config.activeVersionId)
  assert.equal(active.length, 1)
  const fields = { initialStateJson: '{"value":1}', variables: [{ id: 'synthetic-value', title: 'value', objectId: '',
    enabled: true, type: 'number', defaultValue: '1', description: '', updateRule: '', readMode: 'on_demand',
    order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' }],
    schemaCode: 'z.looseObject({value:z.number().min(0)}).transform(state=>({...state,value:state.value+1,derived:state.value*2}))' }
  Object.assign(config, fields)
  Object.assign(active[0], fields)
  await first.call('eleckoiCharacterConfiguration/saveVariableConfig', { characterId, config })
  const openings = await first.call('eleckoiCharacterConfiguration/readCharacterOpenings', { characterId })
  await first.call('eleckoiCharacterConfiguration/saveCharacterOpenings', { characterId, value: { ...openings,
    defaultOpeningMessageId: 'synthetic-native-opening', openingMessages: [{ id: 'synthetic-native-opening',
      title: 'Synthetic native opening', content: 'Synthetic opening', variableVersionId: config.activeVersionId }] } })
  const chat = await first.call('eleckoiConversations/create', {
    input: { title: 'Synthetic native chat', metadata: { characterId } },
  })
  const conversationId = chat.conversation.id
  const original = await first.call('eleckoiAuthorVariables/getState', { conversationId })
  const rejected = await first.response('eleckoiAuthorVariables/setState', { conversationId, stateJson: '{"value":-1}' })
  assert.equal(rejected.ok, false)
  assert.equal(await first.call('eleckoiAuthorVariables/getState', { conversationId }), original)
  const accepted = await first.call('eleckoiAuthorVariables/setState', { conversationId, stateJson: '{"value":3}' })
  assert.deepEqual(JSON.parse(accepted), { value: 4, derived: 6 })

  for (const [scope, ownerId] of [['global', ''], ['preset', preset.id], ['character', characterId]]) {
    const library = await first.call('eleckoiCharacterConfiguration/readScriptLibrary', { scope, ownerId })
    library.enabled = true
    library.trees = [{ type: 'script', id: 'synthetic-script', name: 'Synthetic native script', enabled: true,
      content: 'export default () => () => {};', info: '', data: {}, button: { enabled: false, buttons: [] },
      export_with: { data: true, button: true }, runtime: { kind: 'eleckoi-module', apiVersion: 1 } }]
    await first.call('eleckoiCharacterConfiguration/saveScriptLibrary', { library })
  }
  const catalog = await first.call('eleckoiAuthorScripts/read', { conversationId })
  assert.deepEqual(catalog.scripts.map(script => script.scope), ['global', 'preset', 'character'])
  assert.equal(new Set(catalog.scripts.map(script => script.key)).size, 3)
  for (const script of catalog.scripts) assert.equal(await first.asset(script.entryUrl), script.source)
  const global = await first.call('eleckoiCharacterConfiguration/readScriptLibrary', { scope: 'global', ownerId: '' })
  global.enabled = false
  await first.call('eleckoiCharacterConfiguration/saveScriptLibrary', { library: global })
  assert.deepEqual((await first.call('eleckoiAuthorScripts/read', { conversationId })).scripts.map(script => script.scope), ['preset', 'character'])

  const owner = { scope: 'character', characterId }
  const html = `<!doctype html><html><head><meta name="eleckoi-author-api" content="${AUTHOR_API_VERSION}"></head><body><button>Confirm</button></body></html>`
  const workspace = await first.call('eleckoiAuthorFrontends/importProject', { owner, input: {
    select: false, name: 'Synthetic native page', files: [{ path: 'index.html', content: html }],
    manifest: { manifestVersion: 1, sdkVersion: AUTHOR_API_VERSION, scope: 'character', entryFile: 'index.html',
      bindings: [{ target: 'root', view: 'chat', entryFile: 'index.html' }] },
  } })
  assert.equal(workspace.projects.length, 1)
  assert.equal(workspace.selectedProjectId, null)
  const project = workspace.projects[0]
  await first.call('eleckoiAuthorFrontends/select', { owner, projectId: project.id })
  assert.equal(await first.asset(`/eleckoi/frontends/${project.id}/index.html`), html)
  await first.host.close()

  const reopened = await connect()
  assert.equal(await reopened.call('eleckoiAuthorVariables/getState', { conversationId }), accepted)
  const restored = await reopened.call('eleckoiAuthorFrontends/workspace', { owner })
  assert.equal(restored.selectedProjectId, project.id)
  assert.equal(await reopened.asset(`/eleckoi/frontends/${project.id}/index.html`), html)
  const restoredScripts = await reopened.call('eleckoiAuthorScripts/read', { conversationId })
  assert.deepEqual(restoredScripts.scripts.map(script => script.scope), ['preset', 'character'])
  for (const script of restoredScripts.scripts) assert.equal(await reopened.asset(script.entryUrl), script.source)
  process.stdout.write('Native desktop Host boots and reopens without compatibility services or assets; native variables, single Zod processing, Zod failure retry, three script owners and frontend files passed.\n')
} finally {
  for (const host of hosts.reverse()) await host.close()
  const absolute = resolve(root)
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('eleckoi-native-author-')) {
    throw new Error('Refusing to remove an unexpected probe directory')
  }
  rmSync(absolute, { recursive: true, force: true })
}
