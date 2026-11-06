import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentPresetRegistry from '@deepseek-ai/dsh-agent-preset-registry'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { rewindDshSession } from '@eleckoi/dsh-runtime'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { readPluginInventory } from '@deepseek-ai/dsh-host-plugin-inventory'
import { apply as applyAgentPresetBridge } from '../../../../../../apps/desktop/resources/dsh/agent-preset-bridge.mjs'
import { materializeAgentPreset } from '../../src/host/session-runtime.mjs'
import { readRuntimePresetDefinition } from '../../src/host/preset-definition.mjs'

const directories = []
const templatePath = resolve('apps/desktop/resources/dsh/agent-preset-template/agent.cordis.yml')

afterEach(() => {
  delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT
  delete process.env.ELECKOI_PRESET_ROOT
  delete process.env.ELECKOI_PRESET_TEMPLATE_PATH
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('DSH Agent preset durability', () => {
  it.each([true, false])('moves legacy Sessions to the global preset without requiring or deleting their old declaration (file=%s)', async oldFile => {
    const directory = temporaryDirectory(), presetRoot = join(directory, 'presets')
    const snapshotRoot = join(directory, 'snapshots'), sessionRoot = join(directory, 'sessions')
    mkdirSync(snapshotRoot)
    const legacyId = 'agent-preset-synthetic-0123456789abcdef'
    mkdirSync(join(presetRoot, 'eleckoi-active'), { recursive: true })
    writeFileSync(join(presetRoot, 'eleckoi-active', 'preset.json'), JSON.stringify({ id: 'eleckoi-active', name: 'Synthetic preset', plugins: [] }))
    const legacyFile = join(presetRoot, legacyId, 'preset.json')
    if (oldFile) {
      mkdirSync(join(presetRoot, legacyId), { recursive: true })
      writeFileSync(legacyFile, 'unused historical configuration')
    }
    process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = snapshotRoot
    process.env.ELECKOI_PRESET_ROOT = presetRoot
    process.env.ELECKOI_PRESET_TEMPLATE_PATH = templatePath
    const ctx = new Context()
    const id = SessionId('synthetic-session')
    let dispose
    try {
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.plugin(JsonlSessionPersistence, { root: sessionRoot, compression: 'none' })
      await ctx.plugin(Loader)
      await ctx.plugin(AgentPresetRegistry, { default: 'eleckoi-active' })
      ctx.provide('agents', { create: vi.fn(), resume: vi.fn(), get: vi.fn() })
      const prepared = ctx.sessions.prepare(id, { meta: { cwd: directory, agentPreset: legacyId } })
      const session = Session.create(id, [], prepared.header)
      session.append('turn/start', { turn: 1 })
      const input = session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Synthetic retained input' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      session.append('session/title', { title: 'Synthetic retained title', messageSeqs: [], source: { kind: 'user' } })
      const original = session.snapshotEvents()
      const seed = await ctx.sessionPersistence.create(session.header)
      try { await seed.append(original); await seed.flush() } finally { await seed.close() }
      const snapshotFile = join(snapshotRoot, `${id}.json`)
      writeFileSync(snapshotFile, JSON.stringify({ conversationId: 'synthetic-conversation', mountedPresetId: legacyId, mountedPresetRevision: 'old' }))
      const read = async () => {
        const h = await ctx.sessionPersistence.open(id, 'read')
        try { return { ...(await h.read()), header: h.header } } finally { await h.close() }
      }
      const originalStored = await read()
      const bridge = ctx.plugin({ name: 'synthetic-preset-bridge', inject: ['agents', 'agentPresets', 'sessionPersistence'], apply: applyAgentPresetBridge })
      await bridge
      dispose = () => bridge.dispose()
      await ctx.agentPresets.register({ id: 'synthetic-user-preset', name: 'Synthetic preset', plugins: [] })
      expect((await ctx.agentPresets.remoteExportList()).presets.map(row => row.id)).toEqual(['eleckoi-active', 'synthetic-user-preset'])
      expect((await readPluginInventory(ctx)).agentPresets.map(row => row.id)).toEqual(['eleckoi-active', 'synthetic-user-preset'])
      const migrated = await read()
      expect(migrated.header).toEqual(originalStored.header)
      expect(migrated.events.slice(0, original.length)).toEqual(original)
      expect(migrated.events.at(-1)).toMatchObject({ type: 'agent-preset/selected', data: { agentPreset: 'eleckoi-active' } })
      expect(JSON.parse(readFileSync(snapshotFile, 'utf8'))).toMatchObject({ conversationId: 'synthetic-conversation', mountedPresetId: 'eleckoi-active' })
      await ctx.eleckoiPresetRegistrar.prepareForSession(id)
      expect((await read()).events).toEqual(migrated.events)
      writeFileSync(snapshotFile, JSON.stringify({ conversationId: 'synthetic-conversation', mountedPresetId: legacyId, mountedPresetRevision: 'old' }))
      await ctx.eleckoiPresetRegistrar.prepareForSession(id)
      expect(JSON.parse(readFileSync(snapshotFile, 'utf8')).mountedPresetId).toBe('eleckoi-active')
      expect((await read()).events).toEqual(migrated.events)
      // First-turn deletion removes the selection too; the closed-edit boundary restores it before any Agent resume.
      for (let index = 0; index < 3; index++) {
        let inputSeq = input.seq
        if (index > 0) {
          const writer = await ctx.sessionPersistence.open(id, 'write')
          try {
            const { events } = await writer.read()
            const next = Session.create(id, events, writer.header, writer.inheritedEventCount)
            next.append('turn/start', { turn: 1 })
            inputSeq = next.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Synthetic replacement input' }], source: { kind: 'user' } }), { surfaceOp: 'append' }).seq
            next.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
            await writer.append(next.snapshotEvents(events.length)); await writer.flush()
          } finally { await writer.close() }
        }
        await ctx.eleckoiSessionHandles.withClosed(id, () => rewindDshSession(sessionRoot, id, 1, inputSeq, false))
        expect((await read()).events.filter(event => event.type === 'agent-preset/selected')).toMatchObject([{ data: { agentPreset: 'eleckoi-active' } }])
        expect((await read()).events.some(event => event.type === 'user/message')).toBe(false)
      }
      const beforeRestart = await read()
      await dispose()
      const restarted = ctx.plugin({ name: 'synthetic-preset-bridge', inject: ['agents', 'agentPresets', 'sessionPersistence'], apply: applyAgentPresetBridge })
      await restarted
      dispose = () => restarted.dispose()
      expect((await read()).events).toEqual(beforeRestart.events)
      if (oldFile) expect(readFileSync(legacyFile, 'utf8')).toBe('unused historical configuration')
      else expect(existsSync(legacyFile)).toBe(false)
    } finally {
      await dispose?.()
      await ctx.fiber.dispose()
    }
  })

  it('persists stable plugin identities instead of installation-specific pnpm paths', () => {
    const directory = temporaryDirectory()
    const presetRoot = join(directory, 'generated-presets')
    const preset = materializeAgentPreset(
      presetRoot,
      templatePath,
      {
        id: 'test-preset',
        name: '测试预设',
        versionId: 'version-a',
        roleplayPlan: { steps: [] }
      },
      { disabledGroupIds: [] },
      { provider: 'provider-a', model: 'model-a', contextWindow: 100_000, autoCompactTokenLimit: 80_000 }
    )
    expect(preset.id).toBe('eleckoi-active')
    expect(preset.revision).toMatch(/^[a-f0-9]{64}$/)
    const source = readFileSync(join(presetRoot, preset.id, 'preset.json'), 'utf8')
    const definition = JSON.parse(source)
    expect(source).not.toContain('node_modules/.pnpm')
    expect(source).not.toContain('file:///')
    expect(pluginById(definition.plugins, 'agent-instructions')?.name)
      .toBe('@deepseek-ai/dsh-agent-instructions')
    expect(pluginById(definition.plugins, 'variable-tools')?.name)
      .toBe('@eleckoi/dsh-client-roleplay/host/variable-tools.mjs')
    expect(pluginById(definition.plugins, 'tool-subagent')?.config).toMatchObject({
      provider: 'spawn',
      backgroundMode: 'one-shot',
      enableRunInBackground: false,
      modelSelectionSettings: true
    })
    expect(pluginById(definition.plugins, 'tool-subagent')?.config).not.toHaveProperty('agentOptions')
    expect(pluginById(definition.plugins, 'tool-subagent-fork')?.config).not.toHaveProperty('agentOptions')
    expect(pluginById(definition.plugins, 'tool-result-pruner')).toBeUndefined()
    expect(pluginById(definition.plugins, 'compaction-basic')).toBeDefined()

    const updated = materializeAgentPreset(
      presetRoot,
      templatePath,
      {
        id: 'test-preset',
        name: '测试预设',
        versionId: 'version-b',
        roleplayPlan: { steps: ['完成正文'] }
      },
      { disabledGroupIds: [] },
      { provider: 'provider-a', model: 'model-a', contextWindow: 100_000, autoCompactTokenLimit: 20_000 }
    )
    expect(updated.id).toBe(preset.id)
    expect(updated.revision).not.toBe(preset.revision)
    for (let index = 0; index < 24; index++) {
      const disabled = index % 2 === 0
      const next = materializeAgentPreset(presetRoot, templatePath, {
        id: `synthetic-preset-${index % 3}`, name: `Synthetic preset ${index % 3}`,
        versionId: `version-${index}`, roleplayPlan: { steps: [] }
      }, { disabledGroupIds: disabled ? ['builtin:variables'] : [] }, {
        provider: `synthetic-provider-${index % 2}`, model: `synthetic-model-${index % 4}`,
        contextWindow: 100_000, autoCompactTokenLimit: (index + 1) * 1000
      })
      const current = JSON.parse(readFileSync(join(presetRoot, next.id, 'preset.json'), 'utf8'))
      expect(current.name).toBe(`Synthetic preset ${index % 3}`)
      expect(Boolean(pluginById(current.plugins, 'variable-tools'))).toBe(!disabled)
      expect(pluginById(current.plugins, 'compaction-basic').config.thresholdRatio).toBe((index + 1) / 100)
      expect(readdirSync(presetRoot)).toEqual(['eleckoi-active'])
      expect(readdirSync(join(presetRoot, next.id))).toEqual(['preset.json'])
    }
    expect(readdirSync(presetRoot)).toEqual(['eleckoi-active'])
  })

  it('retires middle pruning when restoring an existing generated preset while retaining its summary policy', () => {
    const directory = temporaryDirectory(), path = join(directory, 'preset.json')
    const original = JSON.stringify({ id: 'existing-studio', plugins: [{ id: 'compaction', name: 'cordis:group', group: true,
      isolate: { compaction: true, toolResultPruner: true }, config: [
        { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic', config: { thresholdRatio: 0.7, retainTokens: 0 } },
        { id: 'tool-result-pruner', name: '@deepseek-ai/dsh-compaction-tool-result-pruner', config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 } },
      ],
    }] })
    writeFileSync(path, original)
    const definition = readRuntimePresetDefinition(path, 'existing-studio', templatePath)
    expect(pluginById(definition.plugins, 'tool-result-pruner')).toBeUndefined()
    expect(pluginById(definition.plugins, 'compaction-basic').config).toEqual({ thresholdRatio: 0.7, retainTokens: 0 })
    expect(readFileSync(path, 'utf8')).toBe(original)
  })

  it('keeps package identities and locale resources available without rewriting existing declarations', async () => {
    const directory = temporaryDirectory()
    const presetRoot = join(directory, 'generated-presets')
    const snapshotRoot = join(directory, 'session-snapshots')
    const presetDirectory = join(presetRoot, 'eleckoi-active')
    mkdirSync(presetDirectory, { recursive: true })
    mkdirSync(snapshotRoot)
    const path = join(presetDirectory, 'preset.json')
    const source = JSON.stringify({
      id: 'eleckoi-active',
      plugins: [
        {
          id: 'agent-instructions',
          name: '@deepseek-ai/dsh-agent-instructions'
        },
        {
          id: 'variable-tools',
          name: 'eleckoi:agent-preset/variable-tools'
        },
        {
          id: 'compaction',
          name: 'cordis:group',
          config: [{
            id: 'compaction-basic',
            name: '@deepseek-ai/dsh-compaction-basic'
          }]
        }
      ]
    })
    writeFileSync(path, source)
    process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = snapshotRoot
    process.env.ELECKOI_PRESET_ROOT = presetRoot
    process.env.ELECKOI_PRESET_TEMPLATE_PATH = templatePath
    const registered = []
    const ctx = {
      inject: vi.fn(() => ({ dispose: vi.fn() })),
      provide: vi.fn(),
      on: vi.fn(() => () => undefined),
      agents: { create: vi.fn(), resume: vi.fn(), get: vi.fn() },
      sessionController: { inspect: vi.fn(async () => ({ meta: {}, events: [] })) },
      agentPresets: {
        register: vi.fn(async (definition) => {
          registered.push(definition)
          return async () => undefined
        })
      }
    }

    const dispose = await applyAgentPresetBridge(ctx)
    expect(readFileSync(path, 'utf8')).toBe(source)

    const runtime = registered[0]
    for (const pluginId of ['agent-instructions', 'variable-tools', 'compaction-basic']) {
      const name = pluginById(runtime.plugins, pluginId)?.name
      expect(name).toMatch(/^@(deepseek-ai|eleckoi)\//)
      const resolve = createRequire(import.meta.url).resolve
      expect(existsSync(resolve(name))).toBe(true)
      const locale = JSON.parse(readFileSync(resolve(`${name}/locale/zh.json`), 'utf8'))
      expect(locale.meta.title).toBeTruthy()
      expect(locale.meta.title).not.toContain('file:')
    }
    await dispose()
  })
})

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-preset-durability-'))
  directories.push(directory)
  return directory
}

function pluginById(plugins, id) {
  for (const plugin of plugins || []) {
    if (plugin?.id === id) return plugin
    if (Array.isArray(plugin?.config)) {
      const nested = pluginById(plugin.config, id)
      if (nested) return nested
    }
  }
  return undefined
}
