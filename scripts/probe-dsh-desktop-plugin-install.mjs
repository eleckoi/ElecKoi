import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve, sep } from 'node:path'
import { initProfile, loadLayeredEnv, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { INSTALL_ANCHOR, runProfile } from '@deepseek-ai/dsh/profile-boot'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'

const require = createRequire(import.meta.url)
const root = mkdtempSync(join(tmpdir(), 'eleckoi-dsh-plugin-install-'))
const home = join(root, 'home')
const profilePath = join(home, 'profiles', 'desktop')
const packageManagerPath = join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs')
const nodeBinPath = join(import.meta.dirname, '..', 'apps', 'desktop', 'resources', 'dsh', 'node-bin')
const probePackagePath = join(root, 'extension')
const probePatch = join(root, 'probe.patch.yml')
const probePackageName = '@eleckoi/plugin-contract-probe'
const requestedSpec = process.argv[2]

function createProbeBundle() {
  mkdirSync(join(probePackagePath, 'src'), { recursive: true })
  mkdirSync(join(probePackagePath, 'locale'), { recursive: true })
  writeFileSync(join(probePackagePath, 'package.json'), JSON.stringify({
    name: probePackageName,
    version: '1.0.0',
    description: 'Temporary ElecKoi plugin contract verification bundle',
    private: true,
    type: 'module',
    engines: { dsh: '0.2.1-rc.5' },
    exports: {
      '.': './src/index.js',
      './client': './src/client.js',
      './locale/*.json': './locale/*.json',
      './package.json': './package.json'
    },
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-renderer'] }
    }
  }, null, 2) + '\n')
  writeFileSync(join(probePackagePath, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: eleckoi-plugin-contract-probe',
    "      name: './src/index.js'",
    ''
  ].join('\n'))
  writeFileSync(join(probePackagePath, 'src', 'index.js'), [
    "export const name = 'eleckoi-plugin-contract-probe'",
    'export function apply() {}',
    ''
  ].join('\n'))
  writeFileSync(join(probePackagePath, 'src', 'client.js'), [
    'window.__ModuleLoader__.load({',
    `  id: '${probePackageName}',`,
    '  factory(require) {',
    "    const React = require('react')",
    '    return {',
    "      inject: ['slots'],",
    '      apply(ctx) {',
    "        ctx.slots.inject('eleckoi.character.editor.card', () => ctx.slots.register({",
    "          name: 'eleckoi.character.editor.card',",
    `          registrant: '${probePackageName}',`,
    '          select: owner => owner?.characterId ? owner : null',
    "        }, ({ matched }) => React.createElement('div', null, matched.characterId)))",
    '      }',
    '    }',
    '  }',
    '})',
    ''
  ].join('\n'))
  writeFileSync(join(probePackagePath, 'locale', 'en.json'), JSON.stringify({
    meta: { title: 'ElecKoi contract probe', description: 'Temporary plugin verification.' }
  }, null, 2) + '\n')
  writeFileSync(join(probePackagePath, 'locale', 'zh.json'), JSON.stringify({
    meta: { title: 'ElecKoi 接入验证', description: '临时插件接入验证。' }
  }, null, 2) + '\n')
}

function verifyClientContract(sourcePath) {
  const core = new SlotCore()
  const stopRoot = core.register({
    name: 'root',
    children: { 'eleckoi.character.editor.card': { kind: 'chain', scope: 'root' } }
  }, () => null)
  const disposers = []
  let registration
  runInNewContext(readFileSync(sourcePath, 'utf8'), {
    window: { __ModuleLoader__: { load: value => { registration = value } } }
  })
  const plugin = registration.factory(name => {
    if (name === 'react') return { createElement: (component, props, ...children) => ({ component, props, children }) }
    throw new Error(`Unexpected client dependency: ${name}`)
  })
  plugin.apply({
    slots: {
      inject: (_name, factory) => { const dispose = factory(); disposers.push(dispose); return dispose },
      register: core.register.bind(core)
    }
  })
  const entry = core.entriesOfSlot('eleckoi.character.editor.card')[0]
  if (entry?.registrant !== probePackageName || entry.select?.({ characterId: 'character-1' })?.characterId !== 'character-1') {
    throw new Error('Installed client plugin did not attach to the ElecKoi character editor contract')
  }
  for (const dispose of disposers.reverse()) dispose()
  stopRoot()
}

if (!requestedSpec) createProbeBundle()
const packageSpec = requestedSpec ?? probePackagePath
const priorHome = process.env.DSH_HOME
const priorTelemetry = process.env.DSH_TELEMETRY_DISABLED
process.env.DSH_HOME = home
process.env.DSH_TELEMETRY_DISABLED = '1'
initProfile(profilePath, PROFILE_TEMPLATES.web.bundles)
writeFileSync(probePatch, '- id: desktop-product-telemetry\n  disabled: true\n- id: product-analytics\n  disabled: true\n')
let running

async function startProfile() {
  const profile = loadProfileDirectory('dsh', profilePath, INSTALL_ANCHOR)
  return runProfile({
    environment: loadLayeredEnv('dsh'),
    profile: 'desktop',
    resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR },
    patchFiles: [probePatch],
    args: ['--no-open', '--port', '0'],
    packageManager: {
      command: process.execPath,
      args: ['--expose-internals', packageManagerPath],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
        PATH: `${nodeBinPath}${delimiter}${process.env.PATH ?? ''}`
      }
    }
  })
}

try {
  running = await startProfile()
  const result = await running.ctx.pluginManager.installBundle(packageSpec)
  if (result.application !== 'applied' || !result.bundle) {
    throw new Error(`Plugin installation failed: ${JSON.stringify(result)}`)
  }
  const installed = (await running.ctx.pluginManager.listBundles()).find(bundle => bundle.name === result.bundle)
  if (!installed?.installed || !installed.enabled || !installed.removable) {
    throw new Error(`Installed bundle is not manageable: ${JSON.stringify(installed)}`)
  }
  if (!requestedSpec && installed.meta?.title?.zh !== 'ElecKoi 接入验证') {
    throw new Error(`Installed bundle is missing Chinese metadata: ${JSON.stringify(installed.meta)}`)
  }
  const injections = running.ctx.webServer.collectIndexInjections(ctx.connection.browserPeer)
  if (!JSON.stringify(injections).includes(result.bundle)) {
    throw new Error(`Installed client module ${result.bundle} is missing from the DSH boot table`)
  }
  if (!requestedSpec) verifyClientContract(join(probePackagePath, 'src', 'client.js'))

  await running.shutdown.shutdown(0)
  running = await startProfile()
  const restarted = (await running.ctx.pluginManager.listBundles()).find(bundle => bundle.name === result.bundle)
  if (!restarted?.installed || !restarted.enabled || !restarted.removable) {
    throw new Error(`Installed bundle did not survive a restart: ${JSON.stringify(restarted)}`)
  }
  const disabled = await running.ctx.pluginManager.setBundleEnabled(result.bundle, false)
  if (disabled.application !== 'applied'
    || (await running.ctx.pluginManager.listBundles()).find(bundle => bundle.name === result.bundle)?.enabled !== false) {
    throw new Error(`Bundle disable failed: ${JSON.stringify(disabled)}`)
  }
  const enabled = await running.ctx.pluginManager.setBundleEnabled(result.bundle, true)
  if (enabled.application !== 'applied'
    || (await running.ctx.pluginManager.listBundles()).find(bundle => bundle.name === result.bundle)?.enabled !== true) {
    throw new Error(`Bundle re-enable failed: ${JSON.stringify(enabled)}`)
  }
  const removed = await running.ctx.pluginManager.removeBundle(result.bundle)
  if (removed.application !== 'applied'
    || (await running.ctx.pluginManager.listBundles()).some(bundle => bundle.name === result.bundle && bundle.installed)) {
    throw new Error(`Bundle removal failed: ${JSON.stringify(removed)}`)
  }
  process.stdout.write('DSH plugin install, Chinese metadata, ElecKoi UI contract, restart, disable, enable and removal passed.\n')
} finally {
  if (running !== undefined) {
    await Promise.race([
      running.shutdown.shutdown(0),
      new Promise(resolve => setTimeout(resolve, 10_000))
    ])
  }
  if (priorHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = priorHome
  if (priorTelemetry === undefined) delete process.env.DSH_TELEMETRY_DISABLED
  else process.env.DSH_TELEMETRY_DISABLED = priorTelemetry
  const absolute = resolve(root)
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('eleckoi-dsh-plugin-install-')) {
    throw new Error('Refusing to remove an unexpected probe directory')
  }
  rmSync(absolute, { recursive: true, force: true })
}
