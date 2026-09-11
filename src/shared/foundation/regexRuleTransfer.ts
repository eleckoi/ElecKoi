import type {
  RegexRule,
  RegexRuleImportDocument,
  RegexRuleScope,
  RegexRuleTarget
} from '@shared/contracts/regex/schemas'

export interface ScopedRegexRule {
  scope: RegexRuleScope
  rule: RegexRule
}

export interface DecodedRegexDocuments {
  rules: ScopedRegexRule[]
  importedFileCount: number
  failedFileNames: string[]
}

const scopes = new Set<RegexRuleScope>(['Global', 'AgentPreset', 'Character'])
const targets = new Set<RegexRuleTarget>(['UserInput', 'AiOutput', 'SlashCommand', 'SettingContent', 'Reasoning'])

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function importedTargets(value: Record<string, unknown>): RegexRuleTarget[] {
  const named = Array.isArray(value.targets)
    ? value.targets.filter((target): target is RegexRuleTarget => typeof target === 'string' && targets.has(target as RegexRuleTarget))
    : []
  if (named.length > 0) return [...new Set(named)]
  const placement = new Set(Array.isArray(value.placement) ? value.placement.filter(Number.isInteger) as number[] : [])
  const mapped: RegexRuleTarget[] = []
  if (placement.has(1)) mapped.push('UserInput')
  if (placement.has(2) || placement.size === 0) mapped.push('AiOutput')
  if (placement.has(3)) mapped.push('SlashCommand')
  if (placement.has(5)) mapped.push('SettingContent')
  if (placement.has(6)) mapped.push('Reasoning')
  return mapped
}

function rootValues(source: string): unknown[] {
  const parsed: unknown = JSON.parse(source.trim())
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== 'object') throw new Error('文件里没有正则规则。')
  const root = parsed as Record<string, unknown>
  for (const key of ['rules', 'regex_scripts', 'regex']) {
    if (Array.isArray(root[key])) return root[key] as unknown[]
  }
  if ('pattern' in root || 'findRegex' in root) return [root]
  throw new Error('文件里没有正则规则。')
}

function decodeDocument(source: string, fallbackScope: RegexRuleScope): ScopedRegexRule[] {
  const values = rootValues(source)
  const rules: ScopedRegexRule[] = []
  values.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return
    const value = candidate as Record<string, unknown>
    const pattern = stringValue(value.pattern) || stringValue(value.findRegex)
    if (!pattern.trim()) return
    const scopeValue = stringValue(value.scope) as RegexRuleScope
    rules.push({
      scope: scopes.has(scopeValue) ? scopeValue : fallbackScope,
      rule: {
        id: `regex-${globalThis.crypto.randomUUID()}`,
        name: (stringValue(value.name) || stringValue(value.scriptName)).trim().slice(0, 60),
        pattern: pattern.slice(0, 4_000),
        replacement: stringValue(value.replacement) || stringValue(value.replaceString),
        targets: importedTargets(value),
        enabled: !booleanValue(value.disabled) && booleanValue(value.enabled, true),
        displayOnly: booleanValue(value.display_only, booleanValue(value.markdownOnly)),
        promptOnly: booleanValue(value.prompt_only, booleanValue(value.promptOnly)),
        runOnEdit: booleanValue(value.run_on_edit, booleanValue(value.runOnEdit)),
        order: index
      }
    })
  })
  return rules
}

export function decodeRegexDocuments(
  documents: RegexRuleImportDocument[],
  fallbackScope: RegexRuleScope
): DecodedRegexDocuments {
  const result: DecodedRegexDocuments = {
    rules: [],
    importedFileCount: 0,
    failedFileNames: []
  }
  documents.forEach((document) => {
    try {
      const rules = decodeDocument(document.json, fallbackScope)
      if (rules.length > 0) {
        result.rules.push(...rules)
        result.importedFileCount += 1
      }
    } catch {
      result.failedFileNames.push(document.displayName)
    }
  })
  return result
}

export function encodeRegexExport(rules: ScopedRegexRule[]): string {
  return JSON.stringify({
    format: 'eleckoi.regex-rules-export',
    version: 2,
    rules: rules.map(({ scope, rule }) => ({
      ...rule,
      scope,
      display_only: rule.displayOnly,
      prompt_only: rule.promptOnly,
      run_on_edit: rule.runOnEdit
    }))
  }, null, 2)
}
