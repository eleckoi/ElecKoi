import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { initProfile, readProfileManifest, writeProfileBundles } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { DshDesktopPluginHost, ELECKOI_DESKTOP_BUNDLES } from '@eleckoi/desktop-host'
import { readDshSessionLog } from '@eleckoi/dsh-runtime'

const require = createRequire(import.meta.url)
// 设定库的 web 源用 @shared 别名（apps/web/vite.config.mjs），而本探针在 Electron 的 Node 里裸跑，
// 没有别名解析器；所以先按同一别名用 esbuild 打包再加载，与 probe-local-media-crop.cjs 同一手法。
const transferPath = resolve('apps/web/src/modules/settingLibraries/model/settingLibraryTransfer.js')
const transferModule = new Module(transferPath)
transferModule._compile(createRequire(require.resolve('vite'))('esbuild').buildSync({
  entryPoints: [transferPath], bundle: true, write: false, platform: 'node', format: 'cjs',
  alias: { '@shared': resolve('packages/shared/src') },
}).outputFiles[0].text, transferPath)
const { importLibraryAsVersion, mergeSettingLibraryEntries, parseSettingLibraryFile, serializeSettingLibrary } = transferModule.exports
const Database = require('better-sqlite3')
const root = mkdtempSync(join(tmpdir(), 'eleckoi-dsh-desktop-'))
const profilePath = join(root, 'home', 'profiles', 'desktop')
mkdirSync(join(root, 'session-snapshots'))
writeFileSync(join(root, 'session-snapshots', 'orphan-session.json'),
  JSON.stringify({ mountedPresetId: 'deleted-preset' }))
writeFileSync(join(root, 'session-snapshots', 'unused-snapshot.json'), '{')
const tavilyBundle = '@eleckoi/dsh-web-search-tavily'
initProfile(profilePath, [...PROFILE_TEMPLATES.web.bundles, '@eleckoi/dsh-client-roleplay'])
const hostOptions = {
  runtimeDataRoot: root,
  workspaceRoot: join(root, 'workspace'),
  productDatabasePath: join(root, 'product.sqlite'),
  productMediaRoot: join(root, 'media'),
  presetTemplatePath: resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml'),
  agentPatchPath: join(process.cwd(), 'apps', 'desktop', 'resources', 'dsh', 'desktop-agent.patch.yml'),
  executablePath: process.execPath,
  packageManager: {
    entryPath: join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs'),
    nodeBinPath: join(process.cwd(), 'apps', 'desktop', 'resources', 'dsh', 'node-bin')
  }
}
const host = new DshDesktopPluginHost(hostOptions)
let reopened

async function remoteCall(ready, cookie, method, args, expectedStatus = 200) {
  const response = await fetch(new URL(`/api/${method}`, ready.url), {
    method: 'POST', headers: { cookie, origin: new URL(ready.url).origin,
      'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'eleckoi-probe', method, payload: { args } }),
  })
  if (response.status !== expectedStatus) throw new Error(`${method}: expected HTTP ${expectedStatus}, got ${response.status}: ${await response.text()}`)
  if (expectedStatus === 404) { await response.body?.cancel(); return null }
  const result = (await response.json()).result
  if (!response.ok || result.ok === false) throw new Error(`${method}: ${JSON.stringify(result)}`)
  return result.value ?? result
}

function productSchema() {
  const db = new Database(hostOptions.productDatabasePath, { readonly: true })
  try {
    return { version: db.pragma('user_version', { simple: true }),
      objects: db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() }
  } finally { db.close() }
}

try {
  const ready = await host.start()
  const profile = readProfileManifest('dsh', profilePath)
  for (const name of ELECKOI_DESKTOP_BUNDLES) {
    if (!profile.dsh?.profile?.bundles?.includes(name)) throw new Error(`Desktop profile is missing ${name}`)
  }
  if (new Set(profile.dsh.profile.bundles).size !== profile.dsh.profile.bundles.length) {
    throw new Error('Desktop profile contains duplicate bundles')
  }
  if (!profile.dsh?.profile?.bundles?.includes(tavilyBundle)) {
    throw new Error('ElecKoi Tavily bundle is missing from the desktop DSH profile')
  }
  const onboarding = ready.injections.find(row =>
    typeof row === 'object' && row !== null && row.kind === 'global' && row.name === '__DSH_MODELS_ONBOARDING__'
  )
  if (onboarding) {
    throw new Error('Embedded DSH model settings remain enabled beside ElecKoi model management')
  }
  const boot = ready.injections.find(row =>
    typeof row === 'object' && row !== null && row.kind === 'global' && row.name === '__DSH_BOOT__'
  )
  if (!boot?.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-shell')) {
    throw new Error('ElecKoi client shell is missing from the DSH client module graph')
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-conversations')) {
    throw new Error('ElecKoi conversation model is missing from the DSH client module graph')
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-creator-studio')) {
    throw new Error('ElecKoi creator studio model is missing from the DSH client module graph')
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-roleplay')) {
    throw new Error('ElecKoi roleplay view is missing from the DSH client module graph: '
      + boot.value.entries.filter(entry => entry.id?.includes('roleplay') || entry.id?.includes('eleckoi')).map(entry => entry.id).join(', '))
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-product-api')) {
    throw new Error('ElecKoi DSH Remote Client assembly is missing from the module graph')
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-html-resources')) {
    throw new Error('HTML presentation resources are missing from the module graph')
  }
  if (await host.updateTasks('inspect') !== false) {
    throw new Error('ElecKoi DSH Host reported unexpected active tasks')
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-characters')) {
    throw new Error('ElecKoi character model is missing from the DSH client module graph')
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-character-configuration')) {
    throw new Error('ElecKoi character configuration model is missing from the DSH client module graph')
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-models')) {
    throw new Error('ElecKoi model catalog is missing from the DSH client module graph')
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-persona')) {
    throw new Error('ElecKoi user profile model is missing from the DSH client module graph')
  }
  if (!boot.value.entries.some(entry => entry.id === '@eleckoi/dsh-client-presets')) {
    throw new Error('ElecKoi preset model is missing from the DSH client module graph')
  }
  const handshake = await fetch(ready.url, { redirect: 'manual' })
  const cookie = handshake.headers.get('set-cookie')?.split(';', 1)[0]
  await handshake.body?.cancel()
  if (handshake.status !== 303 || !cookie) throw new Error('DSH plugin Host authentication failed')
  const response = await fetch(new URL('/', ready.url), { headers: { cookie } })
  if (!response.ok) throw new Error(`DSH plugin Host returned HTTP ${response.status}`)
  const document = await response.text()
  if (!document.includes('<html')) throw new Error('DSH client boot document was not served')
  const schema = productSchema()
  const tableCount = schema.objects.filter(row => row.type === 'table').length
  if (schema.version !== 15 || tableCount !== 49) {
    throw new Error(`Product schema contract mismatch: ${tableCount} tables, user_version ${schema.version}; expected 49 tables and user_version 15`)
  }
  await remoteCall(ready, cookie, 'eleckoiCompatibility/capabilities', {}, 404)
  await remoteCall(ready, cookie, 'eleckoiAuthorPlugins/capabilities', {}, 404)
  const assets = ready.injections.find(row => row?.kind === 'global' && row.name === '__ELECKOI_HTML_RESOURCES__')?.value
  if (!assets?.baseUrl) throw new Error('HTML presentation asset base is missing')
  for (const path of ['client/runtime.js', 'html-libraries.global.js', 'zod-module.js', 'libraries/jquery.min.js']) {
    const asset = await fetch(new URL(assets.baseUrl + path, ready.url), { headers: { cookie } })
    if (!asset.ok || !(await asset.text()).trim()) throw new Error(`SDK resource is missing: ${path}`)
  }
  for (const path of ['tavern-runtime.global.js', 'libraries/tiktoken.global.js', 'assets/mvu-engine.js', 'assets/mvu-schema.js', 'client/application-api.js', 'plugin/synthetic-script', 'panel/synthetic-panel']) {
    const response = await fetch(new URL(assets.baseUrl + path, ready.url), { headers: { cookie } })
    await response.body?.cancel()
    if (response.status !== 404) throw new Error(`Retired runtime resource remains available: ${path}`)
  }
  await remoteCall(ready, cookie, 'eleckoiConversations/list', {})
  await remoteCall(ready, cookie, 'eleckoiCharacters/list', {})
  const created = await remoteCall(ready, cookie, 'eleckoiConversations/create', { input: { title: 'Example chat' } })
  const conversationId = created.conversation.id
  const selected = await remoteCall(ready, cookie, 'eleckoiConversationModels/current', { conversationId })
  const card = { spec: 'chara_card_v3', data: { name: 'Synthetic import card', creator_notes: 'Synthetic introduction',
    first_mes: 'Synthetic opening', character_book: { entries: [{ name: '[InitVar] Initial', enabled: false, content: '{"score":1}' }] },
    extensions: { tavern_helper: { scripts: [{ type: 'script', enabled: true,
      content: "import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js'; const Schema = z.object({ score: z.number() }); eventOn('synthetic-event', () => Schema.parse({ score: 2 })); registerMvuSchema(Schema);" }] } } } }
  const preview = await remoteCall(ready, cookie, 'eleckoiCharacters/prepareImport', { source: 'sillytavern', files: [{
    displayName: 'synthetic-card.json', mimeType: 'application/json', base64: Buffer.from(JSON.stringify(card)).toString('base64'),
  }] })
  if (!preview.items[0].importable || !preview.items[0].warnings.length) throw new Error('Variable rule warning blocked card import')
  const imported = await remoteCall(ready, cookie, 'eleckoiCharacters/commitImport', { token: preview.token })
  const importedCardId = imported.importedCharacterIds[0]
  const initialLibrary = await remoteCall(ready, cookie, 'eleckoiCharacterConfiguration/readSettingLibrary', { characterId: importedCardId })
  const worldbook = parseSettingLibraryFile(JSON.stringify({ name: 'Synthetic worldbook', entries: {
    0: { uid: 0, comment: 'Synthetic keyword setting', content: 'Synthetic setting text', key: ['synthetic-keyword'] },
    1: { uid: 1, comment: 'Synthetic controller', content: '<%- await getwi(null, "Synthetic reference") %>', constant: true },
    2: { uid: 2, comment: 'Synthetic reference', content: 'Synthetic reference text', disable: true },
  } }), 'sillytavern')
  const versionLibrary = importLibraryAsVersion(initialLibrary, worldbook)
  const savedVersionLibrary = await remoteCall(ready, cookie, 'eleckoiCharacterConfiguration/saveSettingLibrary', {
    characterId: importedCardId, library: versionLibrary,
  })
  const mergedLibrary = mergeSettingLibraryEntries(savedVersionLibrary, worldbook, worldbook.entries.map(entry => entry.id)).library
  const savedMergedLibrary = await remoteCall(ready, cookie, 'eleckoiCharacterConfiguration/saveSettingLibrary', {
    characterId: importedCardId, library: mergedLibrary,
  })
  if (savedMergedLibrary.entries.length !== savedVersionLibrary.entries.length + worldbook.entries.length
    || !savedMergedLibrary.versions.some(version => version.id === initialLibrary.activeVersionId)
    || savedMergedLibrary.entries.some(entry => !['plain_text', 'ejs'].includes(entry.contentMode))) {
    throw new Error('Worldbook version import or entry merge did not preserve native settings')
  }
  const savedLibraryExport = serializeSettingLibrary(savedMergedLibrary)
  const importedChatId = await remoteCall(ready, cookie, 'eleckoiConversations/importArchive', { characterId: importedCardId,
    json: [{ chat_metadata: { variables: { score: 9 } } },
      { is_user: false, mes: 'Imported opening', variables: [{ stat_data: { score: 2 } }] },
      { is_user: true, mes: 'Imported input' },
      { is_user: false, mes: 'Imported reply', variables: [{ stat_data: { score: 7 } }] },
    ].map(row => JSON.stringify(row)).join('\n') })
  const importedState = await remoteCall(ready, cookie, 'eleckoiConversations/authorState', { conversationId: importedChatId })
  if (JSON.parse(importedState.currentVariableStateJson).score !== 9) throw new Error('Imported chat variables were not stored natively')
  const importedTimeline = await remoteCall(ready, cookie, 'eleckoiConversations/variableTimeline', { conversationId: importedChatId })
  if (!importedTimeline.floors.some(floor => floor.label !== '开场' && floor.state.root?.score === 7)) {
    throw new Error('Imported message variable history was not stored natively')
  }
  if (existsSync(join(root, 'author-plugins'))) throw new Error('Native import or chat details recreated the retired registry')
  const deletionCases = []
  for (const id of ['synthetic-native-delete', 'synthetic-sdk-delete']) {
    await remoteCall(ready, cookie, 'eleckoiCharacters/create', { character: { id, name: id } })
    const chat = await remoteCall(ready, cookie, 'eleckoiConversations/create', {
      input: { title: id, metadata: { characterId: id } },
    })
    deletionCases.push({ id, conversationId: chat.conversation.id, sessionId: chat.runtimeSessionId })
  }
  await host.close(true)
  for (const item of deletionCases) {
    if (!readDshSessionLog(join(root, 'sessions'), item.sessionId)) {
      throw new Error('Synthetic character chat was not persisted before deletion')
    }
  }
  writeProfileBundles(profilePath, profile, profile.dsh.profile.bundles.filter(name => name !== tavilyBundle))
  reopened = new DshDesktopPluginHost(hostOptions)
  const restored = await reopened.start()
  const restoredHandshake = await fetch(restored.url, { redirect: 'manual' })
  const restoredCookie = restoredHandshake.headers.get('set-cookie')?.split(';', 1)[0]
  await restoredHandshake.body?.cancel()
  if (!restoredCookie) throw new Error('Reopened Host authentication failed')
  const current = await remoteCall(restored, restoredCookie, 'eleckoiConversationModels/current', { conversationId })
  if (current.provider !== selected.provider || current.model !== selected.model) throw new Error('Cold Session model selection changed')
  await remoteCall(restored, restoredCookie, 'eleckoiConversationModels/select', { conversationId, selection: selected })
  const restoredImport = await remoteCall(restored, restoredCookie, 'eleckoiConversations/exportArchive', { conversationId: importedChatId })
  const restoredLibrary = await remoteCall(restored, restoredCookie, 'eleckoiCharacterConfiguration/readSettingLibrary', { characterId: importedCardId })
  if (serializeSettingLibrary(restoredLibrary) !== savedLibraryExport) {
    throw new Error('Imported and merged worldbook settings changed after Host restart')
  }
  const nativeArchive = JSON.parse(restoredImport)
  if (nativeArchive.snapshot.tables.agent_responses.length !== 0
    || !nativeArchive.snapshot.tables.conversation_state_snapshots.some(row => row.phase === 'after'
      && row.variableStateJson !== null && JSON.parse(row.variableStateJson).score === 7)) {
    throw new Error('Imported state history did not survive natively without reply ledger rows')
  }
  if (!nativeArchive.sessionLogs.some(log => log.events.some(event => event.type === 'assistant/message'
    && event.data.message.content.some(block => block.type === 'text' && block.text === 'Imported reply')))) {
    throw new Error('Imported chat transcript did not survive Host restart')
  }
  if (existsSync(join(root, 'author-plugins'))) throw new Error('Host restart recreated the retired registry')
  if (JSON.stringify(productSchema()) !== JSON.stringify(schema)) throw new Error('Host restart changed the product schema')
  if (readProfileManifest('dsh', profilePath).dsh?.profile?.bundles?.includes(tavilyBundle)) {
    throw new Error('ElecKoi re-enabled the Tavily bundle after the user disabled it')
  }
  await remoteCall(restored, restoredCookie, 'eleckoiCharacters/delete', { characterIds: [deletionCases[0].id] })
  await remoteCall(restored, restoredCookie, 'eleckoiCharacters/delete', { characterIds: [deletionCases[1].id] })
  const deletionDatabase = new Database(hostOptions.productDatabasePath, { readonly: true })
  try {
    for (const item of deletionCases) {
      if (deletionDatabase.prepare('SELECT id FROM characters WHERE id = ?').get(item.id)
        || deletionDatabase.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(item.conversationId)
        || readDshSessionLog(join(root, 'sessions'), item.sessionId)) {
        throw new Error('Character deletion retained its character, chat or official Session')
      }
    }
    if (!deletionDatabase.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(conversationId)
      || !readDshSessionLog(join(root, 'sessions'), created.runtimeSessionId)) {
      throw new Error('Character deletion removed an unrelated chat or Session')
    }
    if (deletionDatabase.pragma('foreign_key_check').length
      || deletionDatabase.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('Character deletion violated product data integrity')
    }
  } finally { deletionDatabase.close() }
  if (JSON.stringify(productSchema()) !== JSON.stringify(schema)) throw new Error('Character deletion changed the product schema')
  process.stdout.write('DSH desktop Host, HTML resources, retired runtime boundaries, native storage, cold Session model selection and character/chat deletion passed.\n')
} finally {
  await reopened?.close()
  await host.close()
  const absolute = resolve(root)
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('eleckoi-dsh-desktop-')) {
    throw new Error('Refusing to remove an unexpected probe directory')
  }
  rmSync(absolute, { recursive: true, force: true })
}
