import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { readProfileManifest, writeProfileBundles } from '@deepseek-ai/dsh-app-boot'

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
  '@eleckoi/dsh-client-tavern-shared',
  '@eleckoi/dsh-compatibility-host',
  '@eleckoi/dsh-product-api',
  '@eleckoi/dsh-runtime'
] as const

/**
 * Register shipped bundles once while retaining the profile's existing selections.
 * TODO(迁移清理)：受支持的升级及 profile 恢复入口都已完成 bundles-v6 登记后，
 * 删除本函数、Host 调用、专用 import 和旧 profile 迁移用例。保留
 * ELECKOI_DESKTOP_BUNDLES 与新 profile 的 initProfile 初始化及正常启停测试。
 */
export function registerDesktopBundles(profile: string): void {
  const marker = join(profile, '.eleckoi-desktop-bundles-v6')
  if (existsSync(marker)) return
  const manifest = readProfileManifest('dsh', profile)
  const selected = manifest.dsh?.profile?.bundles ?? []
  const bundles = [...new Set([...selected, ...ELECKOI_DESKTOP_BUNDLES])]
  writeProfileBundles(profile, manifest, bundles)
  writeFileSync(marker, 'initialized\n', { flag: 'wx' })
}
