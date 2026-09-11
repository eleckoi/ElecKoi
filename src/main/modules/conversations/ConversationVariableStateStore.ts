import { and, eq } from 'drizzle-orm'
import type { ElecKoiDatabase } from '@main/platform/sqlite/SqliteDatabase'
import { chatSessions, chatSessionVariableStates } from '@main/platform/sqlite/schema/common'

function requireConversation(conversationId: string, db: ElecKoiDatabase): void {
  const session = db.select({ id: chatSessions.id }).from(chatSessions)
    .where(eq(chatSessions.id, conversationId)).get()
  if (!session) throw new Error('找不到变量状态所属的聊天存档。')
}

function validatedObjectJson(raw: string): string {
  let value: unknown
  try {
    value = JSON.parse(raw || '{}')
  } catch (error) {
    throw new Error('当前变量状态不是合法 JSON。', { cause: error })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('当前变量状态必须是 JSON object。')
  }
  return raw || '{}'
}

export function readCurrentConversationVariableState(
  conversationId: string,
  db: ElecKoiDatabase
): string {
  requireConversation(conversationId, db)
  const current = db.select({ stateJson: chatSessionVariableStates.stateJson })
    .from(chatSessionVariableStates).where(and(
      eq(chatSessionVariableStates.sessionId, conversationId),
      eq(chatSessionVariableStates.kind, 'current')
    )).get()
  return current?.stateJson || '{}'
}

export function readConversationVariableStates(
  conversationId: string,
  db: ElecKoiDatabase
): Array<{ kind: string; stateJson: string }> {
  requireConversation(conversationId, db)
  return db.select({
    kind: chatSessionVariableStates.kind,
    stateJson: chatSessionVariableStates.stateJson
  }).from(chatSessionVariableStates).where(eq(chatSessionVariableStates.sessionId, conversationId)).all()
}

export function seedConversationVariableStates(
  conversationId: string,
  stateJson: string,
  db: ElecKoiDatabase
): void {
  requireConversation(conversationId, db)
  const value = validatedObjectJson(stateJson)
  for (const kind of ['initial', 'current'] as const) {
    db.insert(chatSessionVariableStates).values({ sessionId: conversationId, kind, stateJson: value })
      .onConflictDoUpdate({
        target: [chatSessionVariableStates.sessionId, chatSessionVariableStates.kind],
        set: { stateJson: value }
      }).run()
  }
}

export function writeCurrentConversationVariableState(
  conversationId: string,
  stateJson: string,
  db: ElecKoiDatabase
): string {
  requireConversation(conversationId, db)
  const value = validatedObjectJson(stateJson)
  db.insert(chatSessionVariableStates).values({
    sessionId: conversationId,
    kind: 'current',
    stateJson: value
  }).onConflictDoUpdate({
    target: [chatSessionVariableStates.sessionId, chatSessionVariableStates.kind],
    set: { stateJson: value }
  }).run()
  return value
}
