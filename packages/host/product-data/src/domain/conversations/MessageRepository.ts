import type { ChatMessage } from '@shared/contracts/entities/chat'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import type { ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'

interface LedgerMessage {
  id: string; ownerId: string; turnId: string; speakerId: string; sequence: number; responseIndex: number
  role: 'user' | 'assistant'; status: string; createdAt: string; variableStateJson: string | null
  runtimeSessionId: string; dshTurn: number | null
}

/** 读取仍有效的产品开场白和旧消息关系；普通正文只由 Session 提供。 */
export class MessageRepository {
  constructor(private readonly store: ElecKoiSqliteStore) {}

  pageMetadata(conversationId: string, beforeSequence?: number, limit = 50) {
    const size = Math.max(1, Math.trunc(limit))
    const placements = this.store.native.prepare(`SELECT p.sequence FROM agent_branch_turns p
      JOIN agent_conversations c ON c.activeBranchId=p.branchId WHERE c.id=? AND p.sequence<?
      ORDER BY p.sequence DESC LIMIT ?`).all(conversationId, beforeSequence ?? Number.MAX_SAFE_INTEGER, size + 1) as Array<{ sequence: number }>
    const hasMore = placements.length > size
    const selected = placements.slice(0, size)
    if (!selected.length) return { messages: [] as ChatMessage[], hasMore: false, beforeSequence: null }
    const firstSequence = selected.at(-1)!.sequence
    const rows = this.store.native.prepare(`
      SELECT CASE WHEN t.kind='opening' THEN 'opening' ELSE t.id END AS id,t.id AS ownerId,t.id AS turnId,
        t.speakerId,p.sequence,-1 AS responseIndex,CASE WHEN t.kind='opening' THEN 'assistant' ELSE 'user' END AS role,
        'completed' AS status,t.createdAt,t.variableStateJson,'' AS runtimeSessionId,NULL AS dshTurn
      FROM agent_conversations c JOIN agent_branch_turns p ON p.branchId=c.activeBranchId
        JOIN agent_turns t ON t.id=p.turnId WHERE c.id=? AND p.sequence>=? AND p.sequence<?
      UNION ALL
      SELECT r.id,r.id,r.turnId,r.speakerId,p.sequence,r.responseIndex,'assistant',r.status,r.createdAt,
        s.variableStateJson,r.runtimeThreadId,r.dshTurn
      FROM agent_conversations c JOIN agent_branch_turns p ON p.branchId=c.activeBranchId
        JOIN agent_responses r ON r.turnId=p.turnId AND r.conversationId=c.id
        LEFT JOIN conversation_state_snapshots s ON s.conversationId=r.conversationId AND s.branchId=p.branchId
          AND s.runtimeSessionId=r.runtimeThreadId AND s.boundaryType='reply' AND s.boundaryId=r.id AND s.phase='after'
      WHERE c.id=? AND p.sequence>=? AND p.sequence<? ORDER BY sequence,responseIndex
    `).all(conversationId, firstSequence, beforeSequence ?? Number.MAX_SAFE_INTEGER,
      conversationId, firstSequence, beforeSequence ?? Number.MAX_SAFE_INTEGER) as LedgerMessage[]
    const preceding = this.store.native.prepare(`SELECT
      (SELECT COUNT(*) FROM agent_branch_turns p WHERE p.branchId=c.activeBranchId AND p.sequence<?)
      + (SELECT COUNT(*) FROM agent_responses r JOIN agent_branch_turns p ON p.turnId=r.turnId
        WHERE p.branchId=c.activeBranchId AND p.sequence<?) AS count
      FROM agent_conversations c WHERE c.id=?`).get(firstSequence, firstSequence, conversationId) as { count: number }
    return { messages: rows.map((row, index) => ({ ...this.project(conversationId, row), messageIndex: preceding.count + index })),
      hasMore, beforeSequence: firstSequence }
  }

  listMetadata(conversationId: string): ChatMessage[] {
    const result: ChatMessage[] = []
    let cursor: number | undefined
    do {
      const page = this.pageMetadata(conversationId, cursor, 200)
      result.unshift(...page.messages)
      if (!page.hasMore || page.beforeSequence === null) return result
      cursor = page.beforeSequence
    } while (true)
  }

  /**
   * 保护旧版待提交输入引用的附件，供生图文件删除前检查；正式输入由 Session 提供。
   * RETIRE WHEN: 旧库和备份中的附件引用均在 Session 可查，并通过删除保护回归。
   * 随 agent_pending_inputs 的版本化清理移除本方法、Host 调用和合同。
   */
  listInputImageReferences(): Array<{ conversationId: string; attachmentId: string }> {
    const rows = this.store.native.prepare(`SELECT t.conversationId,i.draftJson FROM agent_pending_inputs i
      JOIN agent_turns t ON t.id=i.turnId JOIN agent_branch_turns p ON p.turnId=t.id
      JOIN agent_conversations c ON c.id=t.conversationId AND c.activeBranchId=p.branchId`)
      .all() as Array<{ conversationId: string; draftJson: string }>
    const references = new Map<string, { conversationId: string; attachmentId: string }>()
    for (const row of rows) {
      const draft = JSON.parse(row.draftJson) as { images?: Array<{ attachmentId?: string }> }
      if (!Array.isArray(draft.images)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '待提交输入的图片引用格式不正确。', { what: '待提交输入的图片引用' })
      for (const image of draft.images) {
        if (typeof image.attachmentId !== 'string' || !image.attachmentId) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '待提交输入缺少正式图片标识。', { what: '待提交输入的图片标识' })
        references.set(`${row.conversationId}\u0000${image.attachmentId}`, { conversationId: row.conversationId, attachmentId: image.attachmentId })
      }
    }
    return [...references.values()]
  }

  private project(conversationId: string, row: LedgerMessage): ChatMessage {
    const speaker = this.store.native.prepare('SELECT displayName,avatarAssetId FROM conversation_speakers WHERE id=? AND conversationId=?')
      .get(row.speakerId, conversationId) as { displayName: string; avatarAssetId: string } | undefined
    const opening = row.id === 'opening' ? this.store.native.prepare('SELECT content,payloadJson FROM agent_openings WHERE conversationId=? AND turnId=?')
      .get(conversationId, row.ownerId) as { content: string; payloadJson: string } | undefined : undefined
    const openingData = opening ? JSON.parse(opening.payloadJson) as { options?: ChatMessage['openingOptions']; selectedId?: string } : undefined
    return { id: row.id, conversationId, turnId: row.turnId, speakerId: row.speakerId, sequence: row.sequence,
      speakerName: speaker?.displayName ?? '', speakerAvatar: speaker?.avatarAssetId ?? '',
      ...(row.responseIndex >= 0 ? { responseIndex: row.responseIndex } : {}), role: row.role,
      content: opening?.content ?? '', variableStateJson: row.variableStateJson ?? '{}',
      variableSnapshotAvailable: row.variableStateJson !== null,
      status: row.status === 'completed' ? 'complete' : row.status === 'pending' ? 'streaming' : row.status === 'cancelled' ? 'cancelled' : 'error',
      createdAt: row.createdAt, ...(row.runtimeSessionId ? { runtimeSessionId: row.runtimeSessionId } : {}),
      ...(row.dshTurn === null ? {} : { dshTurn: row.dshTurn }),
      ...(openingData?.options?.length ? { openingOptions: openingData.options, selectedOpeningId: openingData.selectedId ?? '' } : {}) }
  }
}
