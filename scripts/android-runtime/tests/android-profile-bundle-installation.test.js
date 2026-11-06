import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { exposeInstallationPackages } from '../stage-production-closure.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const hostManifest = JSON.parse(readFileSync(join(repo, 'apps/android-host/package.json'), 'utf8'))
const hostRequire = createRequire(join(repo, 'apps/android-host/package.json'))
const officialLoader = pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-app-boot')).href
const directories = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true)
    rmSync(directory, { recursive: true, force: true })
  }
})

function loadIsolatedInstallation({ omitBase = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-bundle-installation-'))
  directories.push(directory)
  const bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
  const root = { ...hostManifest, dependencies: { ...hostManifest.dependencies } }
  if (omitBase) delete root.dependencies[bundles[0]]
  writeFileSync(join(directory, 'package.json'), JSON.stringify(root))
  const record = (name, suffix) => ({ name, version: '0.2.2-rc.1', directory: `node_modules/.eleckoi-packages/${suffix}`, dependencies: [] })
  const ownedBase = record(bundles[0], 'base-owned')
  const otherBase = record(bundles[0], 'base-other-peer-context')
  const web = record(bundles[1], 'web-owned')
  for (const item of [ownedBase, otherBase, web]) {
    const packageDirectory = join(directory, item.directory)
    mkdirSync(packageDirectory, { recursive: true })
    writeFileSync(join(packageDirectory, 'package.json'), JSON.stringify({
      name: item.name, version: item.version, dsh: { bundle: { patch: './cordis.patch.yml' } }
    }))
    writeFileSync(join(packageDirectory, 'cordis.patch.yml'), '[]\n')
  }
  exposeInstallationPackages(directory, { packages: [
    { name: root.name, version: root.version, directory: '', dependencies: [ownedBase, web]
      .filter(item => Object.hasOwn(root.dependencies, item.name)).map(item => ({ name: item.name, directory: item.directory })) },
    ownedBase, otherBase, web
  ] })
  const script = `
    import { initProfile, loadProfileDirectory } from ${JSON.stringify(officialLoader)};
    const { PROFILE_TEMPLATES } = await import(${JSON.stringify(pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-official-bundles')).href)});
    const directory = ${JSON.stringify(directory)};
    const profileDirectory = directory + '/profile';
    initProfile(profileDirectory, PROFILE_TEMPLATES.web.bundles);
    const profile = loadProfileDirectory('dsh', profileDirectory, directory + '/package.json');
    console.log(JSON.stringify({ skipped: profile.skippedBundles, layers: profile.layers.map(layer => ({ name: layer.packageName, directory: layer.packageDir })) }));
  `
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', windowsHide: true, timeout: 15000
  }))
}

describe('Android application-owned profile installation', () => {
  it('resolves the declared base bundle when another peer instance exists', () => {
    const result = loadIsolatedInstallation()
    expect(result.skipped).toEqual([])
    expect(result.layers.map(layer => layer.name)).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    expect(realpathSync(result.layers[0].directory).endsWith(`${sep}base-owned`)).toBe(true)
  }, 20000)

  it('reports the missing base entry instead of selecting an arbitrary peer instance', () => {
    const result = loadIsolatedInstallation({ omitBase: true })
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].packageName).toBe('@deepseek-ai/dsh-base')
    expect(result.skipped[0].reason).toContain('cannot resolve profile bundle')
    expect(result.layers.map(layer => layer.name)).toEqual(['@deepseek-ai/dsh-web-app'])
  }, 20000)
})
