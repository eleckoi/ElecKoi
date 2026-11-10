import { createContext, Script } from 'node:vm'
import { parse } from '@babel/parser'
import lodash from 'lodash'
import { z } from 'zod'
import { ELECKOI_FAILURE_CODES, type EleckoiFailureCode } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
export { variableDefaultValue } from '@shared/foundation/variables/initialState'
export { createVariableIdentities, parseVariableIdentities, projectVariableState, reconcileVariableState, replaceVariableIdentities } from '@shared/foundation/variables/identity'

export interface VariableSchemaRuntime {
  schema: z.ZodType
  parse(value: Record<string, unknown>): Record<string, unknown>
}

export type VariableRuleStage = 'schema' | 'input' | 'validation' | 'execution' | 'output'
const remoteFailure = z.object({
  error_stage: z.enum(['schema', 'input', 'validation', 'execution', 'output']),
  detail: z.string(),
  issues: z.array(z.object({ path: z.string(), code: z.string(), message: z.string() })).optional(),
  issues_truncated: z.boolean().optional(),
}).strict()

export class VariableRuleError extends Error {
  constructor(readonly stage: VariableRuleStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'VariableRuleError'
  }
}

export function describeVariableRuleFailure(error: unknown): {
  error_stage: VariableRuleStage
  detail: string
  issues?: Array<{ path: string; code: string; message: string }>
  issues_truncated?: boolean
} {
  if (error && typeof error === 'object' && 'variableRuleFailure' in error) {
    const decoded = remoteFailure.safeParse(error.variableRuleFailure)
    if (decoded.success) return {
      error_stage: decoded.data.error_stage,
      detail: decoded.data.detail,
      ...(decoded.data.issues !== undefined ? { issues: decoded.data.issues } : {}),
      ...(decoded.data.issues_truncated !== undefined ? { issues_truncated: decoded.data.issues_truncated } : {}),
    }
  }
  const cause = error instanceof VariableRuleError ? error.cause : error
  const detail = error instanceof Error ? error.message : String(error)
  return {
    error_stage: error instanceof VariableRuleError ? error.stage : 'execution',
    detail,
    ...(cause instanceof z.ZodError ? {
      issues: cause.issues.map(issue => ({
        path: issue.path.length ? '/' + issue.path.map(part => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '',
        code: issue.code,
        message: issue.message,
      })),
      issues_truncated: false,
    } : {}),
  }
}

/** JSON serialization must not discard authored fields or invoke authored accessors. */
export function assertVariableJson(value: unknown, objectPrototypes = new Set<unknown>([Object.prototype, null]), ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (!value || typeof value !== 'object' || ancestors.has(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量状态必须是有限、无循环的 JSON 数据。', { what: '变量状态' })
  if (!Array.isArray(value) && !objectPrototypes.has(Object.getPrototypeOf(value))) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量状态包含非 JSON 对象。', { what: '变量状态' })
  if (Object.getOwnPropertySymbols(value).length) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量状态包含无法保存的 Symbol 字段。', { what: '变量状态' })
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) if (!Object.hasOwn(descriptors, String(index))) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量状态包含稀疏数组。', { what: '变量状态' })
  }
  ancestors.add(value)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量状态包含无法保存的属性或访问器。', { what: '变量状态' })
    if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量数组包含无法保存的附加字段。', { what: '变量数组' })
    assertVariableJson(descriptor.value, objectPrototypes, ancestors)
  }
  ancestors.delete(value)
}

/**
 * 生成脚本（如 `mvuSchema` 的模板）经注入的 `fail` 抛出的契约失败。
 *
 * 它必须原样穿过 {@link VariableRuleError} 的诊断包装：码与详情是给边界和用户的，
 * 包成普通诊断错误以后边界只能折成兜底码，用户看到的是一句通用说法。
 */
class GeneratedRuleFailure extends DesktopError {}

/**
 * 生成脚本里唯一可用的失败构造器，与 {@link ELECKOI_FAILURE_CODES} 一起注入沙箱
 * （见 {@link createVariableSchema}）。生成代码对作者可见，所以名字保持短。
 */
function injectedRuleFailure(code: EleckoiFailureCode, message: string, details?: unknown): never {
  throw new GeneratedRuleFailure(code, message, details)
}

/** 注入沙箱的运行时名字：`fail` 是生成脚本的失败出口，`CODES` 是码表。改名字要同步 `mvuSchema` 的模板。 */
const GENERATED_SCRIPT_BINDINGS = {
  CODES: Object.freeze({ ...ELECKOI_FAILURE_CODES }),
  fail: injectedRuleFailure
}

/** 诊断包装；生成脚本的带码失败不包，否则码会在边界上丢掉。 */
function ruleFailure(stage: VariableRuleStage, error: unknown): Error {
  return error instanceof GeneratedRuleFailure ? error : new VariableRuleError(stage, error)
}

export function loadVariableSchema(source: string): VariableSchemaRuntime {
  try { return createVariableSchema(source) }
  catch (error) { throw ruleFailure('schema', error) }
}

function createVariableSchema(source: string): VariableSchemaRuntime {
  const ast = parse(source, { sourceType: 'module' })
  const statements: string[] = []
  let result = 'Schema'
  const bindings: Record<string, unknown> = { z, _: lodash, ...GENERATED_SCRIPT_BINDINGS }
  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration') {
      if (statement.source.value !== 'zod' && statement.source.value !== 'lodash') throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, `变量规则的外部依赖尚不支持：${statement.source.value}`, { what: '变量规则的外部依赖' })
      for (const specifier of statement.specifiers) {
        if (statement.source.value === 'zod' && specifier.type === 'ImportSpecifier'
          && specifier.imported.type === 'Identifier' && specifier.imported.name === 'z') bindings[specifier.local.name] = z
        else if (statement.source.value === 'lodash' && specifier.type === 'ImportDefaultSpecifier') bindings[specifier.local.name] = lodash
        else throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '变量规则的依赖声明尚不支持。', { what: '变量规则的依赖声明' })
      }
      continue
    }
    if (statement.type === 'ExportDefaultDeclaration') {
      if (statement.declaration.type === 'FunctionDeclaration' || statement.declaration.type === 'ClassDeclaration') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '变量规则必须返回 Zod Schema。', { field: 'rule' })
      result = `(${source.slice(statement.declaration.start!, statement.declaration.end!)})`
    } else if (statement.type === 'ExportNamedDeclaration') {
      if (!statement.declaration) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '变量规则的导出声明尚不支持。', { what: '变量规则的导出声明' })
      statements.push(source.slice(statement.declaration.start!, statement.declaration.end!))
    } else if (ast.program.body.length === 1 && statement.type === 'ExpressionStatement') {
      result = `(${source.slice(statement.expression.start!, statement.expression.end!)})`
    } else statements.push(source.slice(statement.start!, statement.end!))
  }
  const context = createContext(bindings, { codeGeneration: { strings: false, wasm: false } })
  const schema: unknown = new Script(`(() => {\n${statements.join('\n')}\nreturn ${result};\n})()`).runInContext(context)
  if (!(schema instanceof z.ZodType)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '变量规则没有返回当前支持的 Zod Schema。', { what: '变量规则返回的 Zod Schema' })
  const prototypes = new Set([Object.prototype, null, new Script('Object.prototype').runInContext(context)])
  context.__schema = schema
  const evaluate = new Script('__schema.parse(__state)')
  return {
    schema,
    parse(value) {
      try { assertVariableJson(value) }
      catch (error) { throw new VariableRuleError('input', error) }
      context.__state = structuredClone(value)
      try {
        let parsed: unknown
        try { parsed = evaluate.runInContext(context) }
        catch (error) { throw ruleFailure(error instanceof z.ZodError ? 'validation' : 'execution', error) }
        try {
          assertVariableJson(parsed, prototypes)
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '变量规则处理结果必须是 JSON 对象。', { what: '变量规则处理结果' })
          return JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>
        } catch (error) { throw new VariableRuleError('output', error) }
      } finally { delete context.__state }
    },
  }
}
