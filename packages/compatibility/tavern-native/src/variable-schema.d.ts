export interface EditingVariableTarget { scope: string; owner: string }
export interface EditingVariableSchemaDescription { kind: 'none' | 'zod' | 'json-schema'; source: string; schema: unknown; note: string }
export function variableSchemaRevision(shared: object): number
export function subscribeVariableSchemas(shared: object, listener: () => void): () => void
export function variableSchemaTargets(shared: object): Array<EditingVariableTarget & { scriptId?: string }>
export function registerEditingVariableSchema(shared: object, target: EditingVariableTarget, schema: object | Function, scriptId?: string): () => void
export function describeEditingVariableSchema(shared: object, target: EditingVariableTarget, variables: Record<string, unknown>): Promise<EditingVariableSchemaDescription>
export function validateEditingVariables(shared: object, target: EditingVariableTarget, variables: Record<string, unknown>): Promise<Record<string, unknown>>
