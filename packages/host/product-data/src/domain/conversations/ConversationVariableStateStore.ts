import { and, eq } from 'drizzle-orm'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import type { ElecKoiDatabase } from '@product-data/storage/sqlite/SqliteDatabase'
import { agentConversations, chatSessions, chatSessionVariableStates } from '@product-data/storage/sqlite/schema/common'
import { createVariableIdentities, parseVariableIdentities, validateVariableIdentityState } from '@shared/foundation/variables/identity'

export function readConversationVariableBinding(conversationId: string, db: ElecKoiDatabase): { characterId: string; versionId: string } {
  const binding = db.select({ characterId: chatSessions.characterId, versionId: agentConversations.variableVersionId })
    .from(agentConversations).innerJoin(chatSessions, eq(chatSessions.id, agentConversations.id))
    .where(eq(agentConversations.id, conversationId)).get()
  if (!binding) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到变量配置所属的聊天存档。', { what: '聊天存档' })
  return binding
}

/** Change only the live association; saved values, identities and historical boundaries stay intact. */
export function selectConversationVariableVersion(conversationId: string, versionId: string, expectedVersionId: string, db: ElecKoiDatabase): void {
  const current = readConversationVariableBinding(conversationId, db)
  if (current.versionId !== expectedVersionId) throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision,
    '当前会话的变量配置已改变，请刷新后重试。', { what: '当前会话的变量配置' })
  db.update(agentConversations).set({ variableVersionId: versionId }).where(eq(agentConversations.id, conversationId)).run()
}

function requireConversation(conversationId: string, db: ElecKoiDatabase): void {
  const session = db.select({ id: chatSessions.id }).from(chatSessions)
    .where(eq(chatSessions.id, conversationId)).get()
  if (!session) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '找不到变量状态所属的聊天存档。', { what: '聊天存档' })
}

function validatedObjectJson(raw: string): string {
  let value: unknown
  try {
    value = JSON.parse(raw || '{}')
  } catch {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '当前变量状态不是合法 JSON。', { what: '当前变量状态' })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '当前变量状态必须是 JSON object。', { what: '当前变量状态' })
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

export function readCurrentConversationVariableIdentity(conversationId: string, db: ElecKoiDatabase): string {
  requireConversation(conversationId, db)
  return db.select({ identityJson: chatSessionVariableStates.identityJson }).from(chatSessionVariableStates).where(and(
    eq(chatSessionVariableStates.sessionId, conversationId), eq(chatSessionVariableStates.kind, 'current')
  )).get()?.identityJson || '{}'
}

export function readConversationVariableStates(
  conversationId: string,
  db: ElecKoiDatabase
): Array<{ kind: string; stateJson: string; identityJson: string }> {
  requireConversation(conversationId, db)
  return db.select({
    kind: chatSessionVariableStates.kind,
    stateJson: chatSessionVariableStates.stateJson,
    identityJson: chatSessionVariableStates.identityJson
  }).from(chatSessionVariableStates).where(eq(chatSessionVariableStates.sessionId, conversationId)).all()
}

export function seedConversationVariableStates(
  conversationId: string,
  stateJson: string,
  db: ElecKoiDatabase,
  identityJson?: string
): void {
  requireConversation(conversationId, db)
  const value = validatedObjectJson(stateJson)
  identityJson ??= JSON.stringify(createVariableIdentities(JSON.parse(value), { versionId: '', objects: [], variables: [] }, 'runtime'))
  validateVariableIdentityState(JSON.parse(value), parseVariableIdentities(identityJson))
  for (const kind of ['initial', 'current'] as const) {
    db.insert(chatSessionVariableStates).values({ sessionId: conversationId, kind, stateJson: value, identityJson })
      .onConflictDoUpdate({
        target: [chatSessionVariableStates.sessionId, chatSessionVariableStates.kind],
        set: { stateJson: value, identityJson }
      }).run()
  }
}

export function writeCurrentConversationVariableState(
  conversationId: string,
  stateJson: string,
  db: ElecKoiDatabase,
  identityJson = '{}'
): string {
  requireConversation(conversationId, db)
  const value = validatedObjectJson(stateJson)
  validateVariableIdentityState(JSON.parse(value), parseVariableIdentities(identityJson))
  db.insert(chatSessionVariableStates).values({
    sessionId: conversationId,
    kind: 'current',
    stateJson: value,
    identityJson
  }).onConflictDoUpdate({
    target: [chatSessionVariableStates.sessionId, chatSessionVariableStates.kind],
    set: { stateJson: value, identityJson }
  }).run()
  return value
}
