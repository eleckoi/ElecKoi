import { z } from 'zod'
import {
  characterCollectionSchema,
  characterRecordSchema,
  conversationMetadataSchema,
  conversationSchema,
  agentProcessItemSchema,
  chatImageMediaTypeSchema,
  encodedChatImageAttachmentSchema,
  messageSchema,
  modelConfigSchema,
  modelOptionSchema,
  modelProviderIdSchema,
  personaSchema
} from '../entities/schemas'
import {
  appearanceModeSchema,
  resolvedAppearanceModeSchema,
  settingKeySchema
} from '../settings/schemas'
import { settingLibrarySchema } from '../settingLibrary/schemas'
import { variableConfigSchema } from '../variables/schemas'
import { variableViewerTimelineSchema } from '../variables/viewer'
import {
  characterImportFileSchema,
  characterImportPreviewSchema,
  characterImportResultSchema,
  characterImportSourceSchema
} from '../characters/transfer'
import {
  regexRuleCollectionSchema,
  regexRuleImportDocumentSchema,
  regexRuleImportResultSchema,
  regexRuleSchema,
  regexRuleScopeSchema,
  regexRuleTargetSchema,
  regexRuleTestResultSchema
} from '../regex/schemas'
import { defineRoute } from './define'
import { agentGenerationStatsSchema } from '../agent/generationStats'
import {
  tavilyConnectionSchema,
  webSearchSettingsSchema,
  webSearchSettingsUpdateSchema
} from '../agent/webSearch'
import {
  agentPresetCatalogSchema,
  agentPresetExportResultSchema,
  agentPresetImportDocumentSchema,
  agentPresetImportResultSchema,
  agentPresetImportSourceSchema,
  agentPresetSchema
} from '../presets/schemas'
import { updateInstallResultSchema, updateStatusSchema } from '../updates/schemas'

const empty = z.object({})
const conversationDetails = z.object({
  conversation: conversationSchema,
  metadata: conversationMetadataSchema,
  messages: z.array(messageSchema),
  hasMore: z.boolean(),
  beforeSequence: z.number().int().nullable()
})
const conversationSummary = conversationSchema.extend({ metadata: conversationMetadataSchema })
const roleplayRichHeightSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  contentRevision: z.string().min(1),
  rootIndex: z.number().int().min(0).max(1_024),
  viewportWidthPx: z.number().int().min(1).max(16_384),
  heightPx: z.number().int().min(1).max(100_000),
  measuredAtEpochMs: z.number().int().nonnegative()
})

export const requestContracts = {
  'query.conversations.messages': defineRoute(z.object({
    conversationId: z.string().min(1), beforeSequence: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(200).optional()
  }), z.object({ messages: z.array(messageSchema), hasMore: z.boolean(), beforeSequence: z.number().int().nullable() })),
  'query.conversations.list': defineRoute(empty, z.array(conversationSummary)),
  'query.conversations.details': defineRoute(
    z.object({ conversationId: z.string().min(1) }),
    conversationDetails
  ),
  'query.conversations.variable_timeline': defineRoute(
    z.object({ conversationId: z.string().min(1) }),
    variableViewerTimelineSchema
  ),
  'query.conversations.rich_heights': defineRoute(
    z.object({ conversationId: z.string().min(1) }),
    z.array(roleplayRichHeightSchema)
  ),
  'command.conversations.rich_height.save': defineRoute(
    roleplayRichHeightSchema.omit({ measuredAtEpochMs: true }),
    roleplayRichHeightSchema
  ),
  'command.conversations.create': defineRoute(z.object({
    title: z.string().optional(),
    metadata: conversationMetadataSchema.partial().optional()
  }), conversationDetails),
  'command.conversations.delete': defineRoute(
    z.object({ conversationId: z.string().min(1) }),
    z.object({ ok: z.literal(true) })
  ),
  'command.conversations.opening.select': defineRoute(
    z.object({ conversationId: z.string().min(1), openingId: z.string().min(1) }),
    conversationDetails
  ),
  'command.conversations.opening.update': defineRoute(
    z.object({ conversationId: z.string().min(1), content: z.string().trim().min(1) }),
    conversationDetails
  ),
  'query.persona.read': defineRoute(empty, personaSchema),
  'command.persona.save': defineRoute(personaSchema, personaSchema),
  'query.characters.list': defineRoute(empty, characterCollectionSchema),
  'command.characters.create': defineRoute(characterRecordSchema, characterCollectionSchema),
  'command.characters.update': defineRoute(characterRecordSchema, characterCollectionSchema),
  'command.character_groups.save': defineRoute(z.object({
    groups: z.array(z.string()),
    assignments: z.array(z.object({ characterId: z.string().min(1), group: z.string().min(1) }))
  }), characterCollectionSchema),
  'command.characters.delete': defineRoute(
    z.object({ characterIds: z.array(z.string()) }),
    characterCollectionSchema
  ),
  'command.characters.import.prepare': defineRoute(
    z.object({
      source: characterImportSourceSchema,
      files: z.array(characterImportFileSchema).min(1).max(50)
    }),
    characterImportPreviewSchema
  ),
  'command.characters.import.commit': defineRoute(
    z.object({ token: z.string().min(1) }),
    characterImportResultSchema
  ),
  'command.characters.import.discard': defineRoute(
    z.object({ token: z.string().min(1) }),
    z.object({ ok: z.literal(true) })
  ),
  'query.setting_library.read': defineRoute(
    z.object({ characterId: z.string().min(1) }),
    settingLibrarySchema
  ),
  'command.setting_library.save': defineRoute(
    z.object({ characterId: z.string().min(1), library: settingLibrarySchema }),
    settingLibrarySchema
  ),
  'command.setting_library.view_state.save': defineRoute(
    z.object({ characterId: z.string().min(1), expandedGroupIds: z.array(z.string()) }),
    z.array(z.string())
  ),
  'query.variable_config.read': defineRoute(
    z.object({ characterId: z.string().min(1) }),
    variableConfigSchema
  ),
  'command.variable_config.save': defineRoute(
    z.object({ characterId: z.string().min(1), config: variableConfigSchema }),
    variableConfigSchema
  ),
  'command.variable_config.view_state.save': defineRoute(
    z.object({ characterId: z.string().min(1), expandedObjectIds: z.array(z.string()) }),
    z.array(z.string())
  ),
  'query.regex_rules.read': defineRoute(
    z.object({ characterId: z.string().min(1) }),
    regexRuleCollectionSchema
  ),
  'command.regex_rules.save': defineRoute(
    z.object({
      characterId: z.string().min(1),
      collection: regexRuleCollectionSchema,
      expectedRevision: z.number().int().nonnegative()
    }),
    regexRuleCollectionSchema
  ),
  'command.regex_rules.import': defineRoute(
    z.object({
      characterId: z.string().min(1),
      fallbackScope: regexRuleScopeSchema,
      documents: z.array(regexRuleImportDocumentSchema).min(1).max(100),
      expectedRevision: z.number().int().nonnegative()
    }),
    regexRuleImportResultSchema
  ),
  'command.regex_rules.export': defineRoute(
    z.object({ characterId: z.string().min(1), ruleIds: z.array(z.string()).min(1) }),
    z.object({ fileName: z.string(), json: z.string() })
  ),
  'command.regex_rules.test': defineRoute(
    z.object({ text: z.string().max(2 * 1024 * 1024), rule: regexRuleSchema, target: regexRuleTargetSchema }),
    regexRuleTestResultSchema
  ),
  'query.agent_presets.catalog': defineRoute(empty, agentPresetCatalogSchema),
  'query.agent_presets.read': defineRoute(
    z.object({ presetId: z.string().min(1) }),
    agentPresetSchema
  ),
  'command.agent_presets.save': defineRoute(
    z.object({ preset: agentPresetSchema }),
    agentPresetSchema
  ),
  'command.agent_presets.create': defineRoute(
    z.object({ name: z.string().max(60), libraryGroupId: z.string() }),
    agentPresetSchema
  ),
  'command.agent_presets.import': defineRoute(
    z.object({ source: agentPresetImportSourceSchema, document: agentPresetImportDocumentSchema }),
    agentPresetImportResultSchema
  ),
  'command.agent_presets.export': defineRoute(
    z.object({ presetId: z.string().min(1) }),
    agentPresetExportResultSchema
  ),
  'command.agent_presets.set_active': defineRoute(
    z.object({ presetId: z.string().min(1) }),
    agentPresetCatalogSchema
  ),
  'command.agent_presets.groups.create': defineRoute(
    z.object({ name: z.string().max(60) }),
    agentPresetCatalogSchema
  ),
  'command.agent_presets.groups.rename': defineRoute(
    z.object({ groupId: z.string().min(1), name: z.string().max(60) }),
    agentPresetCatalogSchema
  ),
  'command.agent_presets.groups.delete': defineRoute(
    z.object({ groupId: z.string().min(1) }),
    agentPresetCatalogSchema
  ),
  'command.agent_presets.delete': defineRoute(
    z.object({ presetId: z.string().min(1) }),
    agentPresetCatalogSchema
  ),
  'query.models.list': defineRoute(empty, z.array(modelConfigSchema)),
  'command.models.save': defineRoute(
    modelConfigSchema.partial({ id: true }),
    z.array(modelConfigSchema)
  ),
  'command.models.delete': defineRoute(
    z.object({ configId: z.string().min(1) }),
    z.array(modelConfigSchema)
  ),
  'command.models.delete_provider': defineRoute(
    z.object({ provider: modelProviderIdSchema }),
    z.array(modelConfigSchema)
  ),
  'query.models.options': defineRoute(modelConfigSchema, z.object({
    items: z.array(modelOptionSchema),
    config: modelConfigSchema
  })),
  'command.models.test_connection': defineRoute(modelConfigSchema, z.object({ ok: z.literal(true) })),
  'query.agent_tools.web_search.settings': defineRoute(empty, webSearchSettingsSchema),
  'command.agent_tools.web_search.update': defineRoute(webSearchSettingsUpdateSchema, webSearchSettingsSchema),
  'command.agent_tools.web_search.tavily.save_and_test': defineRoute(
    z.object({ apiKey: z.string().trim().min(1).max(2_048) }),
    z.object({ settings: webSearchSettingsSchema, connection: tavilyConnectionSchema })
  ),
  'command.agent_tools.web_search.tavily.test': defineRoute(
    z.object({ apiKey: z.string().trim().max(2_048).optional() }),
    z.object({ connection: tavilyConnectionSchema })
  ),
  'command.agent_tools.web_search.tavily.remove': defineRoute(empty, webSearchSettingsSchema),
  'query.settings.read': defineRoute(z.object({ key: settingKeySchema }), z.unknown()),
  'command.settings.write': defineRoute(
    z.object({ key: settingKeySchema, value: z.unknown() }),
    z.unknown()
  ),
  'command.appearance.set_mode': defineRoute(
    z.object({ mode: appearanceModeSchema }),
    z.object({ mode: appearanceModeSchema, resolved: resolvedAppearanceModeSchema })
  ),
  'command.author_sdk.invoke': defineRoute(
    z.object({
      conversationId: z.string().min(1),
      messageId: z.string().min(1),
      request: z.string().min(1).max(512 * 1024)
    }),
    z.object({ response: z.string() })
  ),
  'command.agent.start': defineRoute(
    z.object({
      conversationId: z.string().min(1),
      text: z.string(),
      images: z.array(encodedChatImageAttachmentSchema).max(4).optional()
    }).refine((input) => input.text.trim().length > 0 || Boolean(input.images?.length), {
      message: '消息或图片不能同时为空。'
    }),
    z.object({
      accepted: z.literal(true),
      conversationId: z.string(),
      runId: z.string(),
      messageId: z.string()
    })
  ),
  'command.agent.cancel': defineRoute(
    z.object({ conversationId: z.string().min(1) }),
    z.object({ cancelled: z.boolean() })
  ),
  'command.agent.regenerate': defineRoute(
    z.object({ conversationId: z.string().min(1), targetMessageId: z.string().min(1), replacementMessage: z.string().nullable().optional() }),
    z.object({ accepted: z.literal(true), conversationId: z.string(), runId: z.string(), messageId: z.string() })
  ),
  'query.agent.inspect': defineRoute(
    z.object({ conversationId: z.string().min(1) }),
    z.discriminatedUnion('active', [
      z.object({ active: z.literal(false), conversationId: z.string() }),
      z.object({
        active: z.literal(true),
        conversationId: z.string(),
        runId: z.string(),
        messageId: z.string(),
        accumulated: z.string(),
        sequence: z.number().int().nonnegative()
      })
    ])
  ),
  'query.agent.generation_stats': defineRoute(
    z.object({ conversationId: z.string().min(1) }),
    z.object({ conversationId: z.string(), stats: agentGenerationStatsSchema.nullable() })
  ),
  'query.agent.image': defineRoute(
    z.object({ conversationId: z.string().min(1), attachmentId: z.string().min(1) }),
    z.object({ mediaType: chatImageMediaTypeSchema, data: z.string().min(1) })
  ),
  'query.updates.status': defineRoute(empty, updateStatusSchema),
  'command.updates.check': defineRoute(empty, updateStatusSchema),
  'command.updates.download': defineRoute(empty, updateStatusSchema),
  'command.updates.install': defineRoute(empty, updateInstallResultSchema),
  'command.window.control': defineRoute(
    z.object({ action: z.enum(['minimize', 'maximize', 'close']) }),
    z.object({ ok: z.literal(true) })
  )
} as const

export const eventContracts = {
  'records.changed': z.object({ module: z.enum(['conversations', 'personas', 'models', 'settingLibraries', 'variables', 'regexRules', 'agentPresets', 'agentTools']) }),
  'settings.changed': z.object({ key: z.string(), value: z.unknown() }),
  'agent.output.delta': z.object({
    conversationId: z.string(),
    runId: z.string(),
    messageId: z.string(),
    sequence: z.number().int().positive(),
    delta: z.string()
  }),
  'agent.run.finished': z.object({
    conversationId: z.string(),
    runId: z.string(),
    message: messageSchema
  }),
  'agent.run.failed': z.object({
    conversationId: z.string(),
    runId: z.string(),
    messageId: z.string(),
    code: z.string(),
    message: z.string()
  }),
  'agent.state.changed': z.object({
    conversationId: z.string(),
    state: z.enum(['idle', 'starting', 'streaming', 'stopping', 'error']),
    detail: z.string().optional()
  }),
  'agent.process.updated': z.object({
    conversationId: z.string(),
    runId: z.string(),
    messageId: z.string(),
    item: agentProcessItemSchema
  }),
  'agent.generation.stats': z.object({
    conversationId: z.string(),
    runId: z.string(),
    stats: agentGenerationStatsSchema
  }),
  'updates.state.changed': updateStatusSchema
} as const

export type RequestContracts = typeof requestContracts
export type EventContracts = typeof eventContracts
export type RequestName = keyof RequestContracts
export type EventName = keyof EventContracts
