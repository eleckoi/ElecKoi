import { z } from 'zod'
import type { VariableItemConfig, VariableObjectConfig } from '../../contracts/variables/schemas'
import { VARIABLE_INITIALIZATION_OBJECT_ID } from '../../contracts/variables/schemas'
import { DesktopError } from '../DesktopError'
import { ELECKOI_FAILURE_CODES } from '../../contracts/errors/codes'

export interface VariableIdentityConfig {
  versionId: string
  objects: VariableObjectConfig[]
  variables: VariableItemConfig[]
}

const identitySchema = z.object({
  id: z.string().min(1), parentId: z.string(),
  origin: z.enum(['definition', 'runtime', 'unresolved']),
  kind: z.enum(['object', 'variable', 'entry', 'value']),
  definitionId: z.string(), versionId: z.string()
}).strict()
export const variableIdentitySchema = z.record(z.string(), identitySchema)
export type VariableIdentity = z.output<typeof identitySchema>
export type VariableIdentities = z.output<typeof variableIdentitySchema>
type JsonObject = Record<string, unknown>
type Node = { path: string; key: string; identity: VariableIdentity; value: unknown }
type Scope = { kind: 'children' | 'entries' | 'value'; objectId: string }
const rootScope: Scope = { kind: 'children', objectId: '' }
const object = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value)
const segment = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1')
const append = (path: string, key: string) => `${path}/${segment(key)}`

function invalid(): never {
  throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量来源记录与变量值不一致。', { what: '变量来源记录' })
}

function valueAt(state: JsonObject, path: string): unknown {
  if (!path.startsWith('/')) return invalid()
  let value: unknown = state
  for (const raw of path.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~')
    if (!object(value) || !Object.hasOwn(value, key)) return invalid()
    value = value[key]
  }
  return value
}

function definitions(config: VariableIdentityConfig) {
  const objects = new Map(config.objects.filter(item => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID).map(item => [item.id, item]))
  const variables = new Map(config.variables.map(item => [item.id, item]))
  const byName = new Map<string, Array<{ kind: 'object' | 'variable'; item: VariableObjectConfig | VariableItemConfig }>>()
  const add = (parent: string, key: string, value: { kind: 'object' | 'variable'; item: VariableObjectConfig | VariableItemConfig }) => {
    const index = JSON.stringify([parent, key]), matches = byName.get(index) ?? []
    matches.push(value); byName.set(index, matches)
  }
  for (const item of objects.values()) if (item.enabled && item.name.trim()) add(item.parentId, item.name.trim(), { kind: 'object', item })
  for (const item of variables.values()) if (item.enabled && item.title.trim()) add(item.objectId, item.title.trim(), { kind: 'variable', item })
  const find = (key: string, scope: Scope) => {
    if (scope.kind !== 'children') return undefined
    const matches = byName.get(JSON.stringify([scope.objectId, key])) ?? []
    if (matches.length > 1) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, '同一变量目录存在重复路径，无法确定变量身份。', { what: '变量目录的重复路径' })
    return matches[0]
  }
  const scopeOf = (identity: VariableIdentity): Scope => {
    if (identity.origin === 'definition' && identity.kind === 'object') {
      const item = objects.get(identity.definitionId)
      return { kind: item?.dynamicKey ? 'entries' : 'children', objectId: identity.definitionId }
    }
    if (identity.kind === 'entry') return { kind: 'children', objectId: identity.definitionId }
    return { kind: 'value', objectId: '' }
  }
  return { objects, variables, find, scopeOf }
}

function nodes(state: JsonObject, identities: VariableIdentities): Node[] {
  if (!object(state)) return invalid()
  const ids = new Set<string>(), result: Node[] = []
  for (const [path, identity] of Object.entries(identities)) {
    if (ids.has(identity.id)) return invalid()
    ids.add(identity.id)
    result.push({ path, key: path.slice(path.lastIndexOf('/') + 1).replaceAll('~1', '/').replaceAll('~0', '~'), identity, value: valueAt(state, path) })
  }
  for (const node of result) if (node.identity.parentId && !ids.has(node.identity.parentId)) return invalid()
  let count = 0
  const verify = (value: JsonObject, path: string, parentId: string) => {
    for (const [key, child] of Object.entries(value)) {
      const target = append(path, key), identity = identities[target]
      if (!identity || identity.parentId !== parentId) return invalid()
      if (identity.origin === 'definition' && (!identity.versionId || !identity.definitionId || !['object', 'variable'].includes(identity.kind))) return invalid()
      count++
      if (object(child)) verify(child, target, identity.id)
    }
  }
  verify(state, '', '')
  if (count !== result.length) return invalid()
  return result
}

export function validateVariableIdentityState(state: JsonObject, identities: VariableIdentities): void { nodes(state, identities) }

export function parseVariableIdentities(json: string): VariableIdentities {
  try { return variableIdentitySchema.parse(JSON.parse(json)) }
  catch { throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, '变量来源记录已损坏。', { what: '变量来源记录' }) }
}

/** Classify only newly written values. Existing identities are never inferred again. */
export function createVariableIdentities(state: JsonObject, config: VariableIdentityConfig, fallback: 'runtime' | 'unresolved'): VariableIdentities {
  if (!object(state)) return invalid()
  return reconcileVariableState({}, {}, config, state, fallback).identities
}

/** Explicit raw value replacement retains known origins; only new slots get a source. */
export function replaceVariableIdentities(previous: VariableIdentities, config: VariableIdentityConfig, next: JsonObject): VariableIdentities {
  const fresh = createVariableIdentities(next, config, 'runtime'), result: VariableIdentities = {}
  for (const [path, identity] of Object.entries(fresh)) {
    const parentPath = path.slice(0, path.lastIndexOf('/')), parentId = result[parentPath]?.id || ''
    const known = previous[path]
    result[path] = known && known.parentId === parentId ? known : { ...identity, parentId }
  }
  return result
}

/** The live tool view is the current definitions plus owned runtime entries. */
export function projectVariableState(state: JsonObject, identities: VariableIdentities, config: VariableIdentityConfig) {
  const definition = definitions(config), byParent = new Map<string, Node[]>()
  for (const node of nodes(state, identities)) {
    const siblings = byParent.get(node.identity.parentId) ?? []
    siblings.push(node); byParent.set(node.identity.parentId, siblings)
  }
  const visible: VariableIdentities = {}, sourcePaths = new Map<string, string>(), visited = new Set<string>()
  const walk = (parentId: string, path: string, scope: Scope): JsonObject => {
    const result: JsonObject = {}
    for (const node of byParent.get(parentId) ?? []) {
      const id = node.identity
      if (visited.has(id.id)) return invalid()
      visited.add(id.id)
      if (id.origin === 'unresolved') continue
      let key = node.key
      if (id.origin === 'definition') {
        if (id.versionId !== config.versionId || scope.kind !== 'children') continue
        const item = id.kind === 'object' ? definition.objects.get(id.definitionId) : definition.variables.get(id.definitionId)
        if (!item?.enabled) continue
        const parent = 'parentId' in item ? item.parentId : item.objectId
        if (parent !== scope.objectId) continue
        key = ('name' in item ? item.name : item.title).trim()
        if (!key || definition.find(key, scope)?.item.id !== id.definitionId) continue
      } else if (scope.kind === 'children' && definition.find(key, scope)) continue
      const target = append(path, key)
      if (Object.hasOwn(visible, target)) return invalid()
      visible[target] = id; sourcePaths.set(target, node.path)
      Object.defineProperty(result, key, { value: object(node.value) ? walk(id.id, target, definition.scopeOf(id)) : node.value, enumerable: true, writable: true, configurable: true })
    }
    return result
  }
  return { state: walk('', '', rootScope), identities: visible, sourcePaths }
}

/** Accept a processed tool view without turning hidden old fields into new entries. */
export function reconcileVariableState(
  state: JsonObject, identities: VariableIdentities, config: VariableIdentityConfig,
  next: JsonObject, fallback: 'runtime' | 'unresolved' = 'runtime'
): { state: JsonObject; identities: VariableIdentities } {
  const definition = definitions(config), previous = projectVariableState(state, identities, config)
  const all = new Map(nodes(state, identities).map(node => [node.identity.id, node]))
  const formerlyVisible = new Set(Object.values(previous.identities).map(item => item.id)), active = new Set<string>()
  const write = (value: JsonObject, parentId: string, path: string, scope: Scope) => {
    for (const [key, child] of Object.entries(value)) {
      const target = append(path, key), current = definition.find(key, scope)
      const existing = previous.identities[target]
      const identity: VariableIdentity = existing ?? {
        id: globalThis.crypto.randomUUID(), parentId,
        origin: current ? 'definition' : scope.kind === 'entries' ? 'runtime' : fallback,
        kind: current?.kind ?? (scope.kind === 'entries' ? 'entry' : 'value'),
        definitionId: current?.item.id ?? (scope.kind === 'entries' ? scope.objectId : ''), versionId: current ? config.versionId : ''
      }
      active.add(identity.id)
      all.set(identity.id, { path: target, key, identity, value: child })
      if (object(child)) write(child, identity.id, target, definition.scopeOf(identity))
    }
  }
  write(next, '', '', rootScope)
  for (const id of formerlyVisible) if (!active.has(id)) all.delete(id)
  const children = new Map<string, Map<string, Node>>()
  // A deliberate write to a newly defined same-name field replaces that slot;
  // old values remain in earlier snapshots, never become the new current value.
  for (const node of [...all.values()].sort((a, b) => Number(active.has(a.identity.id)) - Number(active.has(b.identity.id)))) {
    const siblings = children.get(node.identity.parentId) ?? new Map<string, Node>()
    siblings.set(node.key, node); children.set(node.identity.parentId, siblings)
  }
  const resultIdentities: VariableIdentities = {}, visited = new Set<string>()
  const assemble = (parentId: string, path: string): JsonObject => {
    const result: JsonObject = {}
    for (const node of children.get(parentId)?.values() ?? []) {
      if (visited.has(node.identity.id)) return invalid()
      visited.add(node.identity.id)
      const target = append(path, node.key)
      resultIdentities[target] = node.identity
      Object.defineProperty(result, node.key, { value: object(node.value) ? assemble(node.identity.id, target) : node.value, enumerable: true, writable: true, configurable: true })
    }
    return result
  }
  return { state: assemble('', ''), identities: resultIdentities }
}
