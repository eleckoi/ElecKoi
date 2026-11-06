import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { initProfile, loadLayeredEnv, loadProfileDirectory, readProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { INSTALL_ANCHOR, runProfile } from '@deepseek-ai/dsh/profile-boot'

const bundleName = '@eleckoi/dsh-web-search-tavily'
const root = mkdtempSync(join(tmpdir(), 'eleckoi-tavily-bundle-'))
const home = join(root, 'home')
const profilePath = join(home, 'profiles', 'desktop')
const probePatch = join(root, 'probe.patch.yml')
const previousHome = process.env.DSH_HOME
const previousTelemetry = process.env.DSH_TELEMETRY_DISABLED
process.env.DSH_HOME = home
process.env.DSH_TELEMETRY_DISABLED = '1'
initProfile(profilePath, [...PROFILE_TEMPLATES.web.bundles, bundleName])
writeFileSync(probePatch, '- id: desktop-product-telemetry\n  disabled: true\n- id: product-analytics\n  disabled: true\n')

let running
async function start() {
  const profile = loadProfileDirectory('dsh', profilePath, INSTALL_ANCHOR)
  return runProfile({
    environment: loadLayeredEnv('dsh'),
    profile: 'desktop',
    resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR },
    patchFiles: [probePatch],
    args: ['--no-open', '--port', '0']
  })
}

try {
  running = await start()
  const selected = (await running.ctx.pluginManager.listBundles()).find(row => row.name === bundleName)
  if (!selected?.enabled || !selected.rows.some(row => row.rowId === 'web-search-tavily')) {
    throw new Error(`Tavily bundle did not enter DSH plugin management: ${JSON.stringify(selected)}`)
  }
  if (selected.meta?.title?.zh !== 'Tavily 联网搜索') {
    throw new Error(`Tavily bundle is missing its Chinese title: ${JSON.stringify(selected.meta)}`)
  }
  const disabled = await running.ctx.pluginManager.setBundleEnabled(bundleName, false)
  if (disabled.application !== 'applied') throw new Error(`Tavily disable failed: ${JSON.stringify(disabled)}`)
  const enabled = await running.ctx.pluginManager.setBundleEnabled(bundleName, true)
  if (enabled.application !== 'applied') throw new Error(`Tavily enable failed: ${JSON.stringify(enabled)}`)
  const disabledAgain = await running.ctx.pluginManager.setBundleEnabled(bundleName, false)
  if (disabledAgain.application !== 'applied') throw new Error(`Tavily second disable failed: ${JSON.stringify(disabledAgain)}`)
  const persisted = readProfileManifest('dsh', profilePath).dsh?.profile?.bundles ?? []
  if (persisted.includes(bundleName) || loadProfileDirectory('dsh', profilePath, INSTALL_ANCHOR).layers
    .some(layer => layer.packageName === bundleName)) {
    throw new Error('Tavily disable was not saved for the next start')
  }
  process.stdout.write('ElecKoi Tavily bundle is managed by DSH; enable, disable and saved profile passed.\n')
} finally {
  if (running) await running.shutdown.shutdown(0)
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  if (previousTelemetry === undefined) delete process.env.DSH_TELEMETRY_DISABLED
  else process.env.DSH_TELEMETRY_DISABLED = previousTelemetry
  const absolute = resolve(root)
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('eleckoi-tavily-bundle-')) {
    throw new Error('Refusing to remove an unexpected probe directory')
  }
  rmSync(absolute, { recursive: true, force: true })
}
