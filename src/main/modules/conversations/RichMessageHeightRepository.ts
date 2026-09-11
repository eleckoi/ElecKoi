import { and, desc, eq, ne } from 'drizzle-orm'
import type { SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import { roleplayRichHeights } from '@main/platform/sqlite/schema/common'

export interface RichMessageHeightRecord {
  conversationId: string
  messageId: string
  contentRevision: string
  rootIndex: number
  viewportWidthPx: number
  heightPx: number
  measuredAtEpochMs: number
}

type RichMessageHeightInput = Omit<RichMessageHeightRecord, 'measuredAtEpochMs'>

function toRecord(row: typeof roleplayRichHeights.$inferSelect): RichMessageHeightRecord {
  return {
    conversationId: row.sessionId,
    messageId: row.messageId,
    contentRevision: row.contentRevision,
    rootIndex: row.rootIndex,
    viewportWidthPx: row.viewportWidthPx,
    heightPx: row.heightPx,
    measuredAtEpochMs: row.measuredAtEpochMs,
  }
}

export class RichMessageHeightRepository {
  constructor(private readonly store: SqliteDatabase) {}

  list(conversationId: string): RichMessageHeightRecord[] {
    return this.store.db.select().from(roleplayRichHeights)
      .where(eq(roleplayRichHeights.sessionId, conversationId))
      .orderBy(desc(roleplayRichHeights.measuredAtEpochMs))
      .all()
      .map(toRecord)
  }

  save(input: RichMessageHeightInput): RichMessageHeightRecord {
    return this.store.withWriteTx((database) => {
      database.delete(roleplayRichHeights).where(and(
        eq(roleplayRichHeights.sessionId, input.conversationId),
        eq(roleplayRichHeights.messageId, input.messageId),
        eq(roleplayRichHeights.rootIndex, input.rootIndex),
        ne(roleplayRichHeights.contentRevision, input.contentRevision),
      )).run()
      database.delete(roleplayRichHeights).where(and(
        eq(roleplayRichHeights.sessionId, input.conversationId),
        eq(roleplayRichHeights.messageId, input.messageId),
        eq(roleplayRichHeights.contentRevision, input.contentRevision),
        eq(roleplayRichHeights.rootIndex, input.rootIndex),
        ne(roleplayRichHeights.viewportWidthPx, input.viewportWidthPx),
      )).run()

      const row = {
        sessionId: input.conversationId,
        messageId: input.messageId,
        contentRevision: input.contentRevision,
        rootIndex: input.rootIndex,
        viewportWidthPx: input.viewportWidthPx,
        heightPx: input.heightPx,
        measuredAtEpochMs: Date.now(),
      }
      database.insert(roleplayRichHeights).values(row).onConflictDoUpdate({
        target: [
          roleplayRichHeights.sessionId,
          roleplayRichHeights.messageId,
          roleplayRichHeights.contentRevision,
          roleplayRichHeights.rootIndex,
          roleplayRichHeights.viewportWidthPx,
        ],
        set: { heightPx: row.heightPx, measuredAtEpochMs: row.measuredAtEpochMs },
      }).run()

      return toRecord(row)
    })
  }
}
