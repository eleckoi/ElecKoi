import { z } from 'zod'
import { characterCollectionSchema } from '../entities/schemas'

export const characterImportSourceSchema = z.enum(['eleckoi', 'sillytavern'])
export const characterExportFormatSchema = z.enum(['png', 'json', 'zip'])

export const characterImportFileSchema = z.object({
  displayName: z.string().min(1),
  mimeType: z.string(),
  base64: z.string().min(1)
}).strict()

export const characterImportPreviewItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  summary: z.string(),
  warnings: z.array(z.string()).default([]),
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
  fileName: z.string().min(1),
  mimeType: z.enum(['image/png', 'application/json', 'application/zip']),
  base64: z.string().min(1)
}).strict()

export const characterExportBatchResultSchema = z.object({
  canceled: z.boolean(),
  directory: z.string(),
  written: z.array(z.object({
    characterId: z.string().min(1),
    fileName: z.string().min(1)
  }).strict()),
  failures: z.array(z.object({
    characterId: z.string().min(1),
    message: z.string().min(1)
  }).strict())
}).strict()

export type CharacterImportSource = z.infer<typeof characterImportSourceSchema>
export type CharacterExportFormat = z.infer<typeof characterExportFormatSchema>
export type CharacterImportFile = z.infer<typeof characterImportFileSchema>
export type CharacterImportPreview = z.infer<typeof characterImportPreviewSchema>
export type CharacterImportResult = z.infer<typeof characterImportResultSchema>
export type CharacterExportResult = z.infer<typeof characterExportResultSchema>
export type CharacterExportBatchResult = z.infer<typeof characterExportBatchResultSchema>
