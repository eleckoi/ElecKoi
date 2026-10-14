import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export interface DataBankDocument {
  id: string; url: string; scope: string; name: string; enabled: boolean; revision: number
  createdAt: number; updatedAt: number; size: number; text?: string
}
export interface DataBankDocumentInput { id?: string; scope: string; name?: string; text?: string; enabled?: boolean }
export interface DataBankChunk { documentId: string; index: number; offset: number; text: string; vector: number[]; modelKey: string; revision: number }
type DocumentRow = { id: string; scope: string; name: string; text: string; enabled: number; revision: number; createdAt: number; updatedAt: number; size?: number }
const metadata = (row: DocumentRow, includeText: boolean): DataBankDocument => ({ id: row.id, url: `eleckoi-databank://document/${encodeURIComponent(row.id)}`,
  scope: row.scope, name: row.name, enabled: row.enabled !== 0, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt,
  size: row.size ?? Buffer.byteLength(row.text, 'utf8'), ...(includeText ? { text: row.text } : {}) })

/** Documents and vectors belong to the application's existing product database. */
export class DataBankRepository {
  constructor(private readonly db: Database.Database) {}

  list(scopes: readonly string[]): DataBankDocument[] {
    if (!scopes.length) return []
    const rows = this.db.prepare(`SELECT id,scope,name,enabled,revision,createdAt,updatedAt,length(CAST(text AS BLOB)) AS size FROM databank_documents WHERE scope IN (${scopes.map(() => '?').join(',')}) ORDER BY createdAt,id`).all(...scopes) as DocumentRow[]
    return rows.map(row => metadata(row, false))
  }

  get(id: string, scopes?: readonly string[]): DataBankDocument {
    const row = this.db.prepare('SELECT * FROM databank_documents WHERE id = ?').get(id) as DocumentRow | undefined
    if (!row || scopes && !scopes.includes(row.scope)) throw new Error(`资料文档不存在：${id}`)
    return metadata(row, true)
  }

  put(input: DataBankDocumentInput): DataBankDocument {
    return this.db.transaction(() => {
      const previous = input.id ? this.get(input.id) : undefined
      const id = previous?.id ?? randomUUID(), text = input.text ?? previous?.text ?? '', name = input.name ?? previous?.name ?? 'Document'
      if (!name.trim()) throw new TypeError('资料文档需要非空名称。')
      const revision = previous ? previous.revision + (text === previous.text ? 0 : 1) : 1, timestamp = Date.now()
      this.db.prepare(`INSERT INTO databank_documents (id,scope,name,text,enabled,revision,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,name=excluded.name,text=excluded.text,enabled=excluded.enabled,revision=excluded.revision,updatedAt=excluded.updatedAt`)
        .run(id, input.scope, name, text, input.enabled === undefined ? previous?.enabled === false ? 0 : 1 : input.enabled ? 1 : 0, revision, previous?.createdAt ?? timestamp, timestamp)
      if (previous && revision !== previous.revision) this.db.prepare('DELETE FROM databank_chunks WHERE documentId = ?').run(id)
      return this.get(id)
    }).immediate()
  }

  delete(id: string, scopes: readonly string[]): boolean {
    this.get(id, scopes)
    return this.db.prepare('DELETE FROM databank_documents WHERE id = ?').run(id).changes > 0
  }

  setEnabled(id: string, enabled: boolean, scopes: readonly string[]): DataBankDocument {
    this.get(id, scopes)
    this.db.prepare('UPDATE databank_documents SET enabled = ?, updatedAt = ? WHERE id = ?').run(enabled ? 1 : 0, Date.now(), id)
    return this.get(id)
  }

  chunks(scopes: readonly string[], modelKey: string): DataBankChunk[] {
    if (!scopes.length) return []
    const rows = this.db.prepare(`SELECT c.documentId,c.chunkIndex,c.offset,c.text,c.embeddingJson,c.modelKey,c.revision FROM databank_chunks c
      JOIN databank_documents d ON d.id = c.documentId WHERE d.enabled = 1 AND d.scope IN (${scopes.map(() => '?').join(',')}) AND c.modelKey = ? AND c.revision = d.revision
      ORDER BY c.documentId,c.chunkIndex`).all(...scopes, modelKey) as Array<{ documentId: string; chunkIndex: number; offset: number; text: string; embeddingJson: string; modelKey: string; revision: number }>
    return rows.map(row => ({ documentId: row.documentId, index: row.chunkIndex, offset: row.offset, text: row.text, vector: JSON.parse(row.embeddingJson), modelKey: row.modelKey, revision: row.revision }))
  }

  replaceChunks(documentId: string, revision: number, modelKey: string, chunks: Array<{ index: number; offset: number; text: string; vector: number[] }>): number {
    return this.db.transaction(() => {
      if (this.get(documentId).revision !== revision) throw new Error('资料文档在索引期间已修改，请重新建立索引。')
      this.db.prepare('DELETE FROM databank_chunks WHERE documentId = ?').run(documentId)
      const insert = this.db.prepare('INSERT INTO databank_chunks (documentId,chunkIndex,offset,text,embeddingJson,modelKey,revision) VALUES (?,?,?,?,?,?,?)')
      for (const chunk of chunks) insert.run(documentId, chunk.index, chunk.offset, chunk.text, JSON.stringify(chunk.vector), modelKey, revision)
      return chunks.length
    }).immediate()
  }

  purge(scopes: readonly string[]): number {
    if (!scopes.length) return 0
    return this.db.prepare(`DELETE FROM databank_chunks WHERE documentId IN (SELECT id FROM databank_documents WHERE scope IN (${scopes.map(() => '?').join(',')}))`).run(...scopes).changes
  }

  entryVectors(entryIds: readonly string[], modelKey: string): Array<{ entryId: string; contentHash: string; index: number; vector: number[] }> {
    if (!entryIds.length) return []
    const rows = this.db.prepare(`SELECT entryId,contentHash,chunkIndex,embeddingJson FROM databank_entry_vectors WHERE modelKey = ? AND entryId IN (${entryIds.map(() => '?').join(',')}) ORDER BY entryId,chunkIndex`)
      .all(modelKey, ...entryIds) as Array<{ entryId: string; contentHash: string; chunkIndex: number; embeddingJson: string }>
    return rows.map(row => ({ entryId: row.entryId, contentHash: row.contentHash, index: row.chunkIndex, vector: JSON.parse(row.embeddingJson) }))
  }

  replaceEntryVectors(entryId: string, contentHash: string, modelKey: string, vectors: number[][]): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM databank_entry_vectors WHERE entryId = ? AND modelKey = ?').run(entryId, modelKey)
      const insert = this.db.prepare('INSERT INTO databank_entry_vectors (entryId,contentHash,modelKey,chunkIndex,embeddingJson) VALUES (?,?,?,?,?)')
      vectors.forEach((vector, index) => insert.run(entryId, contentHash, modelKey, index, JSON.stringify(vector)))
    }).immediate()
  }
}
