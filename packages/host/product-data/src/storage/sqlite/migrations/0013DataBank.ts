import type Database from 'better-sqlite3'

export const dataBankSchemaSql = 'CREATE TABLE IF NOT EXISTS `databank_documents` (`id` TEXT NOT NULL, `scope` TEXT NOT NULL, `name` TEXT NOT NULL, `text` TEXT NOT NULL, `enabled` INTEGER NOT NULL, `revision` INTEGER NOT NULL, `createdAt` INTEGER NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`id`));\n\nCREATE INDEX IF NOT EXISTS `index_databank_documents_scope` ON `databank_documents` (`scope`);\n\nCREATE TABLE IF NOT EXISTS `databank_chunks` (`documentId` TEXT NOT NULL, `chunkIndex` INTEGER NOT NULL, `offset` INTEGER NOT NULL, `text` TEXT NOT NULL, `embeddingJson` TEXT NOT NULL, `modelKey` TEXT NOT NULL, `revision` INTEGER NOT NULL, PRIMARY KEY(`documentId`, `chunkIndex`), FOREIGN KEY(`documentId`) REFERENCES `databank_documents`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE );\n\nCREATE INDEX IF NOT EXISTS `index_databank_chunks_modelKey` ON `databank_chunks` (`modelKey`);\n\nCREATE TABLE IF NOT EXISTS `databank_entry_vectors` (`entryId` TEXT NOT NULL, `contentHash` TEXT NOT NULL, `modelKey` TEXT NOT NULL, `chunkIndex` INTEGER NOT NULL, `embeddingJson` TEXT NOT NULL, PRIMARY KEY(`entryId`, `contentHash`, `modelKey`, `chunkIndex`));\n\nCREATE INDEX IF NOT EXISTS `index_databank_entry_vectors_modelKey` ON `databank_entry_vectors` (`modelKey`);'

export const migration0013 = {
  fromVersion: 12, toVersion: 13, name: 'databank-documents-and-vectors', acceptedBaselines: ['eleckoi-common'],
  apply(database: Database.Database): void { database.exec(dataBankSchemaSql) }
} as const
