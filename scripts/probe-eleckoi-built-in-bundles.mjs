import { ownerPeer } from '../tests/support/owner-peer.js'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { initProfile, loadLayeredEnv, loadProfileDirectory, readProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { OPTIONAL_BUNDLES, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import { ELECKOI_DESKTOP_BUNDLES, ELECKOI_INSTALL_ANCHOR, registerDesktopBundles } from '@eleckoi/desktop-host'

const root = mkdtempSync(join(tmpdir(), 'eleckoi-built-in-bundles-'))
const profilePath = join(root, 'home', 'profiles', 'desktop')
const tavily = '@eleckoi/dsh-web-search-tavily'
const bundleNames = [...ELECKOI_DESKTOP_BUNDLES, tavily]
const requireFromRuntime = createRequire(ELECKOI_INSTALL_ANCHOR)
const declaredDeveloperInterfaceCounts = new Map(bundleNames.map(name => {
  const manifest = requireFromRuntime(`${name}/package.json`)
  const interfaces = manifest.eleckoi?.developerInterfaces
  assert.ok(Array.isArray(interfaces) && interfaces.length > 0, `${name} has no declared developer interfaces`)
  return [name, interfaces.length]
}))
const expectedDeveloperInterfaceCount = [...declaredDeveloperInterfaceCounts.values()]
  .reduce((total, count) => total + count, 0)
const values = {
  DSH_HOME: join(root, 'home'), DSH_TELEMETRY_DISABLED: '1', DSH_SESSION_ROOT: join(root, 'sessions'),
  ELECKOI_SESSION_SNAPSHOT_ROOT: join(root, 'snapshots'), ELECKOI_PRESET_ROOT: join(root, 'presets'),
}
const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
Object.assign(process.env, values)
initProfile(profilePath, [...PROFILE_TEMPLATES.web.bundles, ...ELECKOI_DESKTOP_BUNDLES, tavily])
registerDesktopBundles(profilePath)
const patch = join(root, 'probe.patch.yml')
writeFileSync(patch, '- id: desktop-product-telemetry\n  disabled: true\n- id: product-analytics\n  disabled: true\n')
let running
try {
  const profile = loadProfileDirectory('dsh', profilePath, ELECKOI_INSTALL_ANCHOR)
  assert.deepEqual(profile.skippedBundles, [])
  running = await runProfile({
    environment: loadLayeredEnv('dsh'), profile: 'desktop', resolvedProfile: { profile, installAnchor: ELECKOI_INSTALL_ANCHOR },
    patchFiles: [patch, resolve('apps/desktop/resources/dsh/desktop-agent.patch.yml')], args: ['--no-open', '--port', '0'],
  })
  const manager = running.ctx.pluginManager
  const bundles = await manager.listBundles()
  const plugins = await manager.listPlugins()
  for (const name of OPTIONAL_BUNDLES) {
    const optional = bundles.find(row => row.name === name)
    assert.ok(optional?.optional && !optional.enabled && !optional.error, `${name} is missing from official choices`)
    assert.ok(optional.meta?.title?.zh, `${name} has no Chinese title`)
    const enabled = await manager.setBundleEnabled(name, true)
    assert.equal(enabled.application, 'applied', JSON.stringify(enabled))
    const active = (await manager.listBundles()).find(row => row.name === name)
    assert.ok(active?.enabled && !active.error, `${name} cannot be enabled`)
    assert.ok(active.rows.length > 0, `${name} has no runtime rows`)
    const disabled = await manager.setBundleEnabled(name, false)
    assert.equal(disabled.application, 'applied', JSON.stringify(disabled))
    assert.equal((await manager.listBundles()).find(row => row.name === name)?.enabled, false)
  }
  let developerInterfaceCount = 0
  for (const name of ELECKOI_DESKTOP_BUNDLES) {
    const pkg = bundles.find(row => row.name === name)
    assert.ok(pkg?.enabled, `${name} is not enabled: ${JSON.stringify(pkg)}`)
    assert.equal(pkg.rows.length, name === '@eleckoi/dsh-product-api' ? 2 : 1, name)
    assert.ok(pkg.meta?.title?.zh, `${name} has no Chinese title`)
    assert.equal(
      pkg.developerInterfaces?.length,
      declaredDeveloperInterfaceCounts.get(name),
      `${name} developer interfaces do not match its package manifest`
    )
    developerInterfaceCount += pkg.developerInterfaces.length
    assert.equal(pkg.readOnlyReason, 'management-required', name)
    const moduleName = name === '@eleckoi/dsh-runtime' ? `${name}/session-edit-plugin` : name
    const component = plugins.find(row => row.moduleName === moduleName)
    assert.ok(component, `${moduleName} is absent from the running inventory`)
    assert.equal(component.fiberPhase, 'active', `${moduleName}: ${JSON.stringify(component)}`)
    assert.equal(component.readOnlyReason, 'management-required', moduleName)
    const denied = await manager.setBundleEnabled(name, false)
    assert.equal(denied.error?.code, 'management-required', JSON.stringify(denied))
    assert.equal(denied.changed, false)
    const rowDenied = await manager.setPluginEnabled(component.entryId, false)
    assert.equal(rowDenied.error?.code, 'management-required', JSON.stringify(rowDenied))
    assert.equal(rowDenied.changed, false)
  }
  const tavilyPackage = bundles.find(row => row.name === tavily)
  assert.equal(
    tavilyPackage?.developerInterfaces?.length,
    declaredDeveloperInterfaceCounts.get(tavily),
    `${tavily} developer interfaces do not match its package manifest`
  )
  assert.equal(tavilyPackage.developerInterfaces[0].relation, 'contributes')
  developerInterfaceCount += tavilyPackage.developerInterfaces.length
  assert.equal(developerInterfaceCount, expectedDeveloperInterfaceCount)
  const selectSearch = mode => running.ctx.typertGateway.invoke({ peer: ownerPeer(running.ctx),
    namespace: 'eleckoiWebSearch', method: 'select', args: { mode }
  })
  await selectSearch('tavily')
  await running.ctx.settings.update('web-search-tavily', { maxResults: 8 })
  assert.equal(running.ctx.eleckoiWebSearchApi.selection(), 'tavily')
  for (const name of OPTIONAL_BUNDLES) {
    const result = await manager.setBundleEnabled(name, true)
    assert.equal(result.application, 'applied', JSON.stringify(result))
  }
  registerDesktopBundles(profilePath)
  for (const name of OPTIONAL_BUNDLES) {
    assert.ok(readProfileManifest('dsh', profilePath).dsh.profile.bundles.includes(name), `${name} selection was reset`)
  }
  await running.shutdown.shutdown(0)
  running = await runProfile({
    environment: loadLayeredEnv('dsh'), profile: 'desktop',
    resolvedProfile: { profile: loadProfileDirectory('dsh', profilePath, ELECKOI_INSTALL_ANCHOR), installAnchor: ELECKOI_INSTALL_ANCHOR },
    patchFiles: [patch, resolve('apps/desktop/resources/dsh/desktop-agent.patch.yml')], args: ['--no-open', '--port', '0'],
  })
  assert.equal(running.ctx.eleckoiWebSearchApi.selection(), 'tavily')
  assert.equal(running.ctx.settings.describe().find(row => row.ns === 'web-search-tavily').value.maxResults, 8)
  const restoredBundles = await running.ctx.pluginManager.listBundles()
  for (const name of OPTIONAL_BUNDLES) {
    const restored = restoredBundles.find(row => row.name === name)
    assert.ok(restored?.enabled && !restored.error && restored.rows.length > 0, `${name} did not restore after restart`)
    const result = await running.ctx.pluginManager.setBundleEnabled(name, false)
    assert.equal(result.application, 'applied', JSON.stringify(result))
  }
  await selectSearch('provider_native')
  for (const enabled of [false, true, false]) {
    const result = await running.ctx.pluginManager.setBundleEnabled(tavily, enabled)
    assert.equal(result.application, 'applied', JSON.stringify(result))
  }
  registerDesktopBundles(profilePath)
  assert.ok(!readProfileManifest('dsh', profilePath).dsh.profile.bundles.includes(tavily))
  for (const name of OPTIONAL_BUNDLES) {
    assert.ok(!readProfileManifest('dsh', profilePath).dsh.profile.bundles.includes(name), `${name} disabled selection was reset`)
  }
  process.stdout.write(
    `All ${ELECKOI_DESKTOP_BUNDLES.length} core bundles have real active components, `
    + `${developerInterfaceCount} developer interfaces, and management protection; `
    + `${OPTIONAL_BUNDLES.length} official optional bundles listed, toggled and restored after restart; `
    + 'Tavily lifecycle and saved selection passed.\n'
  )
} finally {
  if (running) await running.shutdown.shutdown(0)
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  const absolute = resolve(root)
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('eleckoi-built-in-bundles-')) {
    throw new Error('Refusing to remove an unexpected probe directory')
  }
  rmSync(absolute, { recursive: true, force: true })
}
