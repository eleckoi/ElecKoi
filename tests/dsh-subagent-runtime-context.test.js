import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply as applyAgentPresetBridge } from '../resources/dsh/agent-preset-bridge.mjs'
import { apply as applySettingLibraryTools } from '../resources/dsh/setting-library-tools.mjs'
import { apply as applyVariableTools } from '../resources/dsh/variable-tools.mjs'

const directories = []

afterEach(() => {
  delete process.env.ELECKOI_SESSION_SNAPSHOT_ROOT
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('DSH subagent runtime context inheritance', () => {
  it('gives created, nested, and resumed children the parent setting library and variables', async () => {
    const fixture = runtimeFixture()
    const originalCreate = vi.fn(async (options) => options)
    const originalResume = vi.fn(async (options) => options)
    const ctx = {
      agents: { create: originalCreate, resume: originalResume },
      agentPresets: { mount: vi.fn() }
    }
    const dispose = applyAgentPresetBridge(ctx)

    await ctx.agents.create(childCreateOptions('child-a', 'root-session'))
    await expect(toolResultFor('child-a', 'eleckoi_glob_setting_files', { pattern: '**' }))
      .resolves.toMatchObject({ files: [{ path: '世界/港口', title: '港口' }] })
    await expect(toolResultFor('child-a', 'eleckoi_grep_setting_files', {
      pattern: '多雾', path: '世界', output_mode: 'content'
    })).resolves.toMatchObject({ matches: [{ path: '世界/港口', text: '港口终年多雾。' }] })
    const variables = await toolResultFor('child-a', 'eleckoi_glob_variables', { pattern: '**' })
    expect(variables.paths).toContain('/状态/好感度')
    const matchedVariables = await toolResultFor('child-a', 'eleckoi_grep_variables', {
      pattern: '好感度', output_mode: 'content'
    })
    expect(matchedVariables.matches.length).toBeGreaterThan(0)
    await expect(toolResultFor('child-a', 'eleckoi_apply_setting_patch', {
      operation: 'edit_file', path: '世界/港口', old_string: '多雾', new_string: '晴朗'
    })).resolves.toMatchObject({ status: 'ok', replacements: 1 })
    await expect(toolResultFor('child-a', 'eleckoi_apply_variable_patch', {
      operations: [{ op: 'delta', path: '/状态/好感度', value: 5 }]
    })).resolves.toMatchObject({ status: 'ok', applied_operations: 1 })

    await ctx.agents.create(childCreateOptions('child-b', 'child-a'))
    await expect(toolResultFor('child-b', 'eleckoi_read_setting_files', { paths: ['世界/港口'] }))
      .resolves.toMatchObject({ files: [{ content: '港口终年晴朗。' }] })
    await expect(toolResultFor('child-b', 'eleckoi_read_variables', { paths: ['/状态/好感度'] }))
      .resolves.toMatchObject({ variables: [{ current: 15 }] })

    await ctx.agents.resume({
      resumeSessionId: 'child-resumed',
      parentAgent: { session: { id: 'root-session' } }
    })
    expect(JSON.parse(readFileSync(join(fixture.snapshotRoot, 'child-resumed.json'), 'utf8')))
      .toMatchObject({ inheritedFromSessionId: 'root-session', rootRuntimeThreadId: 'root-session' })

    expect(originalCreate).toHaveBeenCalledTimes(2)
    expect(originalResume).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('removes the inherited snapshot when child creation fails', async () => {
    const fixture = runtimeFixture()
    const failure = new Error('child setup failed')
    const ctx = {
      agents: {
        create: vi.fn(async () => { throw failure }),
        resume: vi.fn()
      },
      agentPresets: { mount: vi.fn() }
    }
    applyAgentPresetBridge(ctx)

    await expect(ctx.agents.create(childCreateOptions('failed-child', 'root-session'))).rejects.toThrow(failure)
    expect(existsSync(join(fixture.snapshotRoot, 'failed-child.json'))).toBe(false)
  })
})

function childCreateOptions(sessionId, parentSessionId) {
  return {
    sessionId,
    parentAgent: { session: { id: parentSessionId } },
    meta: { origin: 'subagent', parentSession: parentSessionId }
  }
}

function runtimeFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-subagent-context-'))
  directories.push(directory)
  const snapshotRoot = join(directory, 'session-snapshots')
  const settingStateFile = join(directory, 'setting-state.json')
  const variableStateFile = join(directory, 'variable-state.json')
  process.env.ELECKOI_SESSION_SNAPSHOT_ROOT = snapshotRoot
  mkdirSync(snapshotRoot)

  writeFileSync(settingStateFile, JSON.stringify({
    enabled: true,
    library: {
      groups: [{ id: 'world', name: '世界', parentId: '', order: 1 }],
      entries: [{
        id: 'port', title: '港口', iconId: 'setting', kind: 'normal', groupId: 'world',
        content: '港口终年多雾。', agentSelectionHint: '抵达港口时读取', agentReadStrategy: 'normal',
        dynamicMode: 'standard', triggerMode: 'agent_tool', enabled: true, order: 1
      }]
    },
    history: [],
    variableState: { 状态: { 好感度: 10 } }
  }, null, 2))
  writeFileSync(variableStateFile, JSON.stringify({
    enabled: true,
    config: {
      initialState: { 状态: { 好感度: 0 } },
      schemaCode: 'const Schema = z.object({ 状态: z.object({ 好感度: z.number() }) })',
      objects: [{
        id: 'status', name: '状态', parentId: '', enabled: true,
        description: '角色状态', updateRule: '仅在剧情明确变化时更新', dynamicKey: false
      }],
      variables: [{
        id: 'affinity', title: '好感度', objectId: 'status', enabled: true, type: 'number',
        defaultValue: '0', description: '当前好感', updateRule: '按互动结果小幅增减', readMode: 'required'
      }]
    },
    state: { 状态: { 好感度: 10 } }
  }, null, 2))
  writeFileSync(join(snapshotRoot, 'root-session.json'), JSON.stringify({
    conversationId: 'conversation-a',
    runtimeThreadId: 'root-session',
    mountedPresetId: 'preset-a',
    model: { provider: 'provider-main', model: 'model-main' },
    subagentModel: { provider: 'provider-child', model: 'model-child' },
    settingStateFile,
    variableStateFile,
    settingLibraryEnabled: true,
    variablesEnabled: true,
    disabledToolGroupIds: [],
    conversationContext: { characterId: 'character-a', characterName: '测试角色', persona: {}, history: [] }
  }, null, 2), { flag: 'wx' })
  return { directory, snapshotRoot }
}

async function toolResultFor(sessionId, name, args) {
  const registered = []
  const context = {
    tools: {
      register(definition) {
        registered.push(definition)
        return () => undefined
      }
    }
  }
  applySettingLibraryTools(context)
  applyVariableTools(context)
  const definition = registered.find((candidate) => candidate.name === name)
  if (!definition) throw new Error(`Missing tool ${name}`)
  return definition.execute(args, { agent: { session: { id: sessionId } } })
}
