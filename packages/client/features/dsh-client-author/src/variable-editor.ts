import { describeEditingVariableSchema, subscribeVariableSchemas, validateEditingVariables, variableSchemaRevision, variableSchemaTargets,
  type EditingVariableSchemaDescription, type EditingVariableTarget } from '@eleckoi/tavern-native'
import type { TavernRemote } from './tavern.js'

export interface NativeVariableEditorScope extends EditingVariableTarget { key: string; label: string }
const labels: Record<string, string> = { chat: '当前聊天', global: '全局', character: '角色', preset: '预设', script: '脚本', message: '消息' }
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}
}
function text(value: unknown): string { return typeof value === 'string' ? value : '' }

/** Manual editing reuses the same native scopes and ordered persistence lane as author scripts. */
export class NativeVariableEditor {
  constructor(private readonly options: {
    shared: { writeTail?: Promise<unknown> }; remote(): TavernRemote | undefined;
    available(conversationId: string): void; refresh(): void;
  }) {}
  getRevision = (): number => variableSchemaRevision(this.options.shared)
  subscribe = (listener: () => void): (() => void) => subscribeVariableSchemas(this.options.shared, listener)
  private remote(): TavernRemote {
    const remote = this.options.remote()
    if (!remote) throw new Error('原生变量服务尚未连接。')
    return remote
  }
  private async invoke(conversationId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    this.options.available(conversationId)
    const result = await this.remote().invoke(conversationId, method, params)
    if (!result.ok) throw new Error(result.error?.message || '原生变量操作失败。')
    return result.value
  }
  async listScopes(conversationId: string): Promise<NativeVariableEditorScope[]> {
    this.options.available(conversationId)
    const result = await this.remote().snapshot(conversationId)
    if (!result.ok) throw new Error(result.error?.message || '变量作用域读取失败。')
    const snapshot = record(result.value), context = record(snapshot.context), scopes = new Map<string, NativeVariableEditorScope>()
    const add = (scope: string, owner: string, label = labels[scope] || scope) => {
      if (scope !== 'global' && !owner) return
      const key = `${scope}:${owner}`
      scopes.set(key, { key, scope, owner, label })
    }
    add('chat', conversationId); add('global', '')
    add('character', text(context.characterId)); add('preset', text(context.presetId))
    for (const [scope, owners] of Object.entries(record(snapshot.variableScopes))) {
      for (const owner of Object.keys(record(owners))) if (!scopes.has(`${scope}:${owner}`)) add(scope, owner, `${labels[scope] || scope} · ${owner}`)
    }
    for (const target of variableSchemaTargets(this.options.shared)) {
      if (target.scope === 'script') add(target.scope, target.owner, `脚本 · ${target.scriptId || target.owner}`)
    }
    if (Array.isArray(snapshot.messages)) for (const [index, message] of snapshot.messages.entries()) {
      const value = record(message), id = text(value.id)
      if (id) add('message', id, `消息 ${index} · ${text(value.speakerName) || text(value.role)}`)
    }
    return [...scopes.values()]
  }
  async read(conversationId: string, target: EditingVariableTarget): Promise<Record<string, unknown>> {
    const value = await this.invoke(conversationId, 'variables.getScope', { scope: target.scope, owner: target.owner })
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('原生变量根节点不是对象。')
    return structuredClone(record(value))
  }
  describe(target: EditingVariableTarget, variables: Record<string, unknown>): Promise<EditingVariableSchemaDescription> {
    return describeEditingVariableSchema(this.options.shared, target, variables)
  }
  async save(conversationId: string, target: EditingVariableTarget, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.options.available(conversationId)
    const candidate = await validateEditingVariables(this.options.shared, target, variables)
    const operation = (this.options.shared.writeTail ?? Promise.resolve()).then(async () => {
      const result = await this.invoke(conversationId, 'variables.setScope', { scope: target.scope, owner: target.owner, variables: candidate })
      this.options.refresh()
      if (result === null || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('变量保存没有返回原生变量对象。')
      return structuredClone(record(result))
    })
    this.options.shared.writeTail = operation.then(() => undefined, () => undefined)
    return operation
  }
}
