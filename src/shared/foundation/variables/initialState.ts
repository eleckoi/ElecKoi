import type { VariableItemConfig, VariableObjectConfig } from '@shared/contracts/variables/schemas'
import { VARIABLE_INITIALIZATION_OBJECT_ID } from '@shared/contracts/variables/schemas'

type JsonObject = Record<string, unknown>

function ordered<T extends { treeViewOrder: number; order: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => (
    left.treeViewOrder - right.treeViewOrder || left.order - right.order
  ))
}

function variableDefaultValue(variable: VariableItemConfig): unknown {
  switch (variable.type) {
    case 'number': {
      const value = Number(variable.defaultValue.trim())
      return Number.isFinite(value) ? value : 0
    }
    case 'boolean':
      return variable.defaultValue.trim().toLocaleLowerCase() === 'true'
    case 'array': {
      try {
        const value: unknown = JSON.parse(variable.defaultValue || '[]')
        return Array.isArray(value) ? value : []
      } catch {
        return []
      }
    }
    case 'string':
    case '':
    default:
      return variable.defaultValue
  }
}

export function buildVariableState(
  objects: VariableObjectConfig[],
  variables: VariableItemConfig[],
  options: { parentId?: string; enabledOnly?: boolean; includeDynamicTemplate?: boolean } = {}
): JsonObject {
  const parentId = options.parentId ?? ''
  const enabledOnly = options.enabledOnly ?? true
  const includeDynamicTemplate = options.includeDynamicTemplate ?? false
  const userObjects = objects.filter((item) => item.id !== VARIABLE_INITIALIZATION_OBJECT_ID)
  const byId = new Map(userObjects.map((item) => [item.id, item]))
  const childrenByParent = new Map<string, VariableObjectConfig[]>()
  const variablesByParent = new Map<string, VariableItemConfig[]>()

  for (const item of userObjects) {
    const safeParentId = item.parentId !== item.id && byId.has(item.parentId) ? item.parentId : ''
    const siblings = childrenByParent.get(safeParentId) ?? []
    siblings.push(item)
    childrenByParent.set(safeParentId, siblings)
  }
  for (const item of variables) {
    const safeParentId = byId.has(item.objectId) ? item.objectId : ''
    const siblings = variablesByParent.get(safeParentId) ?? []
    siblings.push(item)
    variablesByParent.set(safeParentId, siblings)
  }

  const objectEnabled = (objectId: string): boolean => {
    const visited = new Set<string>()
    let current = byId.get(objectId)
    while (current) {
      if (!current.enabled || visited.has(current.id)) return false
      visited.add(current.id)
      current = byId.get(current.parentId)
    }
    return true
  }

  const fill = (target: JsonObject, currentParentId: string): void => {
    for (const child of ordered(childrenByParent.get(currentParentId) ?? [])) {
      if (child.dynamicKey && !includeDynamicTemplate) continue
      if (enabledOnly && !objectEnabled(child.id)) continue
      const plainName = child.name.trim()
      if (!plainName) continue
      const name = child.dynamicKey && includeDynamicTemplate ? `<${plainName}>` : plainName
      const childState: JsonObject = {}
      fill(childState, child.id)
      target[name] = childState
    }
    for (const item of ordered(variablesByParent.get(currentParentId) ?? [])) {
      if (enabledOnly && (!item.enabled || (currentParentId && !objectEnabled(currentParentId)))) continue
      const name = item.title.trim()
      if (name) target[name] = variableDefaultValue(item)
    }
  }

  const result: JsonObject = {}
  fill(result, parentId)
  return result
}

export function generatedInitialStateJson(objects: VariableObjectConfig[], variables: VariableItemConfig[]): string {
  return JSON.stringify(buildVariableState(objects, variables), null, 2)
}

export function generatedInitialStatePreviewJson(objects: VariableObjectConfig[], variables: VariableItemConfig[]): string {
  return JSON.stringify(buildVariableState(objects, variables, { includeDynamicTemplate: true }), null, 2)
}

export function generatedObjectStateJson(objectId: string, objects: VariableObjectConfig[], variables: VariableItemConfig[]): string {
  if (!objects.some((item) => item.id === objectId && item.id !== VARIABLE_INITIALIZATION_OBJECT_ID)) return '{}'
  return JSON.stringify(buildVariableState(objects, variables, {
    parentId: objectId,
    enabledOnly: false,
    includeDynamicTemplate: true
  }), null, 2)
}
