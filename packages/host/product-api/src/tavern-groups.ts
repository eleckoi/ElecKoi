import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import type { TavernPromptText } from './types.js'

type Fields = Record<string, unknown>
export interface NativeTavernGroup extends Fields {
  id: string
  name: string
  memberIds: string[]
  disabledIds: string[]
  members: string[]
  disabled_members: string[]
  activation_strategy: number
  chat_id: string
  chats: string[]
}
export interface NativeGroupActor {
  groupId: string
  characterId: string
  name: string
  avatar: string
}
const object = (value: unknown): Fields => value && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {}
const string = (value: unknown): string => typeof value === 'string' ? value : ''

/** Persistent group configuration, using existing product settings and native chats. */
export class NativeTavernGroups {
  constructor(private readonly ctx: Context, private readonly readState: () => Fields,
    private readonly writeState: (state: Fields) => Promise<void>, private readonly publicCharacters: () => Fields[]) {}

  private groups(state = this.readState()): NativeTavernGroup[] {
    return Object.values(object(state.groups)) as NativeTavernGroup[]
  }

  private find(id: string, state = this.readState()): NativeTavernGroup {
    const group = this.groups(state).find(item => item.id === id)
    if (!group) throw new Error(`群聊不存在：${id}`)
    return group
  }

  private characterId(reference: unknown): string {
    const key = String(reference), character = this.publicCharacters().find(item => item.id === key || item.avatar_id === key
      || item.avatar === key || `${item.id}.png` === key)
    if (!character) throw new Error(`群聊成员不存在：${key}`)
    return String(character.id)
  }

  snapshot(conversationId: string): { groups: Fields[]; groupId: string | null } {
    const characters = this.publicCharacters()
    const avatar = (id: string): string => string(characters.find(item => item.id === id)?.avatar_id) || `${id}.png`
    const state = this.readState(), groupId = string(object(state.groupBindings)[conversationId]) || null
    return { groups: this.groups(state).map(group => ({ ...structuredClone(group),
      members: group.memberIds.map(avatar), disabled_members: group.disabledIds.map(avatar) })), groupId }
  }

  actors(conversationId: string, id: string, references?: unknown[]): NativeGroupActor[] {
    const state = this.readState(), group = this.find(id, state)
    if (object(state.groupBindings)[conversationId] !== group.id || !group.chats.includes(conversationId))
      throw new Error('当前 Session 未绑定到这个群聊。')
    const memberIds = references ? references.map(reference => this.characterId(reference))
      : group.memberIds.filter(memberId => !group.disabledIds.includes(memberId))
    if (!memberIds.length || new Set(memberIds).size !== memberIds.length || memberIds.some(memberId => !group.memberIds.includes(memberId)))
      throw new Error('群聊发言成员不能为空、重复或不属于本群。')
    const characters = this.ctx.eleckoiProductData.readCharacters().items
    return memberIds.map(characterId => {
      const character = characters.find(item => item.id === characterId)
      if (!character) throw new Error(`群聊角色已被删除：${characterId}`)
      return { groupId: group.id, characterId, name: character.name || characterId,
        avatar: character.persona?.assistant_avatar || character.avatar || '' }
    })
  }

  async promptContext(conversationId: string, characterId: string,
    preparation: Parameters<Context['eleckoiProductData']['projectSettingPromptText']>[1],
    resolveTexts?: (texts: TavernPromptText[]) => Promise<string[] | undefined>): Promise<unknown> {
    const state = this.readState(), groupId = string(object(state.groupBindings)[conversationId])
    if (!groupId) return null
    const group = this.find(groupId, state)
    this.actors(conversationId, groupId, [characterId])
    const module = '@eleckoi/dsh-client-roleplay/host/native-group-prompts.mjs'
    const { groupCardPromptPlan } = await import(module)
    const characters = this.publicCharacters(), metadata = object(object(state.chatMetadata)[conversationId])
    const expand = (source: string, characterName: string) => this.ctx.eleckoiProductData.projectSettingPromptText(source, preparation, { characterName, stage: 'macros' })
    const transform = (source: string, depth?: number) => this.ctx.eleckoiProductData.projectSettingPromptText(source, preparation,
      { stage: 'regex', ...(depth === undefined ? {} : { depth }) })
    if (!resolveTexts || Number(group.generation_mode ?? 0) === 0) return groupCardPromptPlan(group, characters, characterId, metadata, expand, transform)
    const texts: TavernPromptText[] = []
    groupCardPromptPlan(group, characters, characterId, metadata, (content: string, characterName: string) => {
      texts.push({ content, characterName, userName: preparation.promptTextContext.macros?.userName ?? '用户' })
      return content
    })
    const rendered = await resolveTexts(texts)
    if (!rendered) {
      const unresolved = texts.map(entry => expand(entry.content, entry.characterName))
      if (unresolved.some(content => /\{\{[^{}]*\}\}/.test(content))) throw new Error('群聊宏执行环境尚未就绪，请等待聊天作者脚本初始化。')
      return groupCardPromptPlan(group, characters, characterId, metadata, expand, transform)
    }
    let index = 0
    const plan = groupCardPromptPlan(group, characters, characterId, metadata, () => rendered[index++], transform)
    return { ...plan, macrosFrozen: true }
  }

  async invoke(conversationId: string, method: string, params: Fields): Promise<unknown> {
    const state = this.readState(), id = string(params.id) || string(params.groupId)
      || string(object(state.groupBindings)[conversationId])
    if (method === 'group.list') return this.snapshot(conversationId).groups
    if (method === 'group.members') {
      if (Array.isArray(params.memberIds) || params.forceAvatar !== undefined) return this.actors(conversationId,id,
        Array.isArray(params.memberIds) ? params.memberIds : [params.forceAvatar])
      const group = this.find(id,state), actors = this.actors(conversationId,id)
      const module = '@eleckoi/dsh-client-roleplay/host/native-group-chat.mjs'
      const { selectGroupActors } = await import(module)
      const snapshot = await this.ctx.eleckoiConversationsApi.tavernSnapshot(conversationId)
      const messages = Array.isArray(snapshot.messages) ? snapshot.messages : []
      const selected = selectGroupActors(group,actors,this.publicCharacters(),messages,
        params.isUserInput === true ? string(params.text) : undefined)
      return this.actors(conversationId,id,selected)
    }
    if (method === 'group.create' || method === 'group.replace') {
      const input = object(params.data), groupId = id || string(input.id) || randomUUID()
      const before = method === 'group.replace' ? this.find(groupId, state) : undefined
      if (!before && this.groups(state).some(group => group.id === groupId)) throw new Error(`群聊编号已存在：${groupId}`)
      const module = '@eleckoi/dsh-client-roleplay/host/native-group-chat.mjs'
      const { normalizeGroup } = await import(module)
      const group = normalizeGroup({ ...input, id: groupId }, this.publicCharacters(), before) as NativeTavernGroup
      for (const chatId of group.chats) this.ctx.eleckoiProductData.runtimeSessionId(chatId)
      state.groups = { ...object(state.groups), [group.id]: group }
      state.groupBindings = { ...object(state.groupBindings), ...Object.fromEntries(group.chats.map(chatId => [chatId, group.id])) }
      await this.writeState(state)
      this.ctx.eleckoiConversationChanges.publish({ kind: 'catalog', conversationId: group.chat_id, reason: 'updated' })
      return this.snapshot(conversationId).groups.find(item => item.id === group.id)
    }
    const group = this.find(id, state)
    if (method === 'group.delete') {
      const next = { ...object(state.groups) }; delete next[group.id]; state.groups = next
      state.groupBindings = Object.fromEntries(Object.entries(object(state.groupBindings)).filter(([, value]) => value !== group.id))
      await this.writeState(state)
      this.ctx.eleckoiConversationChanges.publish({ kind: 'catalog', conversationId, reason: 'updated' })
      return true
    }
    if (method === 'group.bind' || method === 'group.open') {
      let chatId = string(params.chatId) || (method === 'group.bind' ? conversationId : group.chat_id)
      if (chatId) this.ctx.eleckoiProductData.runtimeSessionId(chatId)
      else {
        const characterId = group.memberIds.find(memberId => !group.disabledIds.includes(memberId))
        if (!characterId) throw new Error('群聊没有启用的成员。')
        const details = await this.ctx.eleckoiConversationsApi.create({ title: group.name, metadata: { characterId } })
        chatId = details.conversation.id
      }
      const currentBinding = string(object(state.groupBindings)[chatId])
      if (currentBinding && currentBinding !== group.id) throw new Error('聊天已属于另一个群聊。')
      const saved = { ...group, chat_id: chatId, chats: [...new Set([...group.chats, chatId])] }
      state.groups = { ...object(state.groups), [group.id]: saved }
      state.groupBindings = { ...object(state.groupBindings), [chatId]: group.id }
      await this.writeState(state)
      this.ctx.eleckoiConversationChanges.publish({ kind: 'catalog', conversationId: chatId, reason: 'updated' })
      return chatId
    }
    throw new Error(`原生群聊未提供操作：${method}`)
  }
}
