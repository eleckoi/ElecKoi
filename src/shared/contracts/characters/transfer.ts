import { z } from 'zod'
import { characterCollectionSchema } from '../entities/schemas'

export const characterImportSourceSchema = z.enum(['eleckoi', 'sillytavern'])
export const characterExportFormatSchema = z.enum(['png', 'json'])

export const characterImportFileSchema = z.object({
  displayName: z.string().min(1).max(260),
  mimeType: z.string().max(120),
  base64: z.string().min(1).max(132 * 1024 * 1024)
}).strict()

export const characterImportPreviewItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  summary: z.string(),
  imageAvailable: z.boolean(),
  errorMessage: z.string(),
  importable: z.boolean()
}).strict()

export const characterImportPreviewSchema = z.object({
  token: z.string().min(1),
  items: z.array(characterImportPreviewItemSchema)
}).strict()

export const characterImportResultSchema = z.object({
  collection: characterCollectionSchema,
  importedCharacterIds: z.array(z.string()),
  failedMessages: z.array(z.string())
}).strict()

export const characterExportResultSchema = z.object({
  fileName: z.string().min(1).max(260),
  mimeType: z.enum(['image/png', 'application/json']),
  base64: z.string().min(1).max(132 * 1024 * 1024)
}).strict()

export const characterExportBatchResultSchema = z.object({
  canceled: z.boolean(),
  directory: z.string().max(520),
  written: z.array(z.object({
    characterId: z.string().min(1),
    fileName: z.string().min(1).max(260)
  }).strict()).max(50),
  failures: z.array(z.object({
    characterId: z.string().min(1),
    message: z.string().min(1).max(500)
  }).strict()).max(50)
}).strict()

export type CharacterImportSource = z.infer<typeof characterImportSourceSchema>
export type CharacterExportFormat = z.infer<typeof characterExportFormatSchema>
export type CharacterImportFile = z.infer<typeof characterImportFileSchema>
export type CharacterImportPreview = z.infer<typeof characterImportPreviewSchema>
export type CharacterImportResult = z.infer<typeof characterImportResultSchema>
export type CharacterExportResult = z.infer<typeof characterExportResultSchema>
export type CharacterExportBatchResult = z.infer<typeof characterExportBatchResultSchema>
