import { describe, it, expect } from 'vitest'
import { createVariableIdentities, projectVariableState, reconcileVariableState, type VariableIdentityConfig } from '../src/foundation/variables/identity'
import type { VariableItemConfig, VariableObjectConfig } from '../src/contracts/variables/schemas'

const group = (id: string, name = id, dynamicKey = false): VariableObjectConfig => ({ id, name, dynamicKey, parentId: '', enabled: true,
  description: '', updateRule: '', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' })
const variable = (id: string, title = id, objectId = ''): VariableItemConfig => ({ id, title, objectId, enabled: true, type: 'number',
  defaultValue: '0', description: '', updateRule: '', readMode: 'on_demand', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: '' })
const config: VariableIdentityConfig = { versionId: 'a', objects: [group('status')], variables: [variable('coins', 'coins', 'status')] }

describe('variable state ownership', () => {
  it('uses current definitions and actual runtime origins without a removal history', () => {
    const state = { status: { coins: 35, aiCreated: 7 } }
    const identities = createVariableIdentities(state, config, 'runtime')
    expect(identities['/status/coins']!.origin).toBe('definition')
    expect(identities['/status/aiCreated']!.origin).toBe('runtime')
    const latest = { ...config, variables: [] }
    expect(projectVariableState(state, identities, latest).state).toEqual({ status: { aiCreated: 7 } })
    expect(state.status.coins).toBe(35)
    const changed = reconcileVariableState(state, identities, latest, { status: { aiCreated: 8, new: true } })
    expect(changed.state).toEqual({ status: { coins: 35, aiCreated: 8, new: true } })
    expect(changed.identities['/status/new']!.origin).toBe('runtime')
    expect(projectVariableState(changed.state, changed.identities, latest).state).toEqual({ status: { aiCreated: 8, new: true } })
  })
  it('distinguishes an AI write to a definition from creating a runtime entry', () => {
    const created = reconcileVariableState({}, {}, config, { status: { coins: 10, added: 'yes' } })
    expect(created.identities['/status/coins']!.origin).toBe('definition')
    expect(created.identities['/status/added']!.origin).toBe('runtime')
    const next = reconcileVariableState(created.state, created.identities, config, { status: { coins: 11, added: 'changed' } })
    expect(next.identities).toEqual(created.identities)
  })
  it('does not adopt a deleted same-name value for a new definition or different structure', () => {
    const state = { status: { coins: 35 } }, identities = createVariableIdentities(state, config, 'runtime')
    const latest = { ...config, variables: [{ ...variable('new-coins', 'coins', 'status'), type: 'object' as const }] }
    expect(projectVariableState(state, identities, latest).state).toEqual({ status: {} })
    const next = reconcileVariableState(state, identities, latest, { status: { coins: { balance: 5 } } })
    expect(next.state).toEqual({ status: { coins: { balance: 5 } } })
    expect(next.identities['/status/coins']!.definitionId).toBe('new-coins')
    expect(state.status.coins).toBe(35)
  })
  it('keeps identity and values when a definition is renamed, without copying rules into state', () => {
    const state = { status: { coins: 35, ai: 4 } }, identities = createVariableIdentities(state, config, 'runtime')
    const latest = { ...config, objects: [group('status', 'new-status')], variables: [variable('coins', 'new-coins', 'status')] }
    const view = projectVariableState(state, identities, latest)
    expect(view.state).toEqual({ 'new-status': { 'new-coins': 35, ai: 4 } })
    const next = reconcileVariableState(state, identities, latest, view.state)
    expect(next.state).toEqual(view.state)
    expect(next.identities['/new-status/new-coins']!.id).toBe(identities['/status/coins']!.id)
  })
  it('keeps dynamic dictionary entries owned by their container and definitions owned by their template', () => {
    const latest: VariableIdentityConfig = { versionId: 'a', objects: [group('members', 'members', true)], variables: [variable('score', 'score', 'members')] }
    const state = { members: { one: { score: 3, ai: 9 }, two: { score: 4 } }, independent: true }
    const identities = createVariableIdentities(state, latest, 'runtime')
    expect(identities['/members/one']!.kind).toBe('entry')
    expect(identities['/members/one/score']!.origin).toBe('definition')
    expect(projectVariableState(state, identities, { ...latest, variables: [] }).state)
      .toEqual({ members: { one: { ai: 9 }, two: {} }, independent: true })
    expect(projectVariableState(state, identities, { ...latest, objects: [], variables: [] }).state).toEqual({ independent: true })
  })
  it('preserves unknown old fields without inventing runtime provenance', () => {
    const state = { status: { coins: 35, old: 2 } }, identities = createVariableIdentities(state, config, 'unresolved')
    expect(identities['/status/old']!.origin).toBe('unresolved')
    expect(projectVariableState(state, identities, config).state).toEqual({ status: { coins: 35 } })
  })
  it('keeps ownership proportional to current entries across repeated writes without copying long values or rules', () => {
    const entries = Object.fromEntries(Array.from({ length: 1001 }, (_, index) => [`entry-${index}`, index]))
    const state = { status: { coins: 35, ...entries }, longText: 'synthetic-long-content'.repeat(10001) }
    let current = { state, identities: createVariableIdentities(state, config, 'runtime') }
    const before = JSON.stringify(current.identities)
    for (let index = 0; index < 5; index++) current = reconcileVariableState(current.state, current.identities, config, { ...current.state, status: { ...current.state.status, coins: index } }) as typeof current
    expect(JSON.stringify(current.identities)).toBe(before)
    expect(Object.keys(current.identities)).toHaveLength(1004)
    expect(before).not.toContain('synthetic-long-content')
  })
  it('rejects missing or forged ownership instead of guessing from naked values', () => {
    expect(() => projectVariableState({ secret: 1 }, {}, config)).toThrow('变量来源记录与变量值不一致')
  })
})
