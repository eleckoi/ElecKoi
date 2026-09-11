import type { VariableItemConfig, VariableObjectConfig } from '@shared/contracts/variables/schemas'
import { variableItemConfigSchema, variableObjectConfigSchema } from '@shared/contracts/variables/schemas'

export const VARIABLE_INITIAL_STATE_CONTENT_KIND = 'initial_state'
export const VARIABLE_SCHEMA_CODE_CONTENT_KIND = 'schema_code'

export function readVariableObject(payloadJson: string): VariableObjectConfig {
  try {
    return variableObjectConfigSchema.parse(JSON.parse(payloadJson))
  } catch (error) {
    throw new Error('变量组数据已损坏。', { cause: error })
  }
}

export function readVariable(payloadJson: string): VariableItemConfig {
  try {
    return variableItemConfigSchema.parse(JSON.parse(payloadJson))
  } catch (error) {
    throw new Error('变量数据已损坏。', { cause: error })
  }
}

export function writeVariableObject(value: VariableObjectConfig): string {
  return JSON.stringify(variableObjectConfigSchema.parse(value))
}

export function writeVariable(value: VariableItemConfig): string {
  return JSON.stringify(variableItemConfigSchema.parse(value))
}
