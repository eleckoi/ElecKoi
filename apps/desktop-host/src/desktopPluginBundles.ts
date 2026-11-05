import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { readProfileManifest, writeProfileBundles } from '@deepseek-ai/dsh-app-boot'
import { replaceHtmlResourceBundles } from '@eleckoi/dsh-client-html-resources/profile'

export const ELECKOI_INSTALL_ANCHOR = createRequire(import.meta.url).resolve('@eleckoi/dsh-runtime/package.json')

export const ELECKOI_DESKTOP_BUNDLES = [
  '@eleckoi/dsh-client-characters',
  '@eleckoi/dsh-client-character-configuration',
  '@eleckoi/dsh-client-conversations',
  '@eleckoi/dsh-client-creator-studio',
  '@eleckoi/dsh-client-display-preferences',
  '@eleckoi/dsh-client-models',
  '@eleckoi/dsh-client-persona',
  '@eleckoi/dsh-client-presets',
  '@eleckoi/dsh-client-web-search',
  '@eleckoi/dsh-client-shell',
  '@eleckoi/dsh-client-roleplay',
  '@eleckoi/dsh-client-author',
  '@eleckoi/dsh-client-html-resources',
  '@eleckoi/dsh-product-api',
  '@eleckoi/dsh-runtime'
] as const

/**
 * Register shipped bundles once while retaining the profile's existing selections.
 * TODO(迁移清理)：受支持的升级及 profile 恢复入口都已完成 bundles-v9 登记后，
 * 删除本函数、Host 调用、专用 import 和旧 profile 迁移用例。保留
 * ELECKOI_DESKTOP_BUNDLES 与新 profile 的 initProfile 初始化及正常启停测试。
 */
export function registerDesktopBundles(profile: string): void {
  // RETIRE WHEN: supported profiles have registered bundles-v9. Remove the
  // registration marker and upgrade branches together; retain normal toggles.
  const marker = join(profile, '.eleckoi-desktop-bundles-v9')
  if (existsSync(marker)) return
  const manifest = readProfileManifest('dsh', profile)
  const selected = manifest.dsh?.profile?.bundles ?? []
  const resources = replaceHtmlResourceBundles(selected)
  const bundles = (existsSync(join(profile, '.eleckoi-desktop-bundles-v8')) || existsSync(join(profile, '.eleckoi-desktop-bundles-v7')))
    ? resources
    : [...new Set([...resources, ...ELECKOI_DESKTOP_BUNDLES])]
  writeProfileBundles(profile, manifest, bundles)
  writeFileSync(marker, 'initialized\n', { flag: 'wx' })
}
