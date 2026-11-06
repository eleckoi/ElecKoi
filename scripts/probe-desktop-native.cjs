const { app, ipcMain, net, session } = require('electron')
const { dirname, resolve } = require('node:path')
const Module = require('node:module')
const { buildSync } = Module.createRequire(require.resolve('vite'))('esbuild')

exports.loadNativeModule = relative => {
  const entry = resolve(relative), loaded = new Module(entry, module)
  loaded.paths = Module._nodeModulePaths(dirname(entry))
  loaded._compile(buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    alias: { '@shared': resolve('packages/shared/src') } }).outputFiles[0].text, entry)
  return loaded.exports
}

exports.installProbeDesktopNative = ({ window, root, getReady, host, overlays }) => {
  const load = name => exports.loadNativeModule(`apps/desktop/src/main/platform/electron/dsh/${name}.ts`)
  const { DESKTOP_IPC } = exports.loadNativeModule('packages/shared/src/contracts/desktopNative.ts')
  const owner = event => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Unowned probe frame')
    return window
  }
  const shortcuts = load('keyboard').installDesktopShortcuts(() => window, root,
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux', () => {}, item => overlays.input(item))
  shortcuts.attach(window)
  load('file-actions').installFileActions(owner, () => getReady().url)
  const stopDrag = load('file-drag').installDesktopFileDrag(owner, (address, signal) => host.resolveDragResource(address, signal))
  load('directory-picker').installDesktopDirectoryPicker(() => window)
  load('microphone-permissions').installMicrophonePermissions(session.defaultSession, () => window.webContents)
  const { connectDesktopWelcome } = load('welcome-backend')
  ipcMain.handle(DESKTOP_IPC.deviceInfo, event => { owner(event); return load('device-info').readDeviceInfo() })
  ipcMain.handle(DESKTOP_IPC.localeBootstrap, async event => {
    owner(event)
    const backend = await connectDesktopWelcome(getReady().url, (url, init) => net.fetch(url, init))
    return { languages: ['zh-CN'], preference: await backend.readLocalePreference() }
  })
  return async () => { shortcuts.dispose(); await stopDrag() }
}
