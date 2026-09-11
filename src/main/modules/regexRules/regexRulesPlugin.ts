import type { Context, Plugin } from '@deepseek-ai/cordis'
import { transformWithRegexRules, validateRegexRule } from '@shared/foundation/regex/RegexRuleProcessor'
import { RegexRuleRepository } from './RegexRuleRepository'

export const regexRulesPlugin = {
  name: 'eleckoi-regex-rules',
  inject: ['database', 'desktopGateway', 'agentPresets'],
  provide: 'regexRules',
  apply(ctx: Context) {
    const regexRules = new RegexRuleRepository(ctx.database, ctx.agentPresets)
    ctx.provide('regexRules', regexRules)
    return [
      ctx.desktopGateway.register('query.regex_rules.read', ({ characterId }) => regexRules.get(characterId)),
      ctx.desktopGateway.register('command.regex_rules.save', ({ characterId, collection, expectedRevision }) => {
        const saved = regexRules.save(characterId, collection, expectedRevision)
        ctx.desktopGateway.broadcast('records.changed', { module: 'regexRules' })
        return saved
      }),
      ctx.desktopGateway.register('command.regex_rules.import', ({ characterId, fallbackScope, documents, expectedRevision }) => {
        const result = regexRules.import(characterId, fallbackScope, documents, expectedRevision)
        ctx.desktopGateway.broadcast('records.changed', { module: 'regexRules' })
        return result
      }),
      ctx.desktopGateway.register('command.regex_rules.export', ({ characterId, ruleIds }) => (
        regexRules.export(characterId, ruleIds)
      )),
      ctx.desktopGateway.register('command.regex_rules.test', ({ text, rule, target }) => ({
        output: transformWithRegexRules(text, [rule], target),
        validationMessage: validateRegexRule(rule)
      }))
    ]
  }
} satisfies Plugin.Object
