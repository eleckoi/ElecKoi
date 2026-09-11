import { z } from 'zod'

export const variableStateDocumentSchema = z.object({
  rawJson: z.string(),
  root: z.record(z.string(), z.unknown()).nullable(),
  errorMessage: z.string(),
  topLevelCount: z.number().int().nonnegative(),
  valueCount: z.number().int().nonnegative()
}).strict()

export const variableFloorSnapshotSchema = z.object({
  id: z.string(),
  label: z.string(),
  messagePreview: z.string(),
  createdAt: z.string(),
  state: variableStateDocumentSchema,
  changedValueCount: z.number().int().nonnegative(),
  changedPaths: z.array(z.string())
}).strict()

export const variableViewerTimelineSchema = z.object({
  current: variableStateDocumentSchema,
  floors: z.array(variableFloorSnapshotSchema)
}).strict()

export type VariableStateDocument = z.output<typeof variableStateDocumentSchema>
export type VariableFloorSnapshot = z.output<typeof variableFloorSnapshotSchema>
export type VariableViewerTimeline = z.output<typeof variableViewerTimelineSchema>
