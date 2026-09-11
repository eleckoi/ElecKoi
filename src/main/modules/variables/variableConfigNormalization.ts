import type {
  VariableConfig,
  VariableConfigVersion,
  VariableItemConfig,
  VariableObjectConfig
} from '@shared/contracts/variables/schemas'
import {
  DEFAULT_VARIABLE_CONFIG_VERSION_ID,
  VARIABLE_INITIALIZATION_OBJECT_ID,
  VARIABLE_INITIALIZATION_OBJECT_NAME,
  variableConfigSchema
} from '@shared/contracts/variables/schemas'
import { generatedInitialStateJson } from '@shared/foundation/variables/initialState'

const valueTypes = new Set(['', 'number', 'string', 'boolean', 'array'])

function validObjectJson(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value)
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}

function stableTimestamp<T extends { createdAt: string; updatedAt: string }>(
  candidate: T,
  previous: T | undefined,
  now: string
): T {
  if (!previous) return { ...candidate, createdAt: candidate.createdAt || now, updatedAt: now }
  const next = { ...candidate, createdAt: previous.createdAt, updatedAt: previous.updatedAt }
  const comparableNext = { ...next, updatedAt: '' }
  const comparablePrevious = { ...previous, updatedAt: '' }
  return JSON.stringify(comparableNext) === JSON.stringify(comparablePrevious)
    ? next
    : { ...next, updatedAt: now }
}

function normalizedParentId(
  object: VariableObjectConfig,
  byId: Map<string, VariableObjectConfig>
): string {
  if (!object.parentId || object.parentId === object.id || object.parentId === VARIABLE_INITIALIZATION_OBJECT_ID) return ''
  if (!byId.has(object.parentId)) return ''
  const visited = new Set([object.id])
  let currentId = object.parentId
  while (currentId) {
    if (visited.has(currentId)) return ''
    visited.add(currentId)
    currentId = byId.get(currentId)?.parentId ?? ''
  }
  return object.parentId
}

export function emptyVariableConfigVersion(): VariableConfigVersion {
  return {
    id: DEFAULT_VARIABLE_CONFIG_VERSION_ID,
    name: '',
    initialStateJson: '{}',
    schemaCode: '',
    objects: [],
    variables: [],
    expandedObjectIds: [],
    createdAt: '',
    updatedAt: ''
  }
}

export function normalizeVariableVersion(
  version: VariableConfigVersion,
  now: string,
  previous?: VariableConfigVersion
): VariableConfigVersion {
  const hasUserData = version.schemaCode.trim().length > 0
    || version.objects.some((item) => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID)
    || version.variables.length > 0
  const inputObjects = version.objects.filter((item) => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID)
  const sourceById = new Map(inputObjects.map((item) => [item.id, item]))
  const previousObjects = new Map(previous?.objects.map((item) => [item.id, item]) ?? [])
  const previousVariables = new Map(previous?.variables.map((item) => [item.id, item]) ?? [])

  const userObjects = inputObjects.map((item, index) => stableTimestamp({
    ...item,
    name: item.name.trim().slice(0, 40),
    parentId: normalizedParentId(item, sourceById),
    description: item.description.trim(),
    updateRule: item.updateRule.trim(),
    order: item.order > 0 ? item.order : index + 1,
    treeViewOrder: Math.max(0, item.treeViewOrder)
  }, previousObjects.get(item.id), now))
  const normalizedObjects: VariableObjectConfig[] = hasUserData ? [{
    id: VARIABLE_INITIALIZATION_OBJECT_ID,
    name: VARIABLE_INITIALIZATION_OBJECT_NAME,
    parentId: '',
    enabled: true,
    description: '',
    updateRule: '',
    dynamicKey: false,
    order: 0,
    treeViewOrder: 0,
    createdAt: previousObjects.get(VARIABLE_INITIALIZATION_OBJECT_ID)?.createdAt || now,
    updatedAt: previousObjects.get(VARIABLE_INITIALIZATION_OBJECT_ID)?.updatedAt || now
  }, ...userObjects] : userObjects
  const objectIds = new Set(userObjects.map((item) => item.id))
  const normalizedVariables: VariableItemConfig[] = version.variables.map((item, index) => stableTimestamp({
    ...item,
    title: item.title.trim().slice(0, 60),
    objectId: objectIds.has(item.objectId) ? item.objectId : '',
    type: valueTypes.has(item.type) ? item.type : '',
    defaultValue: item.defaultValue.trim(),
    description: item.description.trim(),
    updateRule: item.updateRule.trim(),
    readMode: item.readMode === 'required' ? 'required' : 'on_demand',
    order: item.order > 0 ? item.order : index + 1,
    treeViewOrder: Math.max(0, item.treeViewOrder)
  }, previousVariables.get(item.id), now))
  const generatedState = generatedInitialStateJson(normalizedObjects, normalizedVariables)
  const hasDynamicObject = userObjects.some((item) => item.dynamicKey)
  const initialStateJson = hasDynamicObject && validObjectJson(version.initialStateJson)
    ? JSON.stringify(JSON.parse(version.initialStateJson), null, 2)
    : generatedState
  const normalized: VariableConfigVersion = {
    ...version,
    name: version.name.trim().slice(0, 60),
    initialStateJson,
    schemaCode: version.schemaCode,
    objects: normalizedObjects,
    variables: normalizedVariables,
    expandedObjectIds: [...new Set(version.expandedObjectIds)].filter((id) => objectIds.has(id)),
    createdAt: version.createdAt || previous?.createdAt || now,
    updatedAt: previous && JSON.stringify({ ...version, updatedAt: '' }) === JSON.stringify({ ...previous, updatedAt: '' })
      ? previous.updatedAt
      : now
  }
  return normalized
}

export function activeVariableConfig(
  characterId: string,
  active: VariableConfigVersion,
  versions: VariableConfigVersion[]
): VariableConfig {
  return variableConfigSchema.parse({
    characterId,
    name: active.name,
    initialStateJson: active.initialStateJson || generatedInitialStateJson(active.objects, active.variables),
    schemaCode: active.schemaCode,
    objects: active.objects,
    variables: active.variables,
    expandedObjectIds: active.expandedObjectIds,
    activeVersionId: active.id,
    versions
  })
}

export function normalizeVariableConfig(
  characterId: string,
  input?: VariableConfig,
  previous?: VariableConfig,
  now = new Date().toISOString()
): VariableConfig {
  if (!input) {
    const version = emptyVariableConfigVersion()
    return activeVariableConfig(characterId, version, [version])
  }
  const activeVersionId = input.activeVersionId || input.versions[0]?.id || DEFAULT_VARIABLE_CONFIG_VERSION_ID
  const currentActive = input.versions.find((item) => item.id === activeVersionId)
  const activeCandidate: VariableConfigVersion = {
    ...(currentActive ?? emptyVariableConfigVersion()),
    id: activeVersionId,
    name: input.name,
    initialStateJson: input.initialStateJson,
    schemaCode: input.schemaCode,
    objects: input.objects,
    variables: input.variables,
    expandedObjectIds: input.expandedObjectIds
  }
  const candidates = input.versions.some((item) => item.id === activeVersionId)
    ? input.versions.map((item) => item.id === activeVersionId ? activeCandidate : item)
    : [...input.versions, activeCandidate]
  const previousById = new Map(previous?.versions.map((item) => [item.id, item]) ?? [])
  const versions = candidates.map((item) => normalizeVariableVersion(item, now, previousById.get(item.id)))
  const active = versions.find((item) => item.id === activeVersionId) ?? versions[0] ?? normalizeVariableVersion(emptyVariableConfigVersion(), now)
  return activeVariableConfig(characterId, active, versions.length ? versions : [active])
}
