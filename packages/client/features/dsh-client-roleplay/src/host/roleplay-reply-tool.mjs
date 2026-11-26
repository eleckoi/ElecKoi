import { defineTool } from '@deepseek-ai/dsh-tools'
import { appendRoleplayReplyBlock, DELEGATED_ROLEPLAY_REPLY_EVENT, ELECKOI_FAILURE_CODES, productFailure, ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_SOURCE, roleplayReplyBlocks, roleplayReplySpeakers } from '@eleckoi/dsh-product-api'

export { ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_SOURCE }

export const ROLEPLAY_REPLY_TOOL = 'eleckoi_roleplay_reply'
export const ROLEPLAY_REPLY_GROUP_ID = 'builtin:roleplay-reply'

export const roleplayReplyEnabled = snapshot => !snapshot?.disabledToolGroupIds?.includes(ROLEPLAY_REPLY_GROUP_ID)

export function roleplayReplyResult(event) {
  if (event.type !== 'tool/result' || event.data.message.isError) return undefined
  const meta = event.data.meta
  if (meta?.source !== ROLEPLAY_REPLY_SOURCE) return undefined
  const speakers = roleplayReplySpeakers(meta)
  return speakers.length ? { ...meta, speakers } : undefined
}

/** A successful selection owns native text in the next assistant step. */
export function installRoleplayReply(agent, isEnabled = () => true, readConversation = () => ({}), readIllustration = () => undefined, readMainSession) {
  const { ctx, session } = agent
  let unregister, advertisedCast = [], advertisedCardName, advertisedFrames
  const refreshTool = () => {
    const { cast = [], persona, characterName } = readConversation()
    const illustration = readIllustration()
    const allowFrames = Boolean(illustration?.enabled && illustration.modelConfigId && ctx.get('eleckoiAutoIllustration'))
    const cardName = [persona?.assistant_name, characterName].find(name => typeof name === 'string' && name.trim())?.trim() ?? '未命名角色'
    if (unregister && allowFrames === advertisedFrames && cardName === advertisedCardName && cast.length === advertisedCast.length
      && cast.every(({ id, name }, index) => id === advertisedCast[index].id && name === advertisedCast[index].name)) return
    unregister?.()
    unregister = ctx.tools.register(defineRoleplayReply(agent, cast, cardName, allowFrames, () => output), { when: isEnabled })
    advertisedCast = cast
    advertisedCardName = cardName
    advertisedFrames = allowFrames
  }
  let output
  const settleDelegated = (blocks = []) => {
    const delegated = output?.delegated
    if (!delegated) return
    output.delegated = undefined
    const { parent, ...data } = delegated
    if (readMainSession() !== parent) return
    const text = blocks.map(block => block.text).join('\n\n')
    parent.append(DELEGATED_ROLEPLAY_REPLY_EVENT, { ...data, status: text ? 'complete' : 'cancelled',
      ...(text ? { text, blocks } : {}) }, { ignorable: true })
  }
  refreshTool()
  ctx.on('agent/prepare-step', ({ agent: owner }) => {
    if (owner === agent) refreshTool()
  })
  ctx.on('agent/request', ({ agent: owner, turn }, next) => {
    if (owner === agent) {
      if (output?.turn !== turn) {
        output = { turn, enabled: isEnabled(), selections: [] }
        session.append(ROLEPLAY_OUTPUT_EVENT, { turn, nativeText: true }, { ignorable: true })
      }
    }
    return next()
  })
  ctx.on('session/event', (owner, event) => {
    if (owner !== session || !output || event.data?.turn !== output.turn) return
    const result = roleplayReplyResult(event)
    if (result && output.latestAssistant?.data.step === event.data.step) {
      const callId = event.data.message.source.callId
      output.selections.push({ callId, speakers: result.speakers })
      if (result.frames) output.framesSubmitted = true
      if (output.selections.length !== 1) settleDelegated()
      else {
        const parent = readMainSession?.()
        if (parent) {
          const anchorMessageId = parent.deriveMessages().at(-1)?.id
          const id = `${agent.id}:${output.turn}:${event.data.step}:${callId}`
          const data = { id, mainSessionId: parent.id, childSessionId: agent.id,
            childTurn: output.turn, childStep: event.data.step + 1,
            ...(result.speakers.length === 1 ? result.speakers[0] : { speakers: result.speakers }),
            ...(anchorMessageId ? { anchorMessageId } : {}) }
          const anchor = parent.append(DELEGATED_ROLEPLAY_REPLY_EVENT, { ...data, status: 'waiting' }, { ignorable: true })
          output.delegated = { ...data, parent, anchorSeq: anchor.seq, startedAt: anchor.time }
        }
      }
    }
    if (event.type === 'assistant/message') {
      const [selection] = output.selections
      const blocks = []
      if (output.selections.length === 1 && event.data.step === output.latestAssistant?.data.step + 1 && !event.data.interrupted) {
        const text = event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
        const { callId, speakers } = selection
        for (const block of roleplayReplyBlocks(text, speakers, output.delegated?.id ?? callId)) {
          appendRoleplayReplyBlock(blocks, block)
        }
        if (blocks.length) output.replySeq = event.seq
      }
      settleDelegated(blocks)
      output.selections = []
      output.latestAssistant = event
    }
    if (event.type === 'turn/end') {
      settleDelegated()
      output = undefined
    }
  })
  ctx.on('agent/turn-stopping', ({ agent: owner, turn }) => {
    if (owner !== agent || output?.turn !== turn || !output.enabled) return
    if (output.replySeq !== undefined) {
      session.append(ROLEPLAY_OUTPUT_EVENT, { turn, replySeq: output.replySeq, toolBacked: true, nativeText: true }, { ignorable: true })
      return
    }
    const event = output.latestAssistant
    if (!event || event.data.interrupted
      || event.data.message.content.some(block => block.type === 'tool-call')) return
    if (event.data.message.content.some(block => block.type === 'text' && block.text.trim())) {
      session.append(ROLEPLAY_OUTPUT_EVENT, { turn, replySeq: event.seq, fallback: true }, { ignorable: true })
    }
  })
}

function defineRoleplayReply(agent, cast, cardName, allowFrames, readOutput) {
  const speakers = new Map()
  for (const { name, id } of cast) speakers.set(name, speakers.has(name) ? null : id)
  const castNames = [...speakers].filter(([, id]) => id !== null).map(([name]) => name)
  const usesCover = castNames.length === 0
  const names = usesCover ? [cardName] : castNames
  const writeReply = '下一步必须用一条普通文本消息把本轮扮演正文发给玩家。每段用 <角色名>对应的角色扮演内容</角色名>，标签用实际角色名。谁发言、谁先发言由剧情和设定决定。'
  return defineTool({
    name: ROLEPLAY_REPLY_TOOL,
    description: `一次选择本轮的一位或多位发言角色。${writeReply}`,
    parameters: {
      names: { type: 'array', required: true, items: { type: 'string', enum: names },
        description: usesCover ? '卡片封面发言名。' : '从登场角色中选出本轮发言角色。' },
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
      presentationMeta: (_args, { names, frames }) => ({
        source: ROLEPLAY_REPLY_SOURCE,
        speakers: names.map(name => ({ kind: 'speech', speakerName: name, ...(usesCover ? {} : { speakerId: speakers.get(name) }) })),
        ...(frames ? { frames } : {})
      }),
      render: () => [{ type: 'text', text: writeReply }]
    },
    async execute({ names, frames }, execution) {
      if (execution.agent !== agent || execution.parent) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition,
        '角色回复必须从当前对话直接调用。', { what: '直接调用角色回复工具' })
      if (!names.length) throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid,
        '请在 names 中填入本轮发言的一位或多位角色。', { field: 'names' })
      if (frames?.length) {
        if (readOutput()?.framesSubmitted || frames.some((frame, index) => frame.id !== index + 1 || !frame.prompt.trim()
          || (frame.seed !== undefined && (frame.seed < 0 || frame.seed > 4294967295))
          || (frame.after_paragraph !== undefined && frame.after_paragraph < 0))) {
          throw productFailure(ELECKOI_FAILURE_CODES.inputInvalid, '本轮分镜集中提交一次，需从 1 连续编号并提供画面提示词。', { field: 'frames' })
        }
        const illustrator = agent.ctx.get('eleckoiAutoIllustration')
        if (!illustrator) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition,
          '自动配图插件未启用。没有启用时省略 frames。', { what: '自动配图' })
        illustrator.validateReplyFrames(agent.id, frames)
      }
      return { names: [...new Set(names)], ...(frames?.length ? { frames } : {}) }
    }
  })
}
