import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import { composeEntries, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import WorkspaceController from '@deepseek-ai/dsh-api-workspace-controller'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import SessionStore from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { parse } from 'yaml'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadNodeHostConfiguration, preparePluginHost } from '../src/pluginHostConfiguration'

beforeEach(() => {
  vi.spyOn(childProcess, 'execFile').mockImplementation(command => { throw Object.assign(new Error(`spawn ${command} ENOENT`), { code: 'ENOENT' }) })
  syncBuiltinESMExports()
})

const runtimeManifest = JSON.parse(readFileSync(new URL('../../desktop/resources/dsh/runtime-manifest.json', import.meta.url), 'utf8'))
const directories: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  for (const directory of directories.splice(0)) {
    expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true)
    rmSync(directory, { recursive: true, force: true })
  }
})

function configuration(manifest = runtimeManifest): string {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-android-config-'))
  directories.push(root)
  writeFileSync(join(root, 'runtime-manifest.json'), JSON.stringify(manifest))
  for (const file of ['preset.yml', 'agent.patch.yml', 'pnpm.mjs', 'dsh.html']) {
    writeFileSync(join(root, file), '')
  }
  const path = join(root, 'runtime-config.json')
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1,
    runtimeDataRoot: './data', homeRoot: './home', workspaceRoot: './workspace',
    productDatabasePath: './data/product.db', productMediaRoot: './media',
    resourceRoot: '.', clientDirectory: '.', presetTemplatePath: './preset.yml',
    agentPatchPath: './agent.patch.yml', packageManagerEntryPath: './pnpm.mjs'
  }))
  return path
}

function preparedWorkspace() {
  const configPath = configuration()
  const raw = JSON.parse(readFileSync(configPath, 'utf8'))
  raw.workspaceRoot = './workspace space 合成'
  writeFileSync(configPath, JSON.stringify(raw))
  const config = loadNodeHostConfiguration(configPath)
  const prepared = preparePluginHost(config)
  const profile = loadProfileDirectory('dsh', prepared.profileDirectory, resolve('apps/android-host/package.json'))
  expect(profile.skippedBundles).toEqual([])
  const entries = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches,
    ...prepared.patchFiles.map(file => parse(readFileSync(file, 'utf8')) ?? [])])
  const controllers = entries.filter(entry => entry.id === 'workspace-controller')
  expect(controllers).toHaveLength(1)
  return { config, controllerConfig: controllers[0]!.config as { documentsDirectory?: string } }
}

async function workspaceHost(storageRoot: string, config: { documentsDirectory?: string }) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root: storageRoot })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  ctx.provide('sessionPersistence', { list: async () => [] } as never)
  await ctx.plugin(WorkspaceRegistry)
  const dispose = () => {}
  ctx.provide('typert', { lookups: { configure: () => dispose }, contexts: { configureHost: () => dispose }, resources: { register: () => dispose } } as never)
  new RemoteAccessService(ctx)
  const controller = new WorkspaceController(ctx, config)
  return { ctx, controller }
}

describe('Android Host resource admission', () => {
  it('starts configuration loading with the shipped manifest and installed DSH batch', () => {
    const path = configuration()
    expect(loadNodeHostConfiguration(path).productDatabasePath).toBe(resolve(path, '../data/product.db'))
  })

  it.each([
    ['schema', { ...runtimeManifest, schemaVersion: 2 }],
    ['version', { ...runtimeManifest, upstream: { ...runtimeManifest.upstream, version: '0.0.0' } }],
    ['commit', { ...runtimeManifest, upstream: { ...runtimeManifest.upstream, commit: '0'.repeat(40) } }]
  ])('rejects a mismatched %s before loading product data', (_field, manifest) => {
    expect(() => loadNodeHostConfiguration(configuration(manifest))).toThrow('Android Host resources do not match the locked DSH installation')
  })
})

describe('Android first-use workspace directory', () => {
  it('creates and reuses the official default inside the private workspace root without a system directory command', async () => {
    const { config, controllerConfig } = preparedWorkspace()
    const { ctx, controller } = await workspaceHost(join(config.runtimeDataRoot, 'registry'), controllerConfig)
    const workspace = await controller.initializeDefault(new AbortController().signal)
    expect(workspace?.workspace.path).toBe(join(realpathSync(config.workspaceRoot), 'deepseek-harness', 'default-workspace'))
    expect(ctx.sessions.list()).toEqual([])
    expect(await controller.initializeDefault(new AbortController().signal)).toEqual(workspace)
    expect(ctx.workspaceRegistry.list()).toHaveLength(1)
    expect(childProcess.execFile).not.toHaveBeenCalled()
  }, 30_000)

  it('keeps a previously initialized default and its files after the Host reopens with the Android directory policy', async () => {
    const { config, controllerConfig } = preparedWorkspace(), storageRoot = join(config.runtimeDataRoot, 'registry')
    const first = await workspaceHost(storageRoot, { documentsDirectory: join(config.homeRoot, 'existing-documents') })
    const original = await first.controller.initializeDefault(new AbortController().signal)
    expect(original).toBeDefined()
    await first.ctx.workspaceRegistry.get(original!.workspace.workspaceId)!.setTitle('合成已命名工作区')
    const file = join(original!.workspace.path, 'synthetic-note.txt')
    writeFileSync(file, 'Synthetic retained workspace content')
    await first.ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(first.ctx), 1)
    const reopened = await workspaceHost(storageRoot, controllerConfig)
    expect(await reopened.controller.initializeDefault(new AbortController().signal)).toMatchObject({ workspace: {
      workspaceId: original!.workspace.workspaceId, path: original!.workspace.path, title: '合成已命名工作区',
    } })
    expect(readFileSync(file, 'utf8')).toBe('Synthetic retained workspace content')
    expect(existsSync(join(config.workspaceRoot, 'deepseek-harness', 'default-workspace'))).toBe(false)
    expect(childProcess.execFile).not.toHaveBeenCalled()
  }, 30_000)

  it('reports directory creation failure without registering a workspace or overwriting the existing file', async () => {
    const { config, controllerConfig } = preparedWorkspace()
    const blocked = join(config.workspaceRoot, 'deepseek-harness')
    writeFileSync(blocked, 'Synthetic blocking file')
    const { ctx, controller } = await workspaceHost(join(config.runtimeDataRoot, 'registry'), controllerConfig)
    await expect(controller.initializeDefault(new AbortController().signal)).rejects.toThrow()
    expect(ctx.workspaceRegistry.list()).toEqual([])
    expect(readFileSync(blocked, 'utf8')).toBe('Synthetic blocking file')
    expect(childProcess.execFile).not.toHaveBeenCalled()
  }, 30_000)
})
