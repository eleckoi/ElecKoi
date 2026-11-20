import type { Context } from '@deepseek-ai/cordis'
import type { SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@eleckoi/dsh-product-api/remote'
import type {} from '@eleckoi/dsh-client-characters/client'
import type {} from '@eleckoi/dsh-client-characters/slots'
import type {} from '@eleckoi/dsh-client-character-configuration/client'
import type {} from '@eleckoi/dsh-client-conversations/client'
import type {} from '@eleckoi/dsh-client-creator-studio/client'
import type {} from '@eleckoi/dsh-client-display-preferences/client'
import type {} from '@eleckoi/dsh-client-models/client'
import type {} from '@eleckoi/dsh-client-persona/client'
import type {} from '@eleckoi/dsh-client-presets/client'
import type {} from '@eleckoi/dsh-client-presets/slots'
import type {} from '@eleckoi/dsh-client-roleplay/slots'
import type {} from '@eleckoi/dsh-client-web-search/client'
import type { ILayout } from '@eleckoi/dsh-client-shell/client'
import type { SettingLibrary, SettingLibraryEntry, RegexRule, PersonaProfile } from '@eleckoi/dsh-product-api/types'

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type SuccessValue<T> = T extends { ok: true; value: infer V } ? V : never
type RemoteValue<T extends (...args: any[]) => any> = SuccessValue<Awaited<ReturnType<T>>>

export type CharacterEditorSlotIsReplaceable = Assert<Same<SlotMap['eleckoi.character.editor.card']['kind'], 'chain'>>
export type PresetManagerSlotIsReplaceable = Assert<Same<SlotMap['eleckoi.preset.manager']['kind'], 'chain'>>
export type CharacterEditorToolbarCanSave = Assert<Same<SlotMap['eleckoi.character.editor.toolbar']['owner']['onSave'], () => Promise<boolean>>>
export type CharacterMenuIsAppendable = Assert<Same<SlotMap['eleckoi.character.library.item.menu.actions']['kind'], 'list'>>
export type PresetPreviewCanActivate = Assert<Same<SlotMap['eleckoi.preset.page.preview']['owner']['onActivate'], () => Promise<void>>>
export type PresetBulkMenuMode = Assert<Same<SlotMap['eleckoi.preset.library.menu.actions']['owner']['menu'], 'create' | 'bulk' | 'export'>>
export type RoleplayEditorSave = Assert<Same<SlotMap['eleckoi.roleplay.message.editor']['owner']['onSave'], () => Promise<void>>>
export type RoleplayMainMenuDismiss = Assert<Same<SlotMap['eleckoi.roleplay.conversation.input.menu.actions']['owner']['onDismiss'], () => void>>

export type SettingReadMatchesRemote = Assert<Same<Awaited<ReturnType<Context['eleckoiSettingLibraries']['read']>>,
  RemoteValue<Context['remote']['eleckoiCharacterConfiguration']['readSettingLibrary']>>>
export type RegexExportMatchesRemote = Assert<Same<Awaited<ReturnType<Context['eleckoiRegexRules']['export']>>,
  RemoteValue<Context['remote']['eleckoiCharacterConfiguration']['exportRegexRules']>>>
export type SettingResetMatchesRemote = Assert<Same<Awaited<ReturnType<Context['eleckoiSettingLibraries']['resetConversation']>>,
  RemoteValue<Context['remote']['eleckoiCharacterConfiguration']['resetConversationSettingLibrary']>>>
export type PersonaSaveMatchesRemote = Assert<Same<Awaited<ReturnType<Context['eleckoiPersona']['save']>>,
  RemoteValue<Context['remote']['eleckoiPersona']['save']>>>
export type PresetRuleBaselineMatchesRemote = Assert<Same<Parameters<Context['eleckoiPresets']['save']>[1],
  Parameters<Context['remote']['eleckoiAgentPresets']['save']>[1]>>
export type LayoutUsesOfficialType = Assert<Same<Context['layout'], ILayout>>

export async function publicClientConsumer(ctx: Context, library: SettingLibrary, profile: PersonaProfile, rules: RegexRule[]) {
  const complete = await ctx.eleckoiSettingLibraries.read('synthetic-character')
  const entry: SettingLibraryEntry | undefined = complete.entries[0]
  if (entry) {
    const readStrategy: SettingLibraryEntry['agentReadStrategy'] = entry.agentReadStrategy
    const position: SettingLibraryEntry['position'] = entry.position
    const trigger: SettingLibraryEntry['triggerMode'] = entry.triggerMode
    void [readStrategy, position, trigger]
  }
  await ctx.eleckoiSettingLibraries.save('synthetic-character', library)
  await ctx.eleckoiPersona.save(profile)
  await ctx.eleckoiPresets.save(await ctx.eleckoiPresets.read('synthetic-preset'), rules)
  await ctx.eleckoiConversations.send({ conversationId: 'synthetic-chat', requestId: 'synthetic-request',
    text: '合成测试输入', files: ['synthetic-receipt'] })
  await ctx.eleckoiConversations.readAuthorState('synthetic-chat')
  await ctx.eleckoiConversations.replaceAuthorVariableState('synthetic-chat', { count: 1 })
  ctx.layout.openRightbar(true, false)

  // @ts-expect-error 角色配置必须提供角色编号。
  await ctx.eleckoiSettingLibraries.read()
  // @ts-expect-error 输入中的文件必须是官方上传返回的 receipt 编号。
  await ctx.eleckoiConversations.send({ conversationId: 'synthetic-chat', requestId: 'synthetic-request', files: [{ receiptId: 'synthetic-receipt' }] })
  // @ts-expect-error 密钥查看只接受配置编号。
  await ctx.eleckoiModels.revealApiKey(1)
  // @ts-expect-error 正则配置没有保存折叠状态的方法。
  await ctx.eleckoiRegexRules.saveViewState('synthetic-character', [])
}
