import { z } from 'zod'
import { projectionCacheDomainSpec } from '@deepseek-ai/dsh-session-projection-cache'
import { isDelegatedRoleplayReply, roleplayReplyBlocks } from '@eleckoi/dsh-product-api'
import { ROLEPLAY_OUTPUT_EVENT, ROLEPLAY_REPLY_TOOL, roleplayReplyResult, roleplayReplyPreview as toPreview } from './roleplay-reply-tool.mjs'

const schema = z.string().max(480)
const previewStateSchema = z.object({
  preview: schema,
  turn: z.number().int().nonnegative(),
  reply: schema,
  roleplay: z.boolean().optional(),
  selection: z.object({ step: z.number(), names: z.array(z.string()) }).optional(),
})
const activitySchema = z.number().int().nonnegative()
const replyBody = blocks => Array.isArray(blocks)
  ? blocks.map(block => typeof block?.text === 'string' ? block.text.trim() : '').filter(Boolean).join('\n\n')
  : ''

/** A single replayable timestamp covers new input and regeneration without copying message history. */
export const conversationActivityProjection = {
  key: 'eleckoiConversationActivity',
  stateVersion: 1,
  stateSchema: activitySchema,
  init: () => 0,
  apply(state, event) {
    return event.type === 'turn/start'
      || (event.type === 'user/message' && event.data.source?.kind === 'user')
      ? Math.max(state, event.time) : state
  },
  wire: { viewSchema: activitySchema, view: state => state }
}

/** The official projection cache owns the bounded catalog preview across restarts and rewinds. */
export const conversationPreviewProjection = {
  key: 'eleckoiConversationPreview',
  stateVersion: 5,
  stateSchema: previewStateSchema,
  init: () => ({ preview: '', turn: 0, reply: '' }),
  apply(state, event) {
    if (event.type === 'turn/start') return { preview: state.preview, turn: event.data.turn, reply: '' }
    if (event.type === 'turn/end' && event.data.turn === state.turn) return { preview: state.preview, turn: 0, reply: '' }
    if (isDelegatedRoleplayReply(event)) return { ...state, preview: toPreview(event.data.text) }
    if (state.turn && event.data?.turn === state.turn) {
      const selection = roleplayReplyResult(event)
      if (selection) {
        if (typeof selection.preview === 'string') {
          const reply = toPreview([state.reply, selection.preview].filter(Boolean).join('\n\n'))
          return { ...state, reply, preview: reply }
        }
        // RETIRE WHEN: the previous next-step reply format is retired from Session display and import.
        // Remove the selection state and assistant text branch with its old-format fixture.
        const step = event.data.step + 1
        const names = state.selection?.step === step ? [] : selection.speakers.map(speaker => speaker.speakerName)
        return { ...state, selection: { step, names } }
      }
      if (event.type === 'assistant/message' && state.selection?.step === event.data.step) {
        const raw = event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
        const text = event.data.interrupted ? ''
          : replyBody(roleplayReplyBlocks(raw, state.selection.names.map(speakerName => ({ speakerName })), ''))
        const reply = toPreview([state.reply, text].filter(Boolean).join('\n\n'))
        return { ...state, selection: undefined, reply, preview: reply || state.preview }
      }
      if (event.type === 'assistant/message' && event.data.message.content.some(block => block.type === 'tool-call' && block.name === ROLEPLAY_REPLY_TOOL)) {
        return state
      }
      if (event.type === ROLEPLAY_OUTPUT_EVENT) {
        if (event.data.replySeq === undefined) return { ...state, roleplay: true }
        if (event.data.toolBacked && (Array.isArray(event.data.editedBlocks) || typeof event.data.editedText === 'string')) {
          const reply = toPreview(Array.isArray(event.data.editedBlocks) ? replyBody(event.data.editedBlocks) : event.data.editedText)
          return { ...state, reply, preview: reply }
        }
      }
    }
    let message
    if (event.type === 'user/message' && event.data.source?.kind === 'user') message = event.data
    if (event.type === 'assistant/message' && event.surfaceOp === 'append'
      && !((state.roleplay || state.reply) && event.data.turn === state.turn)) message = event.data.message
    if (!message) return state
    const text = toPreview(message.content.filter(block => block.type === 'text').map(block => block.text).join(''))
    return text ? { ...state, preview: text } : state
  },
  wire: { viewSchema: schema, view: state => state.preview }
}

/**
 * RETIRE WHEN: 受支持的升级与备份恢复样本均无 v5 之前的会话摘要缓存。
 * Host 启动时从原日志重算旧摘要，替换带工具收尾或角色名的缓存值，不改 Session 或 SQLite。
 * 届时删除本函数、启动调用和专用缓存重算测试。
 */
export async function rebuildConversationPreviewCache(ctx, signal) {
  const key = conversationPreviewProjection.key
  const version = conversationPreviewProjection.stateVersion
  const outdatedRow = row => row && row.ver < version
  const table = ctx.storageDomain.get(projectionCacheDomainSpec.name).table('sessions')
  const outdated = [...table.entries()].filter(([, record]) => outdatedRow(record.rows[key]))
  if (!outdated.length) return
  const sessionIds = new Set(ctx.eleckoiProductData.readConversationCatalog().map(record => record.runtimeSessionId))
  let changed = false
  for (const [id, record] of outdated) {
    if (signal.aborted) break
    if (!sessionIds.has(id)) continue
    let reader
    try {
      reader = await ctx.sessionPersistence.open(id, 'read', { signal })
      const { header, inheritedEventCount } = reader
      const matches = ({ identity }) => identity.formatVersion === header.version
        && identity.createdAt === header.createdAt && identity.cwd === header.cwd
        && identity.isSeeded === header.isSeeded && (identity.inheritedEventCount ?? 0) === inheritedEventCount
      if (!matches(record)) continue
      const { events } = await reader.read(0, undefined, { signal })
      if (signal.aborted) break
      const { checkpoint } = ctx.sessionProjections.restore(record.rows, events, 0, header, inheritedEventCount)
      const stored = await table.update(id, current => {
        if (signal.aborted || !matches(current) || !outdatedRow(current.rows[key]) || current.rows[key].seq > checkpoint[key].seq) return current
        return { ...current, rows: { ...current.rows, [key]: checkpoint[key] } }
      })
      changed ||= matches(stored) && stored.rows[key]?.ver === version
    } catch (error) {
      if (!signal.aborted) ctx.logger.warn(`更新角色对话摘要缓存失败 (${id})：${String(error)}`)
    } finally {
      await reader?.close()
    }
  }
  if (changed && !signal.aborted) ctx.eleckoiConversationChanges.publish({ kind: 'snapshot' })
}
