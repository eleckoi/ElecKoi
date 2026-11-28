import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { DELEGATED_ROLEPLAY_REPLY_EVENT, ELECKOI_FAILURE_CODES, productFailure, ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_SOURCE, roleplayReplySpeakers, submittedRoleplayBlocks } from '@eleckoi/dsh-product-api'

export { ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_SOURCE }
export const ROLEPLAY_REPLY_TOOL = 'eleckoi_roleplay_reply'
export const ROLEPLAY_REPLY_GROUP_ID = 'builtin:roleplay-reply'
export const DELEGATED_REPLY_NOTICE = 'plugin:eleckoi-delegated-roleplay-reply'

export const roleplayReplyEnabled = snapshot => !snapshot?.disabledToolGroupIds?.includes(ROLEPLAY_REPLY_GROUP_ID)
export const roleplayReplyPreview = text => [...text.trim()].slice(0, 240).join('')

export function roleplayReplyResult(event) {
  if (event.type !== 'tool/result' || event.data.message.isError) return undefined
  const meta = event.data.meta
  if (meta?.source !== ROLEPLAY_REPLY_SOURCE) return undefined
  const speakers = roleplayReplySpeakers(meta)
  return speakers.length ? { ...meta, speakers } : undefined
}

/** Commit reply text carried by the original DSH tool call. */
export function installRoleplayReply(agent, isEnabled = () => true, readConversation = () => ({}), readIllustration = () => undefined, readMainSession) {
  const { ctx, session } = agent
  let unregister, advertisedCast = [], advertisedCardName, advertisedFrames, fields
  let output
  const refreshTool = () => {
    const { cast = [], persona, characterName } = readConversation()
    const illustration = readIllustration()
    const allowFrames = Boolean(illustration?.enabled && illustration.modelConfigId && ctx.get('eleckoiAutoIllustration'))
    const cardName = [persona?.assistant_name, characterName].find(name => typeof name === 'string' && name.trim())?.trim() ?? '未命名角色'
    if (unregister && allowFrames === advertisedFrames && cardName === advertisedCardName && cast.length === advertisedCast.length
      && cast.every(({ id, name }, index) => id === advertisedCast[index].id && name === advertisedCast[index].name)) return
    unregister?.()
    fields = replyFields(cast, cardName)
    unregister = ctx.tools.register(defineRoleplayReply(agent, fields, allowFrames, () => output), { when: isEnabled })
    advertisedCast = cast
    advertisedCardName = cardName
    advertisedFrames = allowFrames
  }
  const startDelegated = (callId) => {
    const parent = readMainSession?.()
    if (!parent || output.delegated.has(callId)) return
    const anchorMessageId = parent.deriveMessages().at(-1)?.id
    const id = [agent.id, output.turn, output.step, callId].join(':')
    const data = { id, mainSessionId: parent.id, childSessionId: agent.id,
      childTurn: output.turn, childStep: output.step, toolCallId: callId,
      ...(anchorMessageId ? { anchorMessageId } : {}) }
    const anchor = parent.append(DELEGATED_ROLEPLAY_REPLY_EVENT, { ...data, toolFields: fields, status: 'waiting' }, { ignorable: true })
    output.delegated.set(callId, { ...data, parent, anchorSeq: anchor.seq, startedAt: anchor.time })
  }
  const settleDelegated = (callId, blocks = []) => {
    const delegated = output.delegated.get(callId)
    if (!delegated) return
    output.delegated.delete(callId)
    const { parent, ...data } = delegated
    if (readMainSession() !== parent) return
    const text = blocks.map(block => block.text).join('\n\n')
    parent.append(DELEGATED_ROLEPLAY_REPLY_EVENT, { ...data, status: text ? 'complete' : 'cancelled',
      ...(text ? { text, blocks } : {}) }, { ignorable: true })
    if (text) ctx.agents.get(parent.id)?.inject(createUserMessage({
      source: { kind: DELEGATED_REPLY_NOTICE },
      content: [{ type: 'text', text: '以下子代理角色正文已在对话中显示。\n'
        + blocks.map(block => '<' + block.speakerName + '>' + block.text + '</' + block.speakerName + '>').join('\n\n') }]
    }))
  }
  refreshTool()
  ctx.on('agent/prepare-step', ({ agent: owner }) => {
    if (owner === agent) refreshTool()
  })
  ctx.on('agent/request', ({ agent: owner, turn, step }, next) => {
    if (owner === agent) {
      if (output?.turn !== turn) {
        output = { turn, enabled: isEnabled(), delegated: new Map() }
        session.append(ROLEPLAY_OUTPUT_EVENT, { turn, toolFields: fields }, { ignorable: true })
      }
      output.step = step
    }
    return next()
  })
  if (readMainSession) ctx.on('agent/assistant-stream', ({ agent: owner, frame }) => {
    if (owner !== agent || !output?.enabled) return
    if (frame.type === 'chunk' && frame.chunk.type === 'tool-call-delta' && frame.chunk.name === ROLEPLAY_REPLY_TOOL) {
      startDelegated(frame.chunk.id)
    } else if (frame.type === 'end' && (frame.outcome.kind === 'abandoned' || frame.outcome.eventType === 'assistant/attempt')) {
      for (const callId of output.delegated.keys()) settleDelegated(callId)
    }
  })
  ctx.on('session/event', (owner, event) => {
    if (owner !== session || !output || event.data?.turn !== output.turn) return
    if (event.type === 'assistant/message') output.latestAssistant = event
    if (event.type === 'tool/result') {
      const callId = event.data.message.source.callId
      const result = roleplayReplyResult(event)
      const assistant = output.latestAssistant
      const call = assistant?.data.step === event.data.step && assistant.data.message.content.find(
        block => block.type === 'tool-call' && block.id === callId && block.name === ROLEPLAY_REPLY_TOOL)
      if (!result || !call) {
        settleDelegated(callId)
        return
      }
      if (result.frames) output.framesSubmitted = true
      output.replySeq = assistant.seq
      startDelegated(callId)
      const delegated = output.delegated.get(callId)
      if (delegated) {
        const args = JSON.parse(call.arguments)
        settleDelegated(callId, submittedRoleplayBlocks(result.speakers, delegated.id, field => args[field]))
      }
    }
    if (event.type === 'turn/end') {
      for (const callId of output.delegated.keys()) settleDelegated(callId)
      output = undefined
    }
  })
  ctx.on('agent/turn-stopping', ({ agent: owner, turn }) => {
    if (owner !== agent || output?.turn !== turn || !output.enabled || output.replySeq === undefined) return
    session.append(ROLEPLAY_OUTPUT_EVENT, { turn, replySeq: output.replySeq, toolBacked: true, toolFields: fields }, { ignorable: true })
  })
}

function replyFields(cast, cardName) {
  const speakers = new Map()
  for (const { name, id } of cast) speakers.set(name, speakers.has(name) ? null : id)
  const castNames = [...speakers].filter(([, id]) => id !== null).map(([name]) => name)
  const names = castNames.length ? castNames : [cardName]
  const occupied = new Set(names)
  return Object.fromEntries(names.map(name => {
    let field = name
    // Array-index keys would be reordered by JSON object enumeration.
    if (field === 'frames' || String(Number(field) >>> 0) === field && Number(field) < 4294967295) {
      field = '角色 ' + name
      while (occupied.has(field)) field = '角色 ' + field
      occupied.add(field)
    }
    return [field, { speakerName: name, ...(castNames.length ? { speakerId: speakers.get(name) } : {}) }]
  }))
}

function defineRoleplayReply(agent, fields, allowFrames, readOutput) {
  return defineTool({
    name: ROLEPLAY_REPLY_TOOL,
    description: '每轮必须至少调用一次本工具提交扮演正文，直接发送的正文玩家看不到。单人填一个角色字段，多人按发言顺序填写各自的字段。字段值直接写该角色正文。',
    parameters: {
      ...Object.fromEntries(Object.entries(fields).map(([field, { speakerName }]) => [
        field, { type: 'string', ...(field !== speakerName ? { description: speakerName + '的正文' } : {}) }
      ])),
      ...(allowFrames ? { frames: { type: 'array', description: '自动配图分镜，整轮一次提交。无分镜时可省略或传空数组。', items: {
        type: 'object', additionalProperties: false, properties: {
          id: { type: 'integer', required: true, description: '从 1 开始连续编号。' },
          prompt: { type: 'string', required: true },
          negative_prompt: { type: 'string', required: true },
          seed: { type: 'integer', description: '可选的图像种子。' },
          after_paragraph: { type: 'integer', description: '此分镜在正文中的备用段落位置。' }
        }
      } } } : {})
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      presentationMeta: (args, { speakers, frames }) => ({ source: ROLEPLAY_REPLY_SOURCE, speakers,
        preview: roleplayReplyPreview(speakers.map(speaker => args[speaker.field ?? speaker.speakerName].trim()).join('\n\n')),
        ...(frames ? { frames } : {}) }),
      render: () => [{ type: 'text', text: '角色正文已显示。' }]
    },
    async execute(args, execution) {
      if (execution.agent !== agent || execution.parent) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition,
        '角色回复必须从当前对话直接调用。', { what: '直接调用角色回复工具' })
      const frames = allowFrames ? args.frames : undefined
      const speakers = Object.keys(args).flatMap(field => Object.hasOwn(fields, field) && args[field].trim()
        ? [{ kind: 'speech', ...fields[field], ...(fields[field].speakerName !== field ? { field } : {}) }] : [])
      if (!speakers.length) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid,
        '请在至少一个角色字段填写正文。', { field: '角色正文' })
      if (frames?.length) {
        if (readOutput()?.framesSubmitted || frames.some((frame, index) => frame.id !== index + 1 || !frame.prompt.trim()
          || (frame.seed !== undefined && (frame.seed < 0 || frame.seed > 4294967295))
          || (frame.after_paragraph !== undefined && frame.after_paragraph < 0))) {
          throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '本轮分镜集中提交一次，需从 1 连续编号并提供画面提示词。', { field: '分镜' })
        }
        const illustrator = agent.ctx.get('eleckoiAutoIllustration')
        if (!illustrator) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition,
          '自动配图插件未启用。没有启用时省略 frames。', { what: '自动配图' })
        illustrator.validateReplyFrames(agent.id, frames)
      }
      execution.concludeTurn()
      return { speakers, ...(frames?.length ? { frames } : {}) }
    }
  })
}
