import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { dshClientPages } from './dsh-client-pages.mjs'
import { dshBundleAssets, verifyDshBundleAssets } from './dsh-bundle-assets.mjs'

const require = createRequire(import.meta.url)
const { verifyWindowsUpdaterConfig } = require('../apps/desktop/scripts/windows-updater-config.cjs')
const unpacked = process.env.ELECKOI_UNPACKED_DIR ?? join(process.cwd(), 'release', 'win-unpacked')
verifyWindowsUpdaterConfig(unpacked, process.cwd())
const manifest = JSON.parse(readFileSync(join(process.cwd(), 'apps/desktop/resources/dsh/runtime-manifest.json'), 'utf8'))
const bundleAssets = Object.fromEntries(await Promise.all(manifest.desktopProfile.bundles.map(async name =>
  [name, await dshBundleAssets(dirname(require.resolve(`${name}/package.json`)))])))

const executable = join(unpacked, 'ElecKoi.exe')
const appAsar = join(unpacked, 'resources', 'app.asar')

if (!existsSync(executable) || !existsSync(appAsar)) {
  throw new Error(`找不到已解包的 ElecKoi：${unpacked}`)
}

const probe = `
  import('node:fs/promises').then(async ({ access, mkdtemp, readFile, rm }) => {
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { pathToFileURL } = await import('node:url')
    const unpacked = ${JSON.stringify(unpacked)}
    const appAsar = ${JSON.stringify(appAsar)}
    const verifyBundleAssets = ${verifyDshBundleAssets.toString()}
    const bundleAssets = ${JSON.stringify(bundleAssets)}
    const mainSource = await readFile(join(appAsar, 'out', 'main', 'main.js'), 'utf8')
    const externalUpdaterDependencies = ['electron-updater', 'builder-util-runtime', 'debug', 'sax']
    for (const dependency of externalUpdaterDependencies) {
      const loadMarkers = ['require("' + dependency, "require('" + dependency]
      if (loadMarkers.some((marker) => mainSource.includes(marker))) {
        throw new Error('Packaged main process still loads ' + dependency + ' as an external dependency.')
      }
    }
    if (!mainSource.includes('class AppUpdater') || !mainSource.includes('NsisUpdater')) {
      throw new Error('Packaged main process does not contain the bundled updater runtime.')
    }
    process.stdout.write('Packaged updater runtime check passed.\\n')
    const buildTimeBrowserPackages = [
      '@fortawesome/fontawesome-free',
      '@tailwindcss/browser',
      'jquery',
      'jquery-ui-dist',
      'jquery-ui-touch-punch',
      'lodash',
      'pixi.js',
      'showdown',
      'toastr',
      'vue',
      'vue-router'
    ]
    for (const dependency of buildTimeBrowserPackages) {
      try {
        await access(join(appAsar, 'node_modules', ...dependency.split('/')))
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        throw error
      }
      throw new Error('Build-time browser package leaked into app.asar: ' + dependency)
    }
    process.stdout.write('Packaged browser dependency boundary check passed.\\n')
    try {
      await access(join(appAsar, 'node_modules', 'pnpm'))
      throw new Error('pnpm leaked into app.asar; the packaged runtime must use apps/desktop/resources/dsh/pnpm only.')
    } catch (error) {
      if (error?.code === 'ENOENT') {
        process.stdout.write('Packaged pnpm duplication check passed.\\n')
      } else {
        throw error
      }
    }
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-shell', 'src', 'client.js'))
    const desktopManifest = JSON.parse(await readFile(join(appAsar, 'resources', 'dsh', 'runtime-manifest.json'), 'utf8'))
    for (const name of desktopManifest.desktopProfile.bundles) {
      const directory = join(appAsar, 'node_modules', ...name.split('/'))
      const declaration = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      const patches = declaration.dsh?.bundle?.patch
      if (!patches) throw new Error('Packaged plugin has no bundle declaration: ' + name)
      for (const patch of Array.isArray(patches) ? patches : [patches]) await access(join(directory, patch))
      await verifyBundleAssets(directory, bundleAssets[name])
    }
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-conversations', 'src', 'client.js'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-creator-studio', 'src', 'client.js'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-roleplay', 'src', 'client.js'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-roleplay', 'src', 'index.js'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-roleplay', 'cordis.patch.yml'))
    for (const moduleName of [
      'agent-preset-bridge.mjs', 'conversation-context.mjs', 'request-config.mjs',
      'session-snapshot.mjs', 'tool-policy.mjs', 'required-setting-cache.mjs'
    ]) {
      await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-roleplay', 'src', 'host', moduleName))
    }
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-web-search-tavily', 'package.json'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-web-search-tavily', 'cordis.patch.yml'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-web-search-tavily', 'src', 'index.js'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-web-search-tavily', 'locale', 'zh.json'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-characters', 'src', 'client.js'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-character-configuration', 'src', 'client.js'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-models', 'src', 'client.js'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-persona', 'src', 'client.js'))
    await access(join(appAsar, 'node_modules', '@eleckoi', 'dsh-client-presets', 'src', 'client.js'))
    process.stdout.write('Packaged ElecKoi DSH client module is present.\\n')
    const productRenderer = join(appAsar, 'node_modules', '@eleckoi', 'web-client', 'dist')
    const productHtml = await readFile(join(productRenderer, 'dsh.html'), 'utf8')
    const productScript = productHtml.match(/<script\\b[^>]*\\bsrc="\\.\\/assets\\/([^"\\s]+\\.js)"/i)?.[1]
    const productStyle = productHtml.match(/<link\\b[^>]*\\bhref="\\.\\/assets\\/([^"\\s]+\\.css)"/i)?.[1]
    if (!productScript || !productStyle) throw new Error('Packaged ElecKoi DSH renderer entry is incomplete.')
    await access(join(productRenderer, 'assets', productScript))
    await access(join(productRenderer, 'assets', productStyle))
    for (const pageAsset of ${JSON.stringify(dshClientPages.map(page => `eleckoi-page-${page.key}.js`))}) {
      await access(join(productRenderer, 'assets', pageAsset))
    }
    process.stdout.write('Packaged ElecKoi DSH renderer assets are present.\\n')
    const runtimeUrl = pathToFileURL(join(appAsar, 'node_modules', '@eleckoi', 'desktop-host', 'dist', 'index.mjs')).href
    const { DshDesktopPluginHost, ELECKOI_DESKTOP_RECOVERY_BUNDLES } = await import(runtimeUrl)
    const packageManagerPath = join(unpacked, 'resources', 'dsh', 'pnpm', 'bin', 'pnpm.mjs')
    const nodeBinPath = join(unpacked, 'resources', 'dsh', 'node-bin')
    await access(packageManagerPath)
    await access(join(nodeBinPath, 'node.cmd'))
    const pluginRoot = await mkdtemp(join(tmpdir(), 'eleckoi-packaged-plugin-host-'))
    const pluginHost = new DshDesktopPluginHost({
      runtimeDataRoot: pluginRoot,
      workspaceRoot: join(pluginRoot, 'workspace'),
      productDatabasePath: join(pluginRoot, 'product.sqlite'),
      productMediaRoot: join(pluginRoot, 'media'),
      presetTemplatePath: join(appAsar, 'resources', 'dsh', 'agent-preset-template', 'agent.cordis.yml'),
      agentPatchPath: join(appAsar, 'resources', 'dsh', 'desktop-agent.patch.yml'),
      executablePath: process.execPath,
      packageManager: { entryPath: packageManagerPath, nodeBinPath }
    })
    try {
      const ready = await pluginHost.start()
      const desktopProfile = JSON.parse(await readFile(join(pluginRoot, 'home', 'profiles', 'desktop', 'package.json'), 'utf8'))
      for (const name of ELECKOI_DESKTOP_RECOVERY_BUNDLES) {
        if (!desktopProfile.dsh?.profile?.bundles?.includes(name)) {
          throw new Error('Packaged DSH profile did not register ' + name)
        }
      }
      for (const name of desktopManifest.desktopProfile.bundles) {
        if (!ELECKOI_DESKTOP_RECOVERY_BUNDLES.includes(name) && desktopProfile.dsh?.profile?.bundles?.includes(name)) {
          throw new Error('Packaged DSH profile enabled an optional bundle by default: ' + name)
        }
      }
      if (!desktopProfile.dsh?.profile?.bundles?.includes('@eleckoi/dsh-web-search-tavily')) {
        throw new Error('Packaged DSH profile did not select the ElecKoi Tavily bundle.')
      }
      const response = await fetch(ready.url, { redirect: 'manual' })
      if (response.status !== 303 || !response.headers.get('set-cookie')) {
        throw new Error('Packaged plugin Host did not issue the client login cookie.')
      }
      if (!JSON.stringify(ready.injections).includes('dsh-client-ui-plugin-manager')) {
        throw new Error('Packaged plugin Host did not load the official plugin manager.')
      }
      if (!ready.injections.some(row => row?.kind === 'global' && row?.name === '__DSH_BOOT__'
        && row.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-shell'))) {
        throw new Error('Packaged plugin Host did not load the ElecKoi client shell.')
      }
      if (!ready.injections.some(row => row?.kind === 'global' && row?.name === '__DSH_BOOT__'
        && row.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-conversations'))) {
        throw new Error('Packaged plugin Host did not load the ElecKoi conversation model.')
      }
      if (!ready.injections.some(row => row?.kind === 'global' && row?.name === '__DSH_BOOT__'
        && row.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-creator-studio'))) {
        throw new Error('Packaged plugin Host did not load the ElecKoi creator studio model.')
      }
      if (!ready.injections.some(row => row?.kind === 'global' && row?.name === '__DSH_BOOT__'
        && row.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-roleplay'))) {
        throw new Error('Packaged plugin Host did not load the ElecKoi roleplay view.')
      }
      if (await pluginHost.updateTasks('inspect') !== false) {
        throw new Error('Packaged plugin Host reported unexpected active tasks.')
      }
      if (!ready.injections.some(row => row?.kind === 'global' && row?.name === '__DSH_BOOT__'
        && row.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-characters'))) {
        throw new Error('Packaged plugin Host did not load the ElecKoi character model.')
      }
      if (!ready.injections.some(row => row?.kind === 'global' && row?.name === '__DSH_BOOT__'
        && row.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-character-configuration'))) {
        throw new Error('Packaged plugin Host did not load the ElecKoi character configuration model.')
      }
      if (!ready.injections.some(row => row?.kind === 'global' && row?.name === '__DSH_BOOT__'
        && row.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-models'))) {
        throw new Error('Packaged plugin Host did not load the ElecKoi model catalog.')
      }
      if (!ready.injections.some(row => row?.kind === 'global' && row?.name === '__DSH_BOOT__'
        && row.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-persona'))) {
        throw new Error('Packaged plugin Host did not load the ElecKoi user profile model.')
      }
      if (!ready.injections.some(row => row?.kind === 'global' && row?.name === '__DSH_BOOT__'
        && row.value?.entries?.some(entry => entry.id === '@eleckoi/dsh-client-presets'))) {
        throw new Error('Packaged plugin Host did not load the ElecKoi preset model.')
      }
      process.stdout.write('Packaged DSH plugin Host and client bootstrap passed.\\n')
    } finally {
      await pluginHost.close()
      await rm(pluginRoot, { recursive: true, force: true })
    }
  }).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
`

const result = spawnSync(executable, ['-e', probe], {
  cwd: unpacked,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  timeout: 180_000
})

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Packaged DSH runtime handshake failed.\n')
  process.exit(result.status ?? 1)
}

process.stdout.write(result.stdout)
