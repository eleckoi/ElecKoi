import { defineTool } from '@deepseek-ai/dsh-tools'
import { ELECKOI_FAILURE_CODES, productFailure, ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_SOURCE, roleplayReplyText } from '@eleckoi/dsh-product-api'

export { ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_SOURCE }

export const ROLEPLAY_REPLY_TOOL = 'eleckoi_roleplay_reply'
export const ROLEPLAY_REPLY_GROUP_ID = 'builtin:roleplay-reply'

export const roleplayReplyEnabled = snapshot => !snapshot?.disabledToolGroupIds?.includes(ROLEPLAY_REPLY_GROUP_ID)

export function roleplayReplyResult(event) {
  if (event.type !== 'tool/result' || event.data.message.isError) return undefined
  const meta = event.data.meta
  return meta?.source === ROLEPLAY_REPLY_SOURCE && meta.speaker ? meta : undefined
}

/** A successful selection owns native text in the next assistant step. */
export function installRoleplayReply(agent, isEnabled = () => true, readConversation = () => ({}), readIllustration = () => undefined) {
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
      output.selections.push(result.speaker.speakerName)
      if (result.frames) output.framesSubmitted = true
    }
    if (event.type === 'assistant/message') {
      const [speaker] = output.selections
      if (output.selections.length === 1 && event.data.step === output.latestAssistant?.data.step + 1 && !event.data.interrupted) {
        const text = event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
        if (roleplayReplyText(text, speaker).trim()) output.replySeq = event.seq
      }
      output.selections = []
      output.latestAssistant = event
    }
    if (event.type === 'turn/end') output = undefined
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
  const roster = usesCover
    ? `卡片封面发言名是 ${JSON.stringify(cardName)}。`
    : `本卡登记了 ${castNames.length} 位登场角色 ${JSON.stringify(castNames)}。名单中的每一项各是一位角色。`
  const continueReply = `本轮还有角色发言时，写完当前角色正文后，在同一条消息末尾调用 ${ROLEPLAY_REPLY_TOOL} 选择接下来发言的角色。`
  return defineTool({
    name: ROLEPLAY_REPLY_TOOL,
    description: `${roster}\n选择发言角色。调用后，下一步必须汇报出该角色输出的扮演内容，直接发给玩家。格式为 <角色名>对应的角色扮演内容</角色名>，标签使用选中的角色名。单人回复调用一次。多人可在同一轮发言。${continueReply}`,
    parameters: {
      name: { type: 'string', required: true, enum: names, description: usesCover ? '卡片封面名称。' : '本次正文的发言角色。' },
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
      presentationMeta: (_args, { name, frames }) => ({
        source: ROLEPLAY_REPLY_SOURCE,
        speaker: { kind: 'speech', speakerName: name, ...(usesCover ? {} : { speakerId: speakers.get(name) }) },
        ...(frames ? { frames } : {})
      }),
      render: (_args, { name }) => [{ type: 'text', text: `下一步必须把 ${name} 的扮演正文直接发给玩家，格式为 <${name}>对应的角色扮演内容</${name}>。${names.length > 1 ? continueReply : ''}` }]
    },
    async execute({ name, frames }, execution) {
      if (execution.agent !== agent || execution.parent) throw productFailure(ELECKOI_FAILURE_CODES.statePrecondition,
        '角色回复必须从当前对话直接调用。', { what: '直接调用角色回复工具' })
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
      return { name, ...(frames?.length ? { frames } : {}) }
    }
  })
}
