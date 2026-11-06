import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { installWindowsDirectoryInstaller } from './scripts/windows-directory-installer.mjs'
import { prepareWindowsInstallerUi } from '../../scripts/build-windows-installer-ui.mjs'

const config = parse(readFileSync(new URL('./electron-builder.yml', import.meta.url), 'utf8'))
if (process.platform === 'win32') installWindowsDirectoryInstaller()
config.beforeBuild = async () => { await prepareWindowsInstallerUi(); return true }
config.afterPack = fileURLToPath(new URL('./scripts/windows-updater-config.cjs', import.meta.url))
export default config
