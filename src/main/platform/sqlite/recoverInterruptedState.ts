import type Database from 'better-sqlite3'

export function recoverInterruptedState(database: Database.Database): number {
  return database.transaction(() => {
    const timestamp = Date.now()
    database.prepare(`UPDATE agent_conversations SET revision = revision + 1
      WHERE id IN (SELECT conversationId FROM agent_responses WHERE status IN ('streaming', 'running', 'pending'))`).run()
    const result = database.prepare(`UPDATE agent_responses SET status = 'error', turnCompletedAtMillis = ?
      WHERE status IN ('streaming', 'running', 'pending')`).run(timestamp)
    database.prepare(`UPDATE generation_attempts SET state = 'failed', finishedAtMillis = ?,
      errorMessage = '应用退出时执行尚未完成' WHERE state IN ('queued', 'running', 'pending')`).run(timestamp)
    return result.changes
  }).immediate()
}
