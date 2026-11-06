import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { readInstallerLocales, renderInstallerStrings } from '../apps/desktop/scripts/installer-locales.mjs'
const require = createRequire(import.meta.url)
const { buildSync } = createRequire(require.resolve('vite'))('esbuild')

/** Prepare source-level installer resources; this does not package or run an installer. */
export async function prepareWindowsInstallerUi() {
  if (process.platform !== 'win32') return
  const root = resolve(import.meta.dirname, '..')
  const output = join(root, 'apps/desktop/resources/installer/ui')
  const assets = join(output, 'assets')
  await mkdir(assets, { recursive: true })
  const artwork = buildSync({ entryPoints: [join(root, 'apps/web/src/ui/icons/ElecKoiWordmark.jsx')],
    bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text
  const compiled = { exports: {} }
  new Function('module', 'exports', 'require', artwork)(compiled, compiled.exports, createRequire(import.meta.url))
  const icon = (await readFile(join(root, 'apps/desktop/resources/icons/eleckoi-app-icon.png'))).toString('base64')
  const wordmark = renderToStaticMarkup(React.createElement(compiled.exports.ElecKoiWordmark, { size: 45 }))
  for (const [name, width, height, dark] of [
    ['brand', 600, 196, false], ['brand-2x', 1200, 392, false],
    ['brand-dark', 600, 196, true], ['brand-dark-2x', 1200, 392, true],
    ['uninstaller-sidebar', 164, 314, false]
  ]) {
    const sidebar = name === 'uninstaller-sidebar'
    const group = sidebar
      ? `<image href="data:image/png;base64,${icon}" x="46" y="100" width="72" height="72"/><g transform="translate(12 184) scale(.535)">${wordmark}</g>`
      : `<image href="data:image/png;base64,${icon}" x="118" y="61" width="74" height="74"/><g transform="translate(212 76)">${wordmark}</g>`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${sidebar ? 164 : 600} ${sidebar ? 314 : 196}" color="${dark ? '#f3f4f5' : '#1b1b1d'}">${group}</svg>`
    await sharp(Buffer.from(svg)).png().toFile(join(assets, `${name}.png`))
  }
  await writeFile(join(output, 'strings.nsh'), renderInstallerStrings(readInstallerLocales()), 'utf8')
  const compiledNative = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    join(root, 'apps/desktop/scripts/prepare-windows-installer.ps1'), '-OutputDirectory', output, '-AssetsDirectory', assets],
  { cwd: root, windowsHide: true, stdio: 'inherit' })
  if (compiledNative.status !== 0) throw new Error('Windows installer UI compilation failed.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await prepareWindowsInstallerUi()
