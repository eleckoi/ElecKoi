import { randomUUID } from 'node:crypto'
import type { AgentConversationHistoryItem } from '@shared/contracts/agent/runtime'
import type { AgentProcessItem, ChatMessage, ChatUserImageAttachment, MessageRole, MessageStatus } from '@shared/contracts/entities/chat'
import { type ElecKoiDatabase, SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import {
  readCurrentConversationVariableState,
  writeCurrentConversationVariableState
} from './ConversationVariableStateStore'

const chunkCharacters = 64 * 1024
interface LedgerMessage { id: string; ownerId: string; ownerType: 'turn' | 'response'; turnId: string; speakerId: string; sequence: number; responseIndex: number; role: MessageRole; status: string; createdAt: string; variableStateJson: string }
interface Speaker { id: string; name: string; avatar: string; kind: string }
const toStoredStatus = (status: MessageStatus) => status === 'complete' ? 'completed' : status === 'streaming' ? 'pending' : status
const toMessageStatus = (status: string): MessageStatus => status === 'completed' ? 'complete' : status === 'pending' ? 'streaming' : status === 'cancelled' ? 'cancelled' : 'error'

export class MessageRepository {
  constructor(private readonly store: SqliteDatabase) {}

  page(conversationId: string, beforeSequence?: number, limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('每页轮次数必须在 1 到 200 之间。')
    if (beforeSequence !== undefined && (!Number.isSafeInteger(beforeSequence) || beforeSequence < 0)) throw new Error('历史游标必须是非负整数。')
    const path = this.store.native.prepare(`SELECT p.sequence FROM agent_branch_turns p
      JOIN agent_conversations c ON c.activeBranchId = p.branchId JOIN agent_branches b ON b.id=p.branchId AND b.conversationId=c.id
      WHERE c.id = ? AND p.sequence < ?
      ORDER BY p.sequence DESC LIMIT ?`).all(conversationId, beforeSequence ?? Number.MAX_SAFE_INTEGER, limit + 1) as { sequence: number }[]
    const hasMore = path.length > limit
    const selected = path.slice(0, limit)
    const firstSequence = selected.at(-1)?.sequence
    if (firstSequence === undefined) return { messages: [] as ChatMessage[], hasMore: false, beforeSequence: null }
    const rows = this.store.native.prepare(`
      SELECT CASE WHEN t.kind='opening' THEN 'opening' ELSE t.id END AS id, t.id AS ownerId, 'turn' AS ownerType, t.id AS turnId, t.speakerId, p.sequence, -1 AS responseIndex,
        CASE WHEN t.kind = 'user' THEN 'user' ELSE 'assistant' END AS role, 'completed' AS status, t.createdAt, t.variableStateJson
      FROM agent_conversations c JOIN agent_branch_turns p ON p.branchId = c.activeBranchId JOIN agent_turns t ON t.id = p.turnId AND t.conversationId = c.id
      WHERE c.id = ? AND p.sequence >= ? AND p.sequence < ?
      UNION ALL
      SELECT r.id, r.id, 'response', r.turnId, r.speakerId, p.sequence, r.responseIndex, 'assistant', r.status, r.createdAt, r.variableStateJson
      FROM agent_conversations c JOIN agent_branch_turns p ON p.branchId = c.activeBranchId JOIN agent_responses r ON r.turnId = p.turnId AND r.conversationId = c.id
      WHERE c.id = ? AND p.sequence >= ? AND p.sequence < ? ORDER BY sequence, responseIndex
    `).all(conversationId, firstSequence, beforeSequence ?? Number.MAX_SAFE_INTEGER, conversationId, firstSequence, beforeSequence ?? Number.MAX_SAFE_INTEGER) as LedgerMessage[]
    return { messages: rows.map((row) => this.project(conversationId, row)), hasMore, beforeSequence: firstSequence }
  }

  list(conversationId: string): ChatMessage[] {
    // Current UI still consumes a complete conversation. The bounded page API is
    // available independently; switching the UI to it is a separate task.
    const result: ChatMessage[] = []
    let cursor: number | undefined
    do {
      const page = this.page(conversationId, cursor, 200)
      result.unshift(...page.messages)
      if (!page.hasMore || page.beforeSequence === null) return result
      cursor = page.beforeSequence
    } while (true)
  }

  create(
    conversationId: string,
    role: MessageRole,
    content: string,
    status: MessageStatus,
    _db?: ElecKoiDatabase,
    runtimeThreadId = '',
    inputImageAttachments: ChatUserImageAttachment[] = []
  ): ChatMessage {
    return this.store.withWriteTx(() => {
      const conversation = this.store.native.prepare('SELECT activeBranchId FROM agent_conversations WHERE id = ?').get(conversationId) as { activeBranchId: string } | undefined
      if (!conversation) throw new Error('找不到会话账本。')
      if (role === 'assistant') {
        const turn = this.store.native.prepare('SELECT turnId FROM agent_branch_turns WHERE branchId = ? ORDER BY sequence DESC LIMIT 1').get(conversation.activeBranchId) as { turnId: string } | undefined
        if (!turn) throw new Error('回复必须属于已有轮次。')
        const session = this.store.native.prepare('SELECT characterId, characterName, characterAvatar FROM chat_sessions WHERE id = ?').get(conversationId) as { characterId: string; characterName: string; characterAvatar: string }
        return this.createResponse(conversationId, turn.turnId, content, status, { id: session.characterId || 'assistant', name: session.characterName || 'ElecKoi', avatar: session.characterAvatar, kind: session.characterId ? 'card_character' : 'assistant' }, runtimeThreadId)
      }
      const id = randomUUID()
      const now = new Date().toISOString()
      const profile = this.store.native.prepare("SELECT userName, userAvatar FROM user_profile WHERE id = 'default'").get() as { userName: string; userAvatar: string } | undefined
      const speakerId = this.ensureSpeaker(conversationId, { id: 'user', name: profile?.userName ?? '你', avatar: profile?.userAvatar ?? '', kind: 'user' })
      const sequence = (this.store.native.prepare('SELECT COALESCE(MAX(sequence), -1) + 1 AS next FROM agent_branch_turns WHERE branchId = ?').get(conversation.activeBranchId) as { next: number }).next
      const variableStateJson = readCurrentConversationVariableState(conversationId, this.store.db)
      this.store.native.prepare(`INSERT INTO agent_turns(id,conversationId,speakerId,kind,createdAt,variableStateJson) VALUES (?,?,?,'user',?,?)`).run(id, conversationId, speakerId, now, variableStateJson)
      this.store.native.prepare('INSERT INTO agent_branch_turns(branchId,sequence,turnId) VALUES (?,?,?)').run(conversation.activeBranchId, sequence, id)
      this.writeContent(conversationId, 'turn', id, 'user_text', content)
      this.writeInputImages(conversationId, id, inputImageAttachments)
      this.publish(conversationId, 1, 1)
      return {
        id, conversationId, turnId: id, speakerId, sequence, role, content,
        variableStateJson, status: 'complete', createdAt: now,
        ...(inputImageAttachments.length ? { inputImageAttachments } : {})
      }
    })
  }

  createResponse(conversationId: string, turnId: string, content: string, status: MessageStatus, speaker: Speaker, runtimeThreadId = ''): ChatMessage {
    return this.store.withWriteTx(() => {
      const turn = this.store.native.prepare(`SELECT t.id,p.sequence FROM agent_turns t JOIN agent_branch_turns p ON p.turnId=t.id
        JOIN agent_conversations c ON c.activeBranchId=p.branchId WHERE t.id=? AND t.conversationId=? AND c.id=?`).get(turnId, conversationId, conversationId) as { id: string; sequence: number } | undefined
      if (!turn) throw new Error('回复轮次必须属于当前会话的活动分支。')
      const id = randomUUID()
      const speakerId = this.ensureSpeaker(conversationId, speaker)
      const now = new Date().toISOString()
      const responseIndex = (this.store.native.prepare('SELECT COALESCE(MAX(responseIndex),-1)+1 AS next FROM agent_responses WHERE turnId=?').get(turnId) as { next: number }).next
      const variableStateJson = readCurrentConversationVariableState(conversationId, this.store.db)
      this.store.native.prepare(`INSERT INTO agent_responses(id,conversationId,turnId,responseIndex,speakerId,status,createdAt,variableStateJson,runtimeThreadId)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(id, conversationId, turnId, responseIndex, speakerId, toStoredStatus(status), now, variableStateJson, runtimeThreadId)
      this.writeContent(conversationId, 'response', id, 'assistant_text', content)
      this.publish(conversationId, 1, 0)
      return { id, conversationId, turnId, speakerId, sequence: turn.sequence, responseIndex, role: 'assistant', content, variableStateJson, status, createdAt: now }
    })
  }

  appendCheckpoint(messageId: string, delta: string): void {
    if (delta.length === 0) return
    this.store.withWriteTx(() => {
      const response = this.response(messageId)
      if (response.status !== 'pending') return
      if (this.appendContent(response.conversationId, 'response', response.id, 'assistant_text', delta)) {
        this.publish(response.conversationId)
      }
    })
  }

  requirePendingResponse(conversationId: string, messageId: string): string {
    const response = this.store.native.prepare(
      "SELECT id FROM agent_responses WHERE conversationId=? AND id=? AND status='pending'"
    ).get(conversationId, messageId) as { id: string } | undefined
    if (!response) throw new Error('执行记录必须关联本场回复。')
    return response.id
  }

  listInputImageReferences(): Array<{ conversationId: string; attachmentId: string }> {
    const rows = this.store.native.prepare(
      "SELECT conversationId,payloadJson FROM agent_content_parts WHERE kind='user_image'"
    ).all() as { conversationId: string; payloadJson: string }[]
    return rows.flatMap((row) => {
      const image = parseInputImage(row.payloadJson)
      return image ? [{ conversationId: row.conversationId, attachmentId: image.attachmentId }] : []
    })
  }

  get(conversationId: string, messageId: string): ChatMessage {
    const row = this.store.native.prepare(`
      SELECT CASE WHEN t.kind='opening' THEN 'opening' ELSE t.id END AS id, t.id AS ownerId, 'turn' AS ownerType, t.id AS turnId, t.speakerId,
        p.sequence, -1 AS responseIndex, CASE WHEN t.kind='user' THEN 'user' ELSE 'assistant' END AS role,
        'completed' AS status, t.createdAt, t.variableStateJson
      FROM agent_conversations c JOIN agent_branch_turns p ON p.branchId=c.activeBranchId
      JOIN agent_turns t ON t.id=p.turnId AND t.conversationId=c.id
      WHERE c.id=? AND (t.id=? OR (t.kind='opening' AND ?='opening'))
      UNION ALL
      SELECT r.id, r.id, 'response', r.turnId, r.speakerId, p.sequence, r.responseIndex,
        'assistant', r.status, r.createdAt, r.variableStateJson
      FROM agent_conversations c JOIN agent_branch_turns p ON p.branchId=c.activeBranchId
      JOIN agent_responses r ON r.turnId=p.turnId AND r.conversationId=c.id
      WHERE c.id=? AND r.id=?
      ORDER BY responseIndex DESC LIMIT 1
    `).get(conversationId, messageId, messageId, conversationId, messageId) as LedgerMessage | undefined
    if (!row) throw new Error('找不到对应的聊天消息。')
    return this.project(conversationId, row)
  }

  findInputImage(conversationId: string, attachmentId: string): ChatUserImageAttachment {
    const rows = this.store.native.prepare(`SELECT payloadJson FROM agent_content_parts
      WHERE conversationId=? AND ownerType='turn' AND kind='user_image' ORDER BY ownerId,partIndex`)
      .all(conversationId) as { payloadJson: string }[]
    for (const row of rows) {
      const image = parseInputImage(row.payloadJson)
      if (image?.attachmentId === attachmentId) return image
    }
    throw new Error('找不到这张聊天图片。')
  }

  /** Product history before the latest user input, used to seed a fresh DSH session. */
  runtimeHistory(conversationId: string): AgentConversationHistoryItem[] {
    const messages = this.list(conversationId)
    const latestUserIndex = [...messages].map((message) => message.role).lastIndexOf('user')
    return messages
      .filter((message, index) => index !== latestUserIndex && message.content.trim().length > 0 && message.status !== 'streaming')
      .map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.speakerName ? { speakerName: message.speakerName } : {})
      }))
  }

  latestCompletedRuntimeThreadId(conversationId: string): string | undefined {
    const row = this.store.native.prepare(`SELECT r.runtimeThreadId
      FROM agent_responses r JOIN agent_branch_turns p ON p.turnId=r.turnId
      JOIN agent_conversations c ON c.activeBranchId=p.branchId
      WHERE r.conversationId=? AND c.id=? AND r.status='completed' AND r.runtimeThreadId<>''
      ORDER BY p.sequence DESC, r.responseIndex DESC LIMIT 1`).get(conversationId, conversationId) as { runtimeThreadId: string } | undefined
    return row?.runtimeThreadId || undefined
  }

  latestRuntimeThreadId(conversationId: string): string | undefined {
    const row = this.store.native.prepare(`SELECT r.runtimeThreadId
      FROM agent_responses r JOIN agent_branch_turns p ON p.turnId=r.turnId
      JOIN agent_conversations c ON c.activeBranchId=p.branchId
      WHERE r.conversationId=? AND c.id=? AND r.runtimeThreadId<>''
      ORDER BY p.sequence DESC, r.responseIndex DESC LIMIT 1`).get(conversationId, conversationId) as { runtimeThreadId: string } | undefined
    return row?.runtimeThreadId || undefined
  }

  /**
   * Deletes one public message and every message after it on the active branch.
   * This deliberately follows the conversation's causal order: retaining later
   * replies after removing their input would leave Agent state and variables invalid.
   */
  deleteFrom(conversationId: string, targetMessageId: string): {
    deletedMessageCount: number
    remainingMessageCount: number
    deletedAttachmentIds: string[]
    obsoleteRuntimeThreadIds: string[]
    deletedResponseIds: string[]
    deletedMessageIds: string[]
    rollbackSettingLibraryStateJson?: string | undefined
  } {
    return this.store.withWriteTx(() => {
      const branch = this.store.native.prepare(
        'SELECT activeBranchId AS branchId FROM agent_conversations WHERE id=?'
      ).get(conversationId) as { branchId: string } | undefined
      if (!branch) throw new Error('找不到当前对话分支。')

      const target = this.store.native.prepare(`
        SELECT t.id AS ownerId, 'turn' AS ownerType, p.sequence, -1 AS responseIndex
        FROM agent_branch_turns p
        JOIN agent_turns t ON t.id=p.turnId AND t.conversationId=?
        WHERE p.branchId=? AND (t.id=? OR (t.kind='opening' AND ?='opening'))
        UNION ALL
        SELECT r.id AS ownerId, 'response' AS ownerType, p.sequence, r.responseIndex
        FROM agent_branch_turns p
        JOIN agent_responses r ON r.turnId=p.turnId AND r.conversationId=?
        WHERE p.branchId=? AND r.id=?
        ORDER BY responseIndex DESC LIMIT 1
      `).get(
        conversationId, branch.branchId, targetMessageId, targetMessageId,
        conversationId, branch.branchId, targetMessageId
      ) as { ownerId: string; ownerType: 'turn' | 'response'; sequence: number; responseIndex: number } | undefined
      if (!target) throw new Error('找不到要删除的聊天消息。')

      const targetTurn = this.store.native.prepare(`SELECT t.id,t.kind,t.variableStateJson
        FROM agent_turns t JOIN agent_branch_turns p ON p.turnId=t.id
        WHERE t.conversationId=? AND p.branchId=? AND p.sequence=?`)
        .get(conversationId, branch.branchId, target.sequence) as {
          id: string
          kind: string
          variableStateJson: string
        } | undefined
      if (!targetTurn) throw new Error('找不到要删除消息所属的对话轮次。')
      const initialState = this.store.native.prepare(`SELECT stateJson FROM chat_session_variable_states
        WHERE sessionId=? AND kind='initial'`).get(conversationId) as { stateJson: string } | undefined
      const previousResponse = target.ownerType === 'response'
        ? this.store.native.prepare(`SELECT id,variableStateJson FROM agent_responses
            WHERE conversationId=? AND turnId=? AND responseIndex<?
            ORDER BY responseIndex DESC LIMIT 1`)
          .get(conversationId, targetTurn.id, target.responseIndex) as { id: string; variableStateJson: string } | undefined
        : undefined
      const rollbackVariableStateJson = targetTurn.kind === 'opening'
        ? initialState?.stateJson || '{}'
        : previousResponse?.variableStateJson || targetTurn.variableStateJson || initialState?.stateJson || '{}'
      const rollbackSettingLibraryOwner = targetTurn.kind === 'opening'
        ? undefined
        : previousResponse
          ? { ownerType: 'response', ownerId: previousResponse.id }
          : { ownerType: 'turn', ownerId: targetTurn.id }
      const rollbackSettingLibraryStateJson = rollbackSettingLibraryOwner
        ? (this.store.native.prepare(`SELECT payloadJson FROM agent_content_parts
            WHERE conversationId=? AND ownerType=? AND ownerId=? AND kind='setting_library_state'
            ORDER BY partIndex DESC LIMIT 1`)
          .get(conversationId, rollbackSettingLibraryOwner.ownerType, rollbackSettingLibraryOwner.ownerId) as { payloadJson: string } | undefined)?.payloadJson
        : '[]'

      const turns = this.store.native.prepare(`
        SELECT p.turnId,t.kind,p.sequence
        FROM agent_branch_turns p JOIN agent_turns t ON t.id=p.turnId
        WHERE p.branchId=? AND p.sequence>=? ORDER BY p.sequence
      `).all(branch.branchId, target.sequence) as Array<{ turnId: string; kind: string; sequence: number }>
      const turnIds = turns
        .filter((row) => target.ownerType === 'turn' || row.sequence > target.sequence)
        .map((row) => row.turnId)
      const responseRows = this.store.native.prepare(`
        SELECT r.id,r.turnId,r.responseIndex,r.runtimeThreadId,p.sequence
        FROM agent_responses r JOIN agent_branch_turns p ON p.turnId=r.turnId
        WHERE r.conversationId=? AND p.branchId=? AND (
          p.sequence>? OR (p.sequence=? AND ?='response' AND r.responseIndex>=?) OR
          (p.sequence=? AND ?='turn')
        ) ORDER BY p.sequence,r.responseIndex
      `).all(
        conversationId, branch.branchId,
        target.sequence, target.sequence, target.ownerType, target.responseIndex,
        target.sequence, target.ownerType
      ) as Array<{ id: string; turnId: string; responseIndex: number; runtimeThreadId: string; sequence: number }>
      const responseIds = responseRows.map((row) => row.id)
      const publicTurnIds = turns
        .filter((row) => turnIds.includes(row.turnId))
        .map((row) => row.kind === 'opening' ? 'opening' : row.turnId)
      const deletedPublicMessageIds = [...publicTurnIds, ...responseIds]
      if (deletedPublicMessageIds.length === 0) throw new Error('没有可删除的聊天消息。')

      const deletedOwners = [
        ...turnIds.map((id) => ({ ownerType: 'turn', ownerId: id })),
        ...responseIds.map((id) => ({ ownerType: 'response', ownerId: id }))
      ]
      const deletedAttachmentIds = deletedOwners.flatMap(({ ownerType, ownerId }) => (
        this.store.native.prepare(`SELECT payloadJson FROM agent_content_parts
          WHERE conversationId=? AND ownerType=? AND ownerId=? AND kind='user_image'`)
          .all(conversationId, ownerType, ownerId) as { payloadJson: string }[]
      ).flatMap((row) => {
        const image = parseInputImage(row.payloadJson)
        return image ? [image.attachmentId] : []
      }))
      const obsoleteRuntimeThreadIds = (this.store.native.prepare(`
        SELECT DISTINCT runtimeThreadId FROM agent_responses
        WHERE conversationId=? AND runtimeThreadId<>'' ORDER BY runtimeThreadId
      `).all(conversationId) as { runtimeThreadId: string }[]).map((row) => row.runtimeThreadId)

      for (const id of deletedPublicMessageIds) {
        this.store.native.prepare('DELETE FROM roleplay_rich_heights WHERE sessionId=? AND messageId=?')
          .run(conversationId, id)
      }
      for (const { ownerType, ownerId } of deletedOwners) {
        this.store.native.prepare('DELETE FROM agent_content_parts WHERE conversationId=? AND ownerType=? AND ownerId=?')
          .run(conversationId, ownerType, ownerId)
      }
      for (const id of responseIds) this.store.native.prepare('DELETE FROM agent_responses WHERE id=? AND conversationId=?').run(id, conversationId)
      for (const id of turnIds) this.store.native.prepare('DELETE FROM agent_branch_turns WHERE branchId=? AND turnId=?').run(branch.branchId, id)
      for (const id of turnIds) this.store.native.prepare('DELETE FROM agent_turns WHERE id=? AND conversationId=?').run(id, conversationId)

      // A DSH session contains the full prior conversation. Even if its latest
      // response was retained, it must not be resumed after history is truncated.
      this.store.native.prepare("UPDATE agent_responses SET runtimeThreadId='' WHERE conversationId=?")
        .run(conversationId)
      this.store.native.prepare(`DELETE FROM conversation_speakers WHERE conversationId=?
        AND id NOT IN (SELECT speakerId FROM agent_turns WHERE conversationId=?)
        AND id NOT IN (SELECT speakerId FROM agent_responses WHERE conversationId=?)`)
        .run(conversationId, conversationId, conversationId)

      const remainingMessages = this.list(conversationId)
      const remainingUserCount = remainingMessages.filter((item) => item.role === 'user').length
      const latest = remainingMessages.at(-1)
      writeCurrentConversationVariableState(
        conversationId,
        rollbackVariableStateJson,
        this.store.db
      )
      this.store.native.prepare(`UPDATE chat_sessions SET
        historySummary=?,historyMessageCount=?,historyUserMessageCount=?,updatedAt=? WHERE id=?`)
        .run(
          Array.from(latest?.content ?? '').slice(0, 240).join(''),
          remainingMessages.length,
          remainingUserCount,
          new Date().toISOString(),
          conversationId
        )

      return {
        deletedMessageCount: deletedPublicMessageIds.length,
        remainingMessageCount: remainingMessages.length,
        deletedAttachmentIds: [...new Set(deletedAttachmentIds)],
        obsoleteRuntimeThreadIds,
        deletedResponseIds: responseIds,
        deletedMessageIds: deletedPublicMessageIds,
        rollbackSettingLibraryStateJson
      }
    })
  }

  writeSettingLibraryStateSnapshot(conversationId: string, messageId: string, stateJson: string): void {
    this.store.withWriteTx(() => {
      const owner = this.store.native.prepare(`
        SELECT t.id AS ownerId,'turn' AS ownerType
        FROM agent_turns t WHERE t.conversationId=? AND (t.id=? OR (t.kind='opening' AND ?='opening'))
        UNION ALL
        SELECT r.id AS ownerId,'response' AS ownerType
        FROM agent_responses r WHERE r.conversationId=? AND r.id=?
        LIMIT 1
      `).get(conversationId, messageId, messageId, conversationId, messageId) as {
        ownerId: string
        ownerType: 'turn' | 'response'
      } | undefined
      if (!owner) throw new Error('找不到设定状态快照所属的消息。')
      let value: unknown
      try { value = JSON.parse(stateJson) } catch (error) {
        throw new Error('设定状态快照不是合法 JSON。', { cause: error })
      }
      if (!Array.isArray(value)) throw new Error('设定状态快照格式不正确。')
      this.store.native.prepare(`DELETE FROM agent_content_parts
        WHERE conversationId=? AND ownerType=? AND ownerId=? AND kind='setting_library_state'`)
        .run(conversationId, owner.ownerType, owner.ownerId)
      const partIndex = (this.store.native.prepare(`SELECT COALESCE(MAX(partIndex),0)+1 AS next
        FROM agent_content_parts WHERE ownerType=? AND ownerId=?`)
        .get(owner.ownerType, owner.ownerId) as { next: number }).next
      this.store.native.prepare(`INSERT INTO agent_content_parts(
        conversationId,ownerType,ownerId,partIndex,kind,text,payloadJson,chunkIndex
      ) VALUES (?,?,?,?,'setting_library_state','',?,0)`)
        .run(conversationId, owner.ownerType, owner.ownerId, partIndex, JSON.stringify(value))
    })
  }

  /** Truncate the active branch at a user turn for Android-style edit/regenerate. */
  prepareRegeneration(conversationId: string, targetMessageId: string, replacement?: string): {
    turnId: string
    text: string
    inputImages: ChatUserImageAttachment[]
    runtimeThreadId: string
    obsoleteRuntimeThreadIds: string[]
    retainedTurns: number
  } {
    return this.store.withWriteTx(() => {
      const target = this.store.native.prepare(`SELECT r.turnId AS responseTurnId, t.id AS turnId, p.sequence, t.kind
        FROM agent_conversations c JOIN agent_branch_turns p ON p.branchId=c.activeBranchId
        JOIN agent_turns t ON t.id=p.turnId
        LEFT JOIN agent_responses r ON r.id=? AND r.turnId=t.id
        WHERE c.id=? AND (t.id=? OR r.id=?)
        ORDER BY p.sequence DESC LIMIT 1`).get(targetMessageId, conversationId, targetMessageId, targetMessageId) as {
          responseTurnId?: string; turnId: string; sequence: number; kind: string
        } | undefined
      if (!target || target.kind === 'opening') throw new Error('只能从用户输入或对应的 AI 回复重新生成。')
      const turnId = target.responseTurnId || target.turnId
      const user = this.store.native.prepare('SELECT id FROM agent_turns WHERE id=?').get(turnId) as { id: string } | undefined
      if (!user) throw new Error('找不到需要重新生成的用户输入。')
      let text = this.store.native.prepare("SELECT COALESCE(group_concat(text, ''), '') AS content FROM agent_content_parts WHERE conversationId=? AND ownerType='turn' AND ownerId=? AND kind='user_text' ORDER BY chunkIndex").get(conversationId, turnId) as { content: string }
      const inputImages = (this.store.native.prepare("SELECT payloadJson FROM agent_content_parts WHERE conversationId=? AND ownerType='turn' AND ownerId=? AND kind='user_image' ORDER BY partIndex")
        .all(conversationId, turnId) as { payloadJson: string }[])
        .flatMap((row) => {
          const image = parseInputImage(row.payloadJson)
          return image ? [image] : []
        })
      const nextText = replacement === undefined ? text.content : replacement.trim()
      if (!nextText && inputImages.length === 0) throw new Error('用户输入不能为空。')

      const branch = this.store.native.prepare('SELECT activeBranchId AS branchId FROM agent_conversations WHERE id=?').get(conversationId) as { branchId: string } | undefined
      if (!branch) throw new Error('找不到当前对话分支。')
      const obsoleteRuntimeThreadIds = (this.store.native.prepare(`SELECT DISTINCT r.runtimeThreadId
        FROM agent_responses r JOIN agent_branch_turns p ON p.turnId=r.turnId
        WHERE p.branchId=? AND r.runtimeThreadId<>'' ORDER BY r.runtimeThreadId`).all(branch.branchId) as { runtimeThreadId: string }[])
        .map((row) => row.runtimeThreadId)
      const tail = this.store.native.prepare('SELECT turnId FROM agent_branch_turns WHERE branchId=? AND sequence>=?').all(branch.branchId, target.sequence) as { turnId: string }[]
      const tailIds = [...new Set(tail.map((row) => row.turnId))]
      const responseIds = tailIds.length
        ? this.store.native.prepare(`SELECT id FROM agent_responses WHERE conversationId=? AND turnId IN (${tailIds.map(() => '?').join(',')})`).all(conversationId, ...tailIds) as { id: string }[]
        : []
      this.store.native.prepare('DELETE FROM agent_branch_turns WHERE branchId=? AND sequence>?').run(branch.branchId, target.sequence)
      for (const row of responseIds) this.store.native.prepare("DELETE FROM agent_content_parts WHERE conversationId=? AND ownerType='response' AND ownerId=?").run(conversationId, row.id)
      for (const row of tailIds) this.store.native.prepare("DELETE FROM agent_content_parts WHERE conversationId=? AND ownerType='turn' AND ownerId=? AND kind<>'opening_text'").run(conversationId, row)
      if (responseIds.length) this.store.native.prepare(`DELETE FROM agent_responses WHERE id IN (${responseIds.map(() => '?').join(',')})`).run(...responseIds.map((row) => row.id))
      for (const row of tailIds.filter((id) => id !== turnId)) this.store.native.prepare('DELETE FROM agent_turns WHERE id=?').run(row)
      this.writeContent(conversationId, 'turn', turnId, 'user_text', nextText)
      this.writeInputImages(conversationId, turnId, inputImages)
      const retained = this.store.native.prepare('SELECT COUNT(*) AS count FROM agent_branch_turns WHERE branchId=?').get(branch.branchId) as { count: number }
      const retainedResponses = this.store.native.prepare('SELECT COUNT(*) AS count FROM agent_responses r JOIN agent_branch_turns p ON p.turnId=r.turnId WHERE p.branchId=?').get(branch.branchId) as { count: number }
      const users = this.store.native.prepare("SELECT COUNT(*) AS count FROM agent_branch_turns p JOIN agent_turns t ON t.id=p.turnId WHERE p.branchId=? AND t.kind='user'").get(branch.branchId) as { count: number }
      this.store.native.prepare('UPDATE chat_sessions SET historyMessageCount=?,historyUserMessageCount=?,updatedAt=? WHERE id=?')
        .run(retained.count + retainedResponses.count, users.count, new Date().toISOString(), conversationId)
      const state = this.store.native.prepare('SELECT variableStateJson FROM agent_turns WHERE id=?').get(turnId) as { variableStateJson: string } | undefined
      if (state?.variableStateJson) {
        writeCurrentConversationVariableState(conversationId, state.variableStateJson, this.store.db)
      }
      return { turnId, text: nextText, inputImages, runtimeThreadId: randomUUID(), obsoleteRuntimeThreadIds, retainedTurns: users.count }
    })
  }

  upsertProcessItem(messageId: string, item: AgentProcessItem): void {
    this.store.withWriteTx(() => {
      const response = this.response(messageId)
      const rows = this.store.native.prepare(`SELECT partIndex,payloadJson FROM agent_content_parts
        WHERE conversationId=? AND ownerType='response' AND ownerId=? AND kind='agent_process' AND chunkIndex=0
        ORDER BY partIndex`).all(response.conversationId, response.id) as { partIndex: number; payloadJson: string }[]
      const existing = rows.find((row) => {
        try { return (JSON.parse(row.payloadJson) as { id?: string }).id === item.id } catch { return false }
      })
      if (existing) {
        this.store.native.prepare(`UPDATE agent_content_parts SET payloadJson=?
          WHERE conversationId=? AND ownerType='response' AND ownerId=? AND partIndex=? AND chunkIndex=0`)
          .run(JSON.stringify(item), response.conversationId, response.id, existing.partIndex)
      } else {
        const partIndex = Math.max(0, ...rows.map((row) => row.partIndex)) + 1
        this.store.native.prepare(`INSERT INTO agent_content_parts(conversationId,ownerType,ownerId,partIndex,kind,text,payloadJson,chunkIndex)
          VALUES (?,'response',?,?,'agent_process','',?,0)`)
          .run(response.conversationId, response.id, partIndex, JSON.stringify(item))
      }
      this.publish(response.conversationId)
    })
  }

  finish(messageId: string, content: string, status: MessageStatus, _db?: ElecKoiDatabase, variableStateJson?: string): ChatMessage {
    return this.store.withWriteTx(() => {
      const response = this.response(messageId)
      const path = this.store.native.prepare(`SELECT p.sequence FROM agent_branch_turns p
        JOIN agent_conversations c ON c.activeBranchId=p.branchId WHERE p.turnId=? AND c.id=?`).get(response.turnId, response.conversationId) as { sequence: number } | undefined
      if (!path) throw new Error('生成回复已不属于活动分支。')
      if (response.status !== 'pending') return this.project(response.conversationId, {
        id: messageId, ownerId: response.id, ownerType: 'response', turnId: response.turnId,
        speakerId: response.speakerId, sequence: path.sequence, responseIndex: response.responseIndex,
        role: 'assistant', status: response.status, createdAt: response.createdAt, variableStateJson: response.variableStateJson
      })
      this.writeContent(response.conversationId, 'response', response.id, 'assistant_text', content)
      if (variableStateJson === undefined) {
        this.store.native.prepare('UPDATE agent_responses SET status=? WHERE id=?').run(toStoredStatus(status), response.id)
      } else {
        this.store.native.prepare('UPDATE agent_responses SET status=?,variableStateJson=? WHERE id=?')
          .run(toStoredStatus(status), variableStateJson, response.id)
      }
      this.settleProcessItems(response.conversationId, response.id, status)
      this.publish(response.conversationId)
      return this.project(response.conversationId, {
        id: messageId, ownerId: response.id, ownerType: 'response', turnId: response.turnId,
        speakerId: response.speakerId, sequence: path.sequence, responseIndex: response.responseIndex,
        role: 'assistant', status: toStoredStatus(status), createdAt: response.createdAt,
        variableStateJson: variableStateJson ?? response.variableStateJson
      })
    })
  }

  private response(messageId: string) {
    // Desktop message identities are the response primary key, never a scan of all source-message IDs.
    const response = this.store.native.prepare('SELECT * FROM agent_responses WHERE id=?').get(messageId) as { id: string; conversationId: string; turnId: string; speakerId: string; status: string; responseIndex: number; createdAt: string; variableStateJson: string } | undefined
    if (!response) throw new Error('找不到正在生成的回复。')
    return response
  }

  private ensureSpeaker(conversationId: string, speaker: Speaker): string {
    const existing = this.store.native.prepare('SELECT id FROM conversation_speakers WHERE conversationId=? AND sourceSpeakerId=?').get(conversationId, speaker.id) as { id: string } | undefined
    if (existing) return existing.id
    const id = randomUUID()
    this.store.native.prepare('INSERT INTO conversation_speakers(id,conversationId,sourceSpeakerId,kind,displayName,avatarAssetId) VALUES (?,?,?,?,?,?)').run(id, conversationId, speaker.id, speaker.kind, speaker.name, speaker.avatar)
    return id
  }

  private writeContent(conversationId: string, ownerType: string, ownerId: string, kind: string, content: string): boolean {
    const rows = this.store.native.prepare('SELECT chunkIndex,text FROM agent_content_parts WHERE conversationId=? AND ownerType=? AND ownerId=? AND partIndex=0 ORDER BY chunkIndex').all(conversationId, ownerType, ownerId) as { chunkIndex: number; text: string }[]
    let offset = 0, chunkIndex = 0, changed = false
    do {
      let end = Math.min(offset + chunkCharacters, content.length)
      if (end < content.length && /[\uD800-\uDBFF]/.test(content[end - 1] ?? '') && /[\uDC00-\uDFFF]/.test(content[end] ?? '')) end--
      const text = content.slice(offset, end)
      if (rows[chunkIndex]?.text !== text) {
        this.store.native.prepare(`INSERT INTO agent_content_parts(conversationId,ownerType,ownerId,partIndex,kind,text,payloadJson,chunkIndex) VALUES (?,?,?,0,?,?,'',?)
          ON CONFLICT(ownerType,ownerId,partIndex,chunkIndex) DO UPDATE SET text=excluded.text`).run(conversationId, ownerType, ownerId, kind, text, chunkIndex)
        changed = true
      }
      offset = end
      chunkIndex++
    } while (offset < content.length)
    if (rows.length > chunkIndex) {
      this.store.native.prepare('DELETE FROM agent_content_parts WHERE conversationId=? AND ownerType=? AND ownerId=? AND partIndex=0 AND chunkIndex>=?').run(conversationId, ownerType, ownerId, chunkIndex)
      changed = true
    }
    return changed
  }

  private writeInputImages(conversationId: string, turnId: string, images: ChatUserImageAttachment[]): void {
    this.store.native.prepare("DELETE FROM agent_content_parts WHERE conversationId=? AND ownerType='turn' AND ownerId=? AND kind='user_image'")
      .run(conversationId, turnId)
    const insert = this.store.native.prepare(`INSERT INTO agent_content_parts(
      conversationId,ownerType,ownerId,partIndex,kind,text,payloadJson,chunkIndex
    ) VALUES (?,'turn',?,?,'user_image','',?,0)`)
    images.forEach((image, index) => insert.run(conversationId, turnId, index + 1, JSON.stringify(image)))
  }

  private appendContent(conversationId: string, ownerType: string, ownerId: string, kind: string, delta: string): boolean {
    const last = this.store.native.prepare(`SELECT chunkIndex,text FROM agent_content_parts
      WHERE conversationId=? AND ownerType=? AND ownerId=? AND partIndex=0
      ORDER BY chunkIndex DESC LIMIT 1`).get(conversationId, ownerType, ownerId) as { chunkIndex: number; text: string } | undefined
    let offset = 0
    let chunkIndex = last?.chunkIndex ?? 0

    if (last !== undefined && last.text.length < chunkCharacters) {
      const available = chunkCharacters - last.text.length
      const end = safeChunkEnd(delta, offset, Math.min(offset + available, delta.length))
      if (end > offset) {
        this.store.native.prepare(`UPDATE agent_content_parts SET text=?
          WHERE conversationId=? AND ownerType=? AND ownerId=? AND partIndex=0 AND chunkIndex=?`)
          .run(last.text + delta.slice(offset, end), conversationId, ownerType, ownerId, chunkIndex)
        offset = end
      }
      if (offset < delta.length) chunkIndex += 1
    } else if (last !== undefined) {
      chunkIndex += 1
    }

    while (offset < delta.length) {
      const end = safeChunkEnd(delta, offset, Math.min(offset + chunkCharacters, delta.length))
      this.store.native.prepare(`INSERT INTO agent_content_parts(conversationId,ownerType,ownerId,partIndex,kind,text,payloadJson,chunkIndex)
        VALUES (?,?,?,0,?,?,'',?)`).run(conversationId, ownerType, ownerId, kind, delta.slice(offset, end), chunkIndex)
      offset = end
      chunkIndex += 1
    }
    return true
  }

  private publish(conversationId: string, messages = 0, users = 0): void {
    if (messages) this.store.native.prepare('UPDATE chat_sessions SET historyMessageCount=historyMessageCount+?,historyUserMessageCount=historyUserMessageCount+?,updatedAt=? WHERE id=?')
      .run(messages, users, new Date().toISOString(), conversationId)
  }

  private project(conversationId: string, row: LedgerMessage): ChatMessage {
    const speaker = this.store.native.prepare('SELECT displayName,avatarAssetId FROM conversation_speakers WHERE id=? AND conversationId=?').get(row.speakerId, conversationId) as { displayName: string; avatarAssetId: string } | undefined
    const content = this.store.native.prepare("SELECT text FROM agent_content_parts WHERE conversationId=? AND ownerType=? AND ownerId=? AND kind IN ('user_text','assistant_text','opening_text','system_text') ORDER BY partIndex,chunkIndex").all(conversationId, row.ownerType, row.ownerId) as { text: string }[]
    const processRows = this.store.native.prepare("SELECT payloadJson FROM agent_content_parts WHERE conversationId=? AND ownerType=? AND ownerId=? AND kind='agent_process' ORDER BY partIndex,chunkIndex").all(conversationId, row.ownerType, row.ownerId) as { payloadJson: string }[]
    const process = processRows.flatMap((part) => {
      try { return [JSON.parse(part.payloadJson) as AgentProcessItem] } catch { return [] }
    })
    const inputImageAttachments = (this.store.native.prepare("SELECT payloadJson FROM agent_content_parts WHERE conversationId=? AND ownerType=? AND ownerId=? AND kind='user_image' ORDER BY partIndex")
      .all(conversationId, row.ownerType, row.ownerId) as { payloadJson: string }[])
      .flatMap((part) => {
        const image = parseInputImage(part.payloadJson)
        return image ? [image] : []
      })
    const openingSelectable = row.id === 'opening' && !(this.store.native.prepare(
      'SELECT historyUserMessageCount FROM chat_sessions WHERE id=?'
    ).get(conversationId) as { historyUserMessageCount: number } | undefined)?.historyUserMessageCount
    const opening = openingSelectable
      ? this.store.native.prepare("SELECT payloadJson FROM agent_content_parts WHERE conversationId=? AND ownerType='turn' AND ownerId=? AND kind='opening_text' ORDER BY partIndex LIMIT 1").get(conversationId, row.ownerId) as { payloadJson: string } | undefined
      : undefined
    let openingData: { options?: ChatMessage['openingOptions']; selectedId?: string } = {}
    if (opening?.payloadJson) {
      try { openingData = JSON.parse(opening.payloadJson) as typeof openingData } catch { openingData = {} }
    }
    return { id: row.id, conversationId, turnId: row.turnId, speakerId: row.speakerId, sequence: row.sequence,
      speakerName: speaker?.displayName ?? '', speakerAvatar: speaker?.avatarAssetId ?? '',
      ...(row.responseIndex >= 0 ? { responseIndex: row.responseIndex } : {}), role: row.role,
      content: content.map((part) => part.text).join(''), variableStateJson: row.variableStateJson ?? '{}',
      status: toMessageStatus(row.status), createdAt: row.createdAt,
      ...(process.length ? { process } : {}),
      ...(inputImageAttachments.length ? { inputImageAttachments } : {}),
      ...(openingData.options?.length ? { openingOptions: openingData.options, selectedOpeningId: openingData.selectedId ?? '' } : {}) }
  }

  private settleProcessItems(conversationId: string, responseId: string, responseStatus: MessageStatus): void {
    const rows = this.store.native.prepare(`SELECT partIndex,payloadJson FROM agent_content_parts
      WHERE conversationId=? AND ownerType='response' AND ownerId=? AND kind='agent_process' AND chunkIndex=0`)
      .all(conversationId, responseId) as { partIndex: number; payloadJson: string }[]
    const completedAtMillis = Date.now()
    const status: AgentProcessItem['status'] = responseStatus === 'cancelled'
      ? 'cancelled'
      : responseStatus === 'error' ? 'error' : 'complete'
    for (const row of rows) {
      let item: AgentProcessItem
      try { item = JSON.parse(row.payloadJson) as AgentProcessItem } catch { continue }
      if (item.status !== 'running') continue
      this.store.native.prepare(`UPDATE agent_content_parts SET payloadJson=?
        WHERE conversationId=? AND ownerType='response' AND ownerId=? AND partIndex=? AND chunkIndex=0`)
        .run(JSON.stringify({ ...item, status, completedAtMillis }), conversationId, responseId, row.partIndex)
    }
  }
}

function safeChunkEnd(content: string, offset: number, preferredEnd: number): number {
  if (preferredEnd >= content.length) return content.length
  if (/[\uD800-\uDBFF]/.test(content[preferredEnd - 1] ?? '') && /[\uDC00-\uDFFF]/.test(content[preferredEnd] ?? '')) {
    return Math.max(offset, preferredEnd - 1)
  }
  return preferredEnd
}

function parseInputImage(raw: string): ChatUserImageAttachment | undefined {
  try {
    const value = JSON.parse(raw) as Partial<ChatUserImageAttachment>
    if (!value || typeof value.attachmentId !== 'string' || !value.attachmentId
      || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(String(value.mediaType))
      || typeof value.bytes !== 'number' || !Number.isSafeInteger(value.bytes) || value.bytes <= 0
      || typeof value.width !== 'number' || !Number.isSafeInteger(value.width) || value.width <= 0
      || typeof value.height !== 'number' || !Number.isSafeInteger(value.height) || value.height <= 0) return undefined
    return value as ChatUserImageAttachment
  } catch {
    return undefined
  }
}
