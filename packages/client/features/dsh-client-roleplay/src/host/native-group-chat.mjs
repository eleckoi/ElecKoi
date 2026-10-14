import { z } from 'zod'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const GROUP_RESPONSE_EVENT = 'eleckoi/group-response'
export const GROUP_CONTROL_SOURCE = 'plugin:eleckoi-group-response'
export const GROUP_CANCELLED_EVENT = 'eleckoi/group-response-cancelled'
const responseSchema = z.object({ turn: z.number().int().positive(), groupId: z.string().min(1), characterId: z.string().min(1),
  speakerName: z.string(), speakerAvatar: z.string(), requestId: z.string().min(1), operationId: z.string().min(1),
  inputMessageId: z.string().min(1).optional(), inputEventSeq: z.number().int().nonnegative().optional() }).strict()
const viewSchema = z.object({ responses: z.array(responseSchema) }).strict()

/** Speaker identities are durable native Session data, independent of UI state. */
export const groupResponsesProjection = { key: 'eleckoiGroupResponses', stateVersion: 1, stateSchema: viewSchema,
  init: () => ({ responses: [] }),
  apply(state, event) {
    if (event.type === GROUP_CANCELLED_EVENT) return { responses: state.responses.filter(item => item.requestId !== event.data.requestId) }
    if (event.type === 'user/message') {
      const actor = state.responses.findLast(item => !item.inputMessageId && (event.data.source?.rpcId === item.requestId
        || item.groupId === event.data.source?.groupId && item.characterId === event.data.source?.characterId))
      if (!actor) return state
      return { responses: state.responses.map(item => item === actor ? { ...item,
        inputMessageId: event.data.id, inputEventSeq: event.seq } : item) }
    }
    if (event.type !== GROUP_RESPONSE_EVENT) return state
    const response = responseSchema.parse(event.data)
    return { responses: [...state.responses.filter(item => item.turn !== response.turn), response] }
  }, wire: { viewSchema, view: state => state } }

/** Admit one member into the same real Agent, after the prior member committed. */
export function startGroupMember(agent, actor, text, requestId, operationId, signal) {
  signal.throwIfAborted()
  const previous = activeGroupResponses(agent.session.snapshotEvents()).find(item => item.requestId === requestId)
  if (previous) return { turn: previous.turn, operationId: previous.operationId }
  if (agent.status !== 'idle' || agent.inbox.hasPending) throw new Error('上一位群聊成员还未结束。')
  if (text === undefined && !agent.session.deriveMessages().some(message => message.role === 'user' && message.source?.kind === 'user'))
    throw new Error('群聊没有真实用户输入，不能凭空继续。')
  const { turn } = recordGroupAdmission(agent,actor,requestId,operationId,signal)
  const message = text === undefined
    ? createUserMessage({ source: { kind: GROUP_CONTROL_SOURCE, groupId: actor.groupId, characterId: actor.characterId, speakerName: actor.name },
      content: [{ type: 'text', text: `Respond as ${actor.name} to the latest user message, considering the preceding group members' replies. Use this character's active Agent preset, tools and normal final-response format. Speak only for this character.` }] })
    : createUserMessage({ source: { kind: 'user', rpcId: requestId, groupId: actor.groupId, characterId: actor.characterId, speakerName: actor.name }, content: [{ type: 'text', text }] })
  agent.followup(message)
  return { turn, operationId }
}

/** Prepare actor identity for the official Session prompt endpoint, including attachments. */
export function recordGroupAdmission(agent, actor, requestId, operationId, signal) {
  signal.throwIfAborted()
  if (agent.status !== 'idle' || agent.inbox.hasPending) throw new Error('上一位群聊成员还未结束。')
  const turn = (agent.session.snapshotEvents().filter(event => event.type === 'turn/start').at(-1)?.data.turn ?? 0) + 1
  agent.session.append(GROUP_RESPONSE_EVENT, { turn, groupId: actor.groupId, characterId: actor.characterId,
    speakerName: actor.name, speakerAvatar: actor.avatar, requestId, operationId }, { ignorable: true })
  return { turn, operationId }
}

export function activeGroupResponses(events) {
  return events.reduce(groupResponsesProjection.apply,groupResponsesProjection.init()).responses
}

/** Native groups persist only configuration; chat bodies remain in the Session. */
export function normalizeGroup(input, characters, before) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('群聊配置必须是对象。')
  const id = String(input.id ?? before?.id ?? '').trim()
  if (!id) throw new Error('群聊缺少编号。')
  const resolve = value => {
    const key = String(value), character = characters.find(character => character.id === key || character.avatar_id === key || `${character.id}.png` === key || character.avatar === key)
    if (!character) throw new Error(`群聊成员不存在：${key}`)
    return character.id
  }
  const memberIds = (input.members ?? before?.members ?? []).map(resolve)
  if (!memberIds.length || new Set(memberIds).size !== memberIds.length) throw new Error('群聊成员不能为空或重复。')
  const disabledIds = (input.disabled_members ?? before?.disabled_members ?? []).map(resolve)
  if (disabledIds.some(id => !memberIds.includes(id))) throw new Error('禁用成员不在群聊中。')
  const strategy = Number(input.activation_strategy ?? before?.activation_strategy ?? 1)
  if (![0, 1, 2, 3].includes(strategy)) throw new Error('群聊发言策略无效。')
  const generationMode = Number(input.generation_mode ?? before?.generation_mode ?? 0)
  if (![0, 1, 2].includes(generationMode)) throw new Error('群聊角色资料模式无效。')
  return { ...before, ...input, id, name: String(input.name ?? before?.name ?? id), memberIds, disabledIds, activation_strategy: strategy,
    generation_mode: generationMode,
    generation_mode_join_prefix: String(input.generation_mode_join_prefix ?? before?.generation_mode_join_prefix ?? ''),
    generation_mode_join_suffix: String(input.generation_mode_join_suffix ?? before?.generation_mode_join_suffix ?? ''),
    members: memberIds, disabled_members: disabledIds, chat_id: String(input.chat_id ?? before?.chat_id ?? ''),
    chats: [...new Set([...(input.chats ?? before?.chats ?? []), ...(input.chat_id ? [String(input.chat_id)] : [])])].map(String) }
}

export function publicGroup(group, characters) {
  const avatar = id => characters.find(character => character.id === id)?.avatar_id || `${id}.png`
  return { ...group, members: group.memberIds.map(avatar), disabled_members: group.disabledIds.map(avatar) }
}

/** Match each displayed/native message to the actor that actually ran its turn. */
export function groupSpeakerRows(events) {
  const actors = new Map(activeGroupResponses(events).map(actor => [actor.turn, actor]))
  const speakers = new Map()
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const actor = actors.get(event.data.turn), id = event.data.message?.id
    if (actor && id) speakers.set(id, actor)
  }
  return speakers
}

/** Historical projection carries actual actor identity without mutating stored text. */
export function groupHistorySources(events) {
  return Object.fromEntries([...groupSpeakerRows(events)].map(([id, actor]) => [id,
    { groupId: actor.groupId, characterId: actor.characterId, speakerName: actor.speakerName }]))
}

/** Activation uses durable actor IDs; selection never changes the chat's owner. */
export function selectGroupActors(group, actors, characters, messages, input, random = Math.random) {
  const strategy = group.activation_strategy, ids = actors.map(actor => actor.characterId)
  if (strategy === 1) return ids
  if (strategy === 2) {
    const selected = group.selectedMemberId ?? group.selected_member
    const character = characters.find(item => item.id === selected || item.avatar_id === selected || `${item.id}.png` === selected)
    if (!character || !ids.includes(character.id)) throw new Error('手动群聊请先选择启用的发言成员。')
    return [character.id]
  }
  const last = messages.at(-1), isUserInput = input !== undefined
  if (strategy === 3) {
    const spoken = new Set()
    if (!isUserInput) for (const message of [...messages].reverse()) {
      if (message.role === 'user') break
      if (message.speakerCharacterId) spoken.add(message.speakerCharacterId)
    }
    const remaining = ids.filter(id => !spoken.has(id))
    const pool = remaining.length ? remaining : ids.length > 1 && last?.speakerCharacterId
      ? ids.filter(id => id !== last.speakerCharacterId) : ids
    return [pool[Math.floor(random() * pool.length)]]
  }
  if (strategy !== 0) throw new Error('群聊发言策略无效。')
  const banned = !isUserInput && !group.allow_self_responses ? last?.speakerName : undefined
  const available = actors.filter(actor => actor.name !== banned)
  const activated = [], chatty = []
  const words = value => String(value ?? '').match(/\b\w+\b/g)?.map(word => word.toLowerCase()) ?? []
  const mentions = words(input)
  for (const word of mentions) {
    const actor = available.find(actor => words(actor.name).includes(word))
    if (actor) activated.push(actor.characterId)
  }
  const shuffled = [...available]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1)); [shuffled[index],shuffled[other]] = [shuffled[other],shuffled[index]]
  }
  for (const actor of shuffled) {
    const value = Number(characters.find(character => character.id === actor.characterId)?.talkativeness ?? .5)
    const probability = Number.isNaN(value) ? .5 : value
    if (probability >= random()) activated.push(actor.characterId)
    if (probability > 0) chatty.push(actor.characterId)
  }
  const fallback = chatty.length ? chatty : ids
  if (!activated.length) activated.push(fallback[Math.floor(random()*fallback.length)])
  return [...new Set(activated)]
}
