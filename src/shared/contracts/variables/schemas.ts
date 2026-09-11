import { z } from 'zod'

export const VARIABLE_INITIALIZATION_OBJECT_ID = 'fixed-variable-initialization-object'
export const VARIABLE_INITIALIZATION_OBJECT_NAME = '变量运行配置'
export const DEFAULT_VARIABLE_CONFIG_VERSION_ID = 'variable-config-default'

export const variableValueTypeSchema = z.enum(['', 'number', 'string', 'boolean', 'array'])
export const variableReadModeSchema = z.enum(['required', 'on_demand'])

export const variableObjectConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(40),
  parentId: z.string(),
  enabled: z.boolean(),
  description: z.string(),
  updateRule: z.string(),
  dynamicKey: z.boolean(),
  order: z.number().int().nonnegative(),
  treeViewOrder: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()

export const variableItemConfigSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(60),
  objectId: z.string(),
  enabled: z.boolean(),
  type: variableValueTypeSchema,
  defaultValue: z.string(),
  description: z.string(),
  updateRule: z.string(),
  readMode: variableReadModeSchema,
  order: z.number().int().positive(),
  treeViewOrder: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()

export const variableConfigVersionSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(60),
  initialStateJson: z.string(),
  schemaCode: z.string(),
  objects: z.array(variableObjectConfigSchema),
  variables: z.array(variableItemConfigSchema),
  expandedObjectIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()

export const variableConfigSchema = z.object({
  characterId: z.string().min(1),
  name: z.string().max(60),
  initialStateJson: z.string(),
  schemaCode: z.string(),
  objects: z.array(variableObjectConfigSchema),
  variables: z.array(variableItemConfigSchema),
  expandedObjectIds: z.array(z.string()),
  activeVersionId: z.string().min(1),
  versions: z.array(variableConfigVersionSchema).min(1)
}).strict()

export type VariableValueType = z.output<typeof variableValueTypeSchema>
export type VariableReadMode = z.output<typeof variableReadModeSchema>
export type VariableObjectConfig = z.output<typeof variableObjectConfigSchema>
export type VariableItemConfig = z.output<typeof variableItemConfigSchema>
export type VariableConfigVersion = z.output<typeof variableConfigVersionSchema>
export type VariableConfig = z.output<typeof variableConfigSchema>
