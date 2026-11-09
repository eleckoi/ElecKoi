import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const installation = resolve(process.argv[2] ?? 'build/android-runtime/closure')
const anchor = join(installation, 'package.json')
const manifest = JSON.parse(readFileSync(anchor, 'utf8'))
assert.equal(manifest.name, '@eleckoi/android-host')
const require = createRequire(anchor)
const { ELECKOI_ANDROID_BUNDLES } = await import(pathToFileURL(require.resolve('@eleckoi/android-host')).href)
const { initProfile, loadProfileDirectory } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
const { PROFILE_TEMPLATES } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-official-bundles')).href)
const bundles = [...PROFILE_TEMPLATES.web.bundles, ...ELECKOI_ANDROID_BUNDLES]
for (const name of bundles) {
  assert(Object.hasOwn(manifest.dependencies ?? {}, name), `Android Host must declare its selected profile bundle: ${name}`)
}
const directory = mkdtempSync(join(tmpdir(), 'eleckoi-android-profile-check-'))
try {
  initProfile(directory, bundles)
  const profile = loadProfileDirectory('dsh', directory, anchor)
  assert.deepEqual(profile.skippedBundles, [], 'The staged Android installation must resolve every selected profile bundle')
  assert.deepEqual(profile.layers.map(layer => layer.packageName), bundles)
  process.stdout.write(`Android offline profile resolved ${profile.layers.length} declared bundles through the official loader.\n`)
} finally {
  assert(resolve(directory).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')))
  rmSync(directory, { recursive: true, force: true })
}
