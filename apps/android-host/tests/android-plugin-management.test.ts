import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { initProfile, loadProfileDirectory, readProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { PluginManager } from '@deepseek-ai/dsh-plugin-manager'
import { describe, expect, it } from 'vitest'

describe('Android required surface and optional bundle management', () => {
  it('offers automatic illustration from the Android installation without enabling it until selected', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-android-illustration-'))
    const ctx = new Context()
    const mobile = '@eleckoi/dsh-client-mobile'
    const illustration = '@eleckoi/dsh-auto-illustration'
    const installAnchor = resolve('apps/android-host/package.json')
    try {
      initProfile(directory, [mobile])
      ctx.reflect.provide('profileContext', { dir: directory, name: 'synthetic', installAnchor, startedBundles: [mobile] })
      ctx.reflect.provide('loader', { entries: () => [] })
      await ctx.plugin(PluginManager)
      const offered = (await ctx.pluginManager.listBundles()).find(pkg => pkg.name === illustration)
      expect(offered).toMatchObject({ name: illustration, enabled: false })
      expect(readProfileManifest('dsh', directory).dsh?.profile?.bundles).toEqual([mobile])
      expect((await ctx.pluginManager.setBundleEnabled(illustration, true)).changed).toBe(true)
      const enabled = loadProfileDirectory('dsh', directory, installAnchor)
      expect(enabled.skippedBundles).toEqual([])
      expect(enabled.layers.map(layer => layer.packageName)).toContain(illustration)
      expect((await ctx.pluginManager.listBundles()).find(pkg => pkg.name === illustration)?.enabled).toBe(true)
      expect((await ctx.pluginManager.setBundleEnabled(illustration, false)).changed).toBe(true)
      expect(readProfileManifest('dsh', directory).dsh?.profile?.bundles).toEqual([mobile])
      expect((await ctx.pluginManager.listBundles()).find(pkg => pkg.name === illustration)?.enabled).toBe(false)
    } finally {
      await ctx.fiber.dispose()
      expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true)
      rmSync(directory, { recursive: true, force: true })
    }
  }, 30_000)

  it('protects the mobile surface while persisting an optional bundle off and on', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eleckoi-plugin-management-'))
    const ctx = new Context()
    const mobile = '@eleckoi/dsh-client-mobile'
    const optional = '@eleckoi/dsh-web-search-tavily'
    try {
      initProfile(directory, [mobile, optional])
      ctx.reflect.provide('profileContext', { dir: directory, name: 'synthetic',
        installAnchor: resolve('apps/android-host/package.json'), startedBundles: [mobile, optional] })
      ctx.reflect.provide('loader', { entries: () => [] })
      await ctx.plugin(PluginManager)
      const packages = await ctx.pluginManager.listBundles()
      expect(packages.find(pkg => pkg.name === mobile)?.readOnlyReason).toBe('management-required')
      expect(packages.find(pkg => pkg.name === optional)?.readOnlyReason).toBeUndefined()
      const refused = await ctx.pluginManager.setBundleEnabled(mobile, false)
      expect(refused.changed).toBe(false)
      expect(refused.error?.code).toBe('management-required')
      expect(readProfileManifest('dsh', directory).dsh?.profile?.bundles).toContain(mobile)
      expect((await ctx.pluginManager.setBundleEnabled(optional, false)).changed).toBe(true)
      expect((await ctx.pluginManager.listBundles()).find(pkg => pkg.name === optional)?.enabled).toBe(false)
      expect(readProfileManifest('dsh', directory).dsh?.profile?.bundles).not.toContain(optional)
      expect((await ctx.pluginManager.setBundleEnabled(optional, true)).changed).toBe(true)
      expect(readProfileManifest('dsh', directory).dsh?.profile?.bundles).toEqual([mobile, optional])
    } finally {
      await ctx.fiber.dispose()
      expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true)
      rmSync(directory, { recursive: true, force: true })
    }
  }, 30_000)
})
