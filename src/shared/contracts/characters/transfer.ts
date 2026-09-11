import { z } from 'zod'
import { characterCollectionSchema } from '../entities/schemas'

export const characterImportSourceSchema = z.enum(['eleckoi', 'sillytavern'])

export const characterImportFileSchema = z.object({
  displayName: z.string().min(1).max(260),
  mimeType: z.string().max(120),
  base64: z.string().min(1).max(90 * 1024 * 1024)
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

export type CharacterImportSource = z.infer<typeof characterImportSourceSchema>
export type CharacterImportFile = z.infer<typeof characterImportFileSchema>
export type CharacterImportPreview = z.infer<typeof characterImportPreviewSchema>
export type CharacterImportResult = z.infer<typeof characterImportResultSchema>
