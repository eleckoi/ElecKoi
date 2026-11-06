import { createRequire } from 'node:module'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readProfileManifest, writeProfileBundles } from '@deepseek-ai/dsh-app-boot'
import { HTML_RESOURCES_BUNDLE, replaceHtmlResourceBundles } from '@eleckoi/dsh-client-html-resources/profile'
import bundles from './androidPluginBundleManifest.json'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

export const ELECKOI_INSTALL_ANCHOR = createRequire(import.meta.url).resolve('@eleckoi/android-host/package.json')

export const ELECKOI_ANDROID_BUNDLES: readonly string[] = Object.freeze([...bundles])

const frontendUpgrades = [
  { marker: '.eleckoi-android-frontend-bundles-v2', bundles: ['@eleckoi/dsh-client-author'] }
] as const

/**
 * Register the shipped frontend upgrade once; later bundle selections remain user-owned.
 * RETIRE WHEN: all supported upgrade and profile-restore sources have completed
 * frontend-bundles-v2 and v3. Remove this function, frontendUpgrades, its startup
 * call and upgrade-only tests; keep new-profile initialization and mobile enforcement.
 */
export function registerAndroidFrontendBundles(profileDirectory: string): void {
  const resourceMarker = join(profileDirectory, '.eleckoi-android-frontend-bundles-v3')
  if (!existsSync(resourceMarker)) {
    const manifest = readProfileManifest('dsh', profileDirectory)
    const selected = manifest.dsh?.profile?.bundles ?? []
    const resources = replaceHtmlResourceBundles(selected)
    if (!existsSync(join(profileDirectory, '.eleckoi-android-frontend-bundles-v1')) && !resources.includes(HTML_RESOURCES_BUNDLE)) {
      resources.push(HTML_RESOURCES_BUNDLE)
    }
    if (resources.length !== selected.length || resources.some((name, index) => name !== selected[index])) {
      writeProfileBundles(profileDirectory, manifest, resources)
    }
    writeFileSync(resourceMarker, 'initialized\n', { flag: 'wx' })
  }
  for (const upgrade of frontendUpgrades) {
    const marker = join(profileDirectory, upgrade.marker)
    if (existsSync(marker)) continue
    for (const name of upgrade.bundles) {
      if (!ELECKOI_ANDROID_BUNDLES.includes(name)) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `Android frontend bundle is not declared: ${name}`, { what: 'Android 前端插件包声明' })
      }
    }
    const manifest = readProfileManifest('dsh', profileDirectory)
    const selected = manifest.dsh?.profile?.bundles ?? []
    const missing = upgrade.bundles.filter(name => !selected.includes(name))
    if (missing.length) writeProfileBundles(profileDirectory, manifest, [...selected, ...missing])
    writeFileSync(marker, 'initialized\n', { flag: 'wx' })
  }
}

/** The Android application requires its mobile surface; other bundle selections remain user-owned. */
export function registerAndroidMobileBundle(profileDirectory: string): void {
  const manifest = readProfileManifest('dsh', profileDirectory)
  const selected = manifest.dsh?.profile?.bundles ?? []
  const mobile = '@eleckoi/dsh-client-mobile'
  if (!selected.includes(mobile)) writeProfileBundles(profileDirectory, manifest, [...selected, mobile])
}
