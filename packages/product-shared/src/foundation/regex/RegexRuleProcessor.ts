import type {
  RegexRule,
  RegexRuleCollection,
  RegexRuleScope,
  RegexRuleSurface,
  RegexRuleTarget
} from '@shared/contracts/regex/schemas'

interface ParsedPattern {
  body: string
  flags: string
}

export interface RegexTransformOptions {
  replacementDecorator?: (replacement: string) => string
  protectDecoratedReplacements?: boolean
  depth?: number
  isEdit?: boolean
  expandMacros?: (text: string, escape?: (value: string) => string) => string
}

const supportedFlags = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'])
const compiledExpressions = new Map<string, RegExp>()
const maxCompiledPatterns = 128

export function parseRegexPattern(pattern: string): ParsedPattern {
  const trimmed = pattern.trim()
  if (trimmed.length >= 3 && trimmed.startsWith('/')) {
    const closing = trimmed.lastIndexOf('/')
    if (closing > 0) return { body: trimmed.slice(1, closing), flags: trimmed.slice(closing + 1) }
  }
  return { body: trimmed, flags: '' }
}

export function validateRegexRule(rule: RegexRule): string | null {
  try {
    compileRegexRule(rule)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : '正则表达式无效。'
  }
}

function compileRegexRule(rule: RegexRule): RegExp {
  const parsed = parseRegexPattern(rule.pattern)
  const unsupported = [...new Set([...parsed.flags].filter((flag) => !supportedFlags.has(flag)))]
  if (unsupported.length > 0) throw new Error(`不支持的正则标志：${unsupported.join('')}`)
  if (new Set(parsed.flags).size !== parsed.flags.length) throw new Error('正则标志不能重复。')
  const key = `${parsed.flags}\u0000${parsed.body}`
  const existing = compiledExpressions.get(key)
  if (existing) {
    compiledExpressions.delete(key)
    compiledExpressions.set(key, existing)
    existing.lastIndex = 0
    return existing
  }
  const expression = new RegExp(parsed.body, parsed.flags)
  compiledExpressions.set(key, expression)
  if (compiledExpressions.size > maxCompiledPatterns) {
    const oldest = compiledExpressions.keys().next().value
    if (oldest !== undefined) compiledExpressions.delete(oldest)
  }
  return expression
}

function replacementFor(match: RegExpExecArray, source: string, trimStrings: string[] = []): string {
  const trim = (value: string) => trimStrings.reduce((result, trim) => trim ? result.replaceAll(trim, '') : result, value)
  return source.replace(
    /\$\$|\$&|\$<([^>]+)>|\$(\d+)|\{\{match\}\}/gi,
    (token, groupName: string | undefined, rawGroupIndex: string | undefined) => {
      if (token === '$$') return '$'
      if (token === '$&' || token.toLowerCase() === '{{match}}') return trim(match[0])
      if (groupName !== undefined) return trim(match.groups?.[groupName] ?? '')
      return trim(match[Number(rawGroupIndex)] ?? '')
    }
  )
}

function applyRule(text: string, rule: RegexRule, replacementDecorator?: (replacement: string) => string, options: RegexTransformOptions = {}): string {
  const expand = (value: string, escape?: (value: string) => string): string => {
    if (!value.includes('{{')) return value
    if (!options.expandMacros) throw new Error(`Regex rule ${rule.id} requires the macro runtime`)
    return options.expandMacros(value, escape)
  }
  if (rule.substituteRegex) rule = { ...rule, pattern: expand(rule.pattern, rule.substituteRegex === 2
    ? value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : undefined) }
  const parsed = parseRegexPattern(rule.pattern)
  let expression: RegExp
  try {
    expression = compileRegexRule(rule)
  } catch (error) {
    if (rule.trimStrings || rule.minDepth !== undefined || rule.maxDepth !== undefined || rule.substituteRegex !== undefined) throw error
    return text
  }
  const trimStrings = (rule.trimStrings ?? []).map(value => expand(value))
  const replacementForMatch = (match: RegExpExecArray) => expand(replacementFor(match, rule.replacement, trimStrings))
  if (!parsed.flags.includes('g')) {
    const match = expression.exec(text)
    if (!match) return text
    const replacement = replacementForMatch(match)
    return text.slice(0, match.index) + (replacementDecorator?.(replacement) ?? replacement) + text.slice(match.index + match[0].length)
  }
  let cursor = 0
  let output = ''
  let matched = false
  for (let match = expression.exec(text); match; match = expression.exec(text)) {
    matched = true
    const replacement = replacementForMatch(match)
    output += text.slice(cursor, match.index) + (replacementDecorator?.(replacement) ?? replacement)
    cursor = match.index + match[0].length
    if (match[0].length === 0) expression.lastIndex += 1
  }
  return matched ? output + text.slice(cursor) : text
}

function protectedReplacementToken(index: number): string {
  return `\uE000eleckoi-regex:${index}:\uE001`
}

function restoreDecoratedSegments(text: string, protectedSegments: string[]): string {
  return text.replace(/\uE000eleckoi-regex:(\d+):\uE001/g, (token, rawIndex: string) => (
    protectedSegments[Number(rawIndex)] ?? token
  ))
}

export function transformWithRegexRules(
  text: string,
  rules: RegexRule[],
  target: RegexRuleTarget,
  options: RegexTransformOptions = {}
): string {
  if (!text) return text
  const activeRules = rules.filter((rule) => rule.enabled && rule.pattern.trim() && rule.targets.includes(target)
    && (options.isEdit !== true || rule.runOnEdit)
    && (options.depth === undefined || (rule.minDepth == null || rule.minDepth < 0 || options.depth >= rule.minDepth)
      && (rule.maxDepth == null || rule.maxDepth < 0 || options.depth <= rule.maxDepth)))
  const protectedSegments = options.protectDecoratedReplacements ? [] as string[] : null
  const decorateReplacement = options.replacementDecorator
    ? (replacement: string) => {
      const decorated = options.replacementDecorator?.(replacement) ?? replacement
      if (protectedSegments && decorated !== replacement) {
        const index = protectedSegments.push(decorated) - 1
        return protectedReplacementToken(index)
      }
      return decorated
    }
    : undefined
  let output = text
  for (const rule of activeRules) {
    output = applyRule(output, rule, decorateReplacement, options)
  }
  return protectedSegments
    ? restoreDecoratedSegments(output, protectedSegments)
    : output
}

export function ruleAppliesToSurface(rule: RegexRule, surface: RegexRuleSurface, target: RegexRuleTarget): boolean {
  if (surface === 'Stored') return !rule.displayOnly && !rule.promptOnly
  if (surface === 'Display') return rule.displayOnly || (!rule.displayOnly && !rule.promptOnly)
  return rule.promptOnly || (target === 'SettingContent' && !rule.displayOnly && !rule.promptOnly)
}

const scopeKeys: Record<RegexRuleScope, keyof Pick<RegexRuleCollection, 'globalRules' | 'agentPresetRules' | 'characterRules'>> = {
  Global: 'globalRules',
  AgentPreset: 'agentPresetRules',
  Character: 'characterRules'
}

const versionScopeKeys: Record<RegexRuleScope, 'globalEnabledIds' | 'agentPresetEnabledIds' | 'characterEnabledIds'> = {
  Global: 'globalEnabledIds',
  AgentPreset: 'agentPresetEnabledIds',
  Character: 'characterEnabledIds'
}

export function includeImportedRulesInActiveVersion(
  collection: RegexRuleCollection,
  importedRules: Array<{ scope: RegexRuleScope; rule: RegexRule }>
): RegexRuleCollection {
  if (!collection.activeVersionId || importedRules.length === 0) return collection
  const activeVersion = collection.versions.find((version) => version.id === collection.activeVersionId)
  if (!activeVersion) return collection
  const enabledByScope = new Map<RegexRuleScope, string[]>([
    ['Global', []],
    ['AgentPreset', []],
    ['Character', []]
  ])
  importedRules.forEach(({ scope, rule }) => {
    if (rule.enabled) enabledByScope.get(scope)?.push(rule.id)
  })
  return {
    ...collection,
    versions: collection.versions.map((version) => {
      if (version.id !== activeVersion.id) return version
      return (Object.keys(versionScopeKeys) as RegexRuleScope[]).reduce((next, scope) => {
        const key = versionScopeKeys[scope]
        return { ...next, [key]: [...new Set([...next[key], ...(enabledByScope.get(scope) ?? [])])] }
      }, { ...version })
    })
  }
}

export function rulesForSurface(
  collection: RegexRuleCollection,
  target: RegexRuleTarget,
  surface: RegexRuleSurface
): RegexRule[] {
  const activeVersion = collection.versions.find((version) => version.id === collection.activeVersionId)
  return (Object.keys(scopeKeys) as RegexRuleScope[]).flatMap((scope) => {
    const allowedIds = scope === 'Global'
      ? activeVersion?.globalEnabledIds
      : scope === 'AgentPreset'
        ? activeVersion?.agentPresetEnabledIds
      : scope === 'Character'
        ? activeVersion?.characterEnabledIds
        : undefined
    return collection[scopeKeys[scope]]
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => (
        rule.enabled
        && rule.targets.includes(target)
        && ruleAppliesToSurface(rule, surface, target)
        && (allowedIds === undefined || allowedIds.includes(rule.id))
      ))
      .sort((left, right) => left.rule.order - right.rule.order || left.index - right.index)
      .map(({ rule }) => rule)
  })
}

export function transformCollectionSurface(
  text: string,
  collection: RegexRuleCollection,
  target: RegexRuleTarget,
  surface: RegexRuleSurface,
  options: RegexTransformOptions = {}
): string {
  return transformWithRegexRules(text, rulesForSurface(collection, target, surface), target, options)
}
