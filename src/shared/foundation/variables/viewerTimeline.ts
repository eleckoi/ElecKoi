import type { ChatMessage } from '@shared/contracts/entities/chat'
import type {
  VariableFloorSnapshot,
  VariableStateDocument,
  VariableViewerTimeline
} from '@shared/contracts/variables/viewer'

type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function jsonValueEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => jsonValueEquals(value, right[index]))
  }
  if (isJsonObject(left) && isJsonObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key) && jsonValueEquals(left[key], right[key]))
  }
  return false
}

export function variableLeafCount(value: unknown): number {
  if (isJsonObject(value)) return Object.values(value).reduce<number>((count, child) => count + variableLeafCount(child), 0)
  if (value === undefined) return 0
  return 1
}

export function parseVariableStateDocument(rawJson: string): VariableStateDocument {
  const normalized = rawJson.trim() ? rawJson : '{}'
  try {
    const parsed: unknown = JSON.parse(normalized)
    if (!isJsonObject(parsed)) {
      return { rawJson: normalized, root: null, errorMessage: '变量快照的根节点不是对象', topLevelCount: 0, valueCount: 0 }
    }
    return {
      rawJson: normalized,
      root: parsed,
      errorMessage: '',
      topLevelCount: Object.keys(parsed).length,
      valueCount: variableLeafCount(parsed)
    }
  } catch {
    return { rawJson: normalized, root: null, errorMessage: '变量快照无法解析', topLevelCount: 0, valueCount: 0 }
  }
}

export function countVariableChanges(previous: unknown, current: unknown): number {
  if (jsonValueEquals(previous, current)) return 0
  if (previous === undefined) return Math.max(variableLeafCount(current), 1)
  if (current === undefined) return Math.max(variableLeafCount(previous), 1)
  if (isJsonObject(previous) && isJsonObject(current)) {
    return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
      .reduce((count, key) => count + countVariableChanges(previous[key], current[key]), 0)
  }
  if (Array.isArray(previous) && Array.isArray(current)) return 1
  return 1
}

export function variablePath(parent: string, key: string): string {
  return `${parent}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`
}

export function changedVariablePaths(previous: unknown, current: unknown): string[] {
  const output = new Set<string>()
  collectChangedPaths(previous, current, '', output)
  return [...output]
}

function collectChangedPaths(previous: unknown, current: unknown, path: string, output: Set<string>): void {
  if (jsonValueEquals(previous, current) || current === undefined) return
  if (Array.isArray(current)) {
    if (path) output.add(path)
    return
  }
  if (isJsonObject(previous) && isJsonObject(current)) {
    for (const [key, value] of Object.entries(current)) {
      collectChangedPaths(previous[key], value, variablePath(path, key), output)
    }
    return
  }
  if (isJsonObject(current)) {
    for (const [key, value] of Object.entries(current)) {
      collectChangedPaths(undefined, value, variablePath(path, key), output)
    }
    return
  }
  if (path) output.add(path)
}

function floorPreview(content: string): string {
  const excerpt = content.split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/\s+/gu, ' ')
    .slice(0, 42)
    .replace(/…+$/u, '')
    ?? ''
  return excerpt ? `${excerpt}……` : ''
}

export function buildVariableViewerTimeline(
  messages: ChatMessage[],
  initialStateJson: string,
  currentStateJson: string
): VariableViewerTimeline {
  let carriedRaw = initialStateJson.trim() ? initialStateJson : '{}'
  let previous = parseVariableStateDocument(carriedRaw)
  let numberedFloor = 0
  const floors: VariableFloorSnapshot[] = []

  for (const message of messages) {
    if (message.role !== 'assistant' || message.status === 'streaming') continue
    const rawAtFloor = message.variableStateJson.trim() ? message.variableStateJson : carriedRaw
    const stateAtFloor = parseVariableStateDocument(rawAtFloor)
    const isOpening = message.id === 'opening'
    const changedPaths = isOpening ? [] : changedVariablePaths(previous.root ?? undefined, stateAtFloor.root ?? undefined)
    if (message.variableStateJson.trim()) carriedRaw = message.variableStateJson
    if (!isOpening) numberedFloor += 1
    floors.push({
      id: message.id,
      label: isOpening ? '开场' : `第 ${numberedFloor} 楼`,
      messagePreview: floorPreview(message.content),
      createdAt: message.createdAt,
      state: stateAtFloor,
      changedValueCount: isOpening ? 0 : countVariableChanges(previous.root ?? undefined, stateAtFloor.root ?? undefined),
      changedPaths
    })
    previous = stateAtFloor
  }

  const currentRaw = currentStateJson.trim() || floors.at(-1)?.state.rawJson.trim() || carriedRaw
  return { current: parseVariableStateDocument(currentRaw), floors }
}
