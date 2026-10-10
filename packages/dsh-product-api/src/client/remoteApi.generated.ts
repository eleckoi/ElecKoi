/** 由 pnpm generate:plugin-docs 生成。Remote 调用声明直接使用官方 Host-for-Client 生成结果。 */
export const REMOTE_API = [
  {
    "namespace": "eleckoiAgentPresets",
    "hostService": "eleckoiAgentPresetsApi",
    "methods": [
      {
        "name": "assignGroup"
      },
      {
        "name": "catalog"
      },
      {
        "name": "create"
      },
      {
        "name": "createGroup"
      },
      {
        "name": "delete"
      },
      {
        "name": "deleteGroup"
      },
      {
        "name": "export"
      },
      {
        "name": "import"
      },
      {
        "name": "read"
      },
      {
        "name": "renameGroup"
      },
      {
        "name": "save"
      },
      {
        "name": "setActive"
      }
    ]
  },
  {
    "namespace": "eleckoiAuthorPlugins",
    "hostService": "eleckoiAuthorPluginsApi",
    "methods": [
      {
        "name": "capabilities"
      },
      {
        "name": "changes",
        "mode": "stream"
      },
      {
        "name": "invoke"
      }
    ]
  },
  {
    "namespace": "eleckoiCharacterConfiguration",
    "hostService": "eleckoiCharacterConfigurationApi",
    "methods": [
      {
        "name": "changes",
        "mode": "stream"
      },
      {
        "name": "exportRegexRules"
      },
      {
        "name": "importRegexRules"
      },
      {
        "name": "readConversationSettingLibraries"
      },
      {
        "name": "readRegexRules"
      },
      {
        "name": "readSettingLibrary"
      },
      {
        "name": "readVariableConfig"
      },
      {
        "name": "resetConversationSettingLibrary"
      },
      {
        "name": "saveConversationSettingLibrary"
      },
      {
        "name": "saveConversationSettingLibraryVersion"
      },
      {
        "name": "saveRegexRules"
      },
      {
        "name": "saveSettingLibrary"
      },
      {
        "name": "saveSettingLibraryViewState"
      },
      {
        "name": "saveVariableConfig"
      },
      {
        "name": "saveVariableConfigViewState"
      },
      {
        "name": "testRegexRule"
      }
    ]
  },
  {
    "namespace": "eleckoiCharacters",
    "hostService": "eleckoiCharactersApi",
    "methods": [
      {
        "name": "changes",
        "mode": "stream"
      },
      {
        "name": "commitImport"
      },
      {
        "name": "create"
      },
      {
        "name": "delete"
      },
      {
        "name": "discardImport"
      },
      {
        "name": "export"
      },
      {
        "name": "list"
      },
      {
        "name": "prepareImport"
      },
      {
        "name": "saveGroups"
      },
      {
        "name": "select"
      },
      {
        "name": "update"
      }
    ]
  },
  {
    "namespace": "eleckoiCompatibility",
    "hostService": "eleckoiCompatibilityApi",
    "methods": [
      {
        "name": "capabilities"
      },
      {
        "name": "changes",
        "mode": "stream"
      },
      {
        "name": "invoke"
      }
    ]
  },
  {
    "namespace": "eleckoiConversationModels",
    "hostService": "eleckoiConversationModelsApi",
    "methods": [
      {
        "name": "current"
      },
      {
        "name": "select"
      }
    ]
  },
  {
    "namespace": "eleckoiConversations",
    "hostService": "eleckoiConversationsApi",
    "methods": [
      {
        "name": "authorState"
      },
      {
        "name": "changes",
        "mode": "stream"
      },
      {
        "name": "completeGroupRound"
      },
      {
        "name": "create"
      },
      {
        "name": "delete"
      },
      {
        "name": "deleteMessagesFrom"
      },
      {
        "name": "details"
      },
      {
        "name": "editMessage"
      },
      {
        "name": "exportArchive"
      },
      {
        "name": "fork"
      },
      {
        "name": "importArchive"
      },
      {
        "name": "list"
      },
      {
        "name": "preparePrompt"
      },
      {
        "name": "projectDisplay"
      },
      {
        "name": "regenerateMessage"
      },
      {
        "name": "rename"
      },
      {
        "name": "replaceVariableState"
      },
      {
        "name": "requestPreview"
      },
      {
        "name": "requestPreviews",
        "mode": "stream"
      },
      {
        "name": "revealFile"
      },
      {
        "name": "selectOpening"
      },
      {
        "name": "startRegeneration"
      },
      {
        "name": "updateOpening"
      },
      {
        "name": "variableTimeline"
      },
      {
        "name": "waitForGeneration"
      }
    ]
  },
  {
    "namespace": "eleckoiCreatorStudio",
    "hostService": "eleckoiCreatorStudioApi",
    "methods": [
      {
        "name": "changes",
        "mode": "stream"
      },
      {
        "name": "create"
      },
      {
        "name": "delete"
      },
      {
        "name": "list"
      }
    ]
  },
  {
    "namespace": "eleckoiDisplayPreferences",
    "hostService": "eleckoiDisplayPreferencesApi",
    "methods": [
      {
        "name": "read"
      },
      {
        "name": "setChatDisplay"
      },
      {
        "name": "updateUi"
      }
    ]
  },
  {
    "namespace": "eleckoiModels",
    "hostService": "eleckoiModelsApi",
    "methods": [
      {
        "name": "discoverModels"
      },
      {
        "name": "revealApiKey"
      },
      {
        "name": "testConnection"
      }
    ]
  },
  {
    "namespace": "eleckoiPersona",
    "hostService": "eleckoiPersonaApi",
    "methods": [
      {
        "name": "changes",
        "mode": "stream"
      },
      {
        "name": "read"
      },
      {
        "name": "save"
      }
    ]
  },
  {
    "namespace": "eleckoiSystem",
    "hostService": "eleckoiSystemApi",
    "methods": [
      {
        "name": "status"
      }
    ]
  },
  {
    "namespace": "eleckoiWebSearch",
    "hostService": "eleckoiWebSearchApi",
    "methods": [
      {
        "name": "select"
      },
      {
        "name": "selection"
      },
      {
        "name": "testTavily"
      }
    ]
  }
] as const
export const REMOTE_DECLARATION = "/* Generated by @deepseek-ai/dsh-typert-generator from the Host FaceModel — do not edit. */\nimport type {\n  RemoteResult,\n  RemoteStreamHandle,\n  TypertRemoteContribution,\n} from '@deepseek-ai/dsh-typert-protocol'\nimport type { AgentPreset, AgentPresetCatalog, AgentPresetExportFormat, AgentPresetExportResult, AgentPresetImportDocument, AgentPresetImportResult, AgentPresetImportSource, AuthorConversationState, CharacterCollection, CharacterConfigurationChange, CharacterExportFormat, CharacterExportResult, CharacterGroupAssignment, CharacterImportFile, CharacterImportPreview, CharacterImportResult, CharacterImportSource, CharacterRecord, CompatibilityChange, CompatibilityCommand, CompatibilityValue, ConversationChange, ConversationCreateInput, ConversationDetailsMetadata, ConversationMessageDisplayInput, ConversationMessageDisplayResult, ConversationModelSelection, ConversationRequestPreview, ConversationRequestPreviewSummary, ConversationSummary, CreateCreatorProjectInput, CreatorProjectCollection, DisplayPreferencesSnapshot, DisplayPreferenceValue, ElecKoiHostStatus, ModelConnectionInput, ModelDiscoveryInput, ModelDiscoveryResult, PersonaProfile, ProductRecordChange, RegexRule, RegexRuleCollection, RegexRuleImportDocument, RegexRuleImportResult, RegexRuleScope, RegexRuleTarget, RegexRuleTestResult, SettingLibrary, SettingLibraryConversation, TavilyConnection, VariableConfig, VariableViewerTimeline, WebSearchMode } from '@eleckoi/dsh-product-api/types'\n\ndeclare module '@deepseek-ai/dsh-typert-protocol' {\n  interface TypertRemoteNamespace$656c65636b6f694167656e7450726573657473 {\n    assignGroup: (presetId: string, groupId: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    catalog: () => Promise<RemoteResult<AgentPresetCatalog>>\n    create: (name: string, libraryGroupId: string) => Promise<RemoteResult<AgentPreset>>\n    createGroup: (name: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    delete: (presetId: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    deleteGroup: (groupId: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    export: (presetId: string, format: AgentPresetExportFormat) => Promise<RemoteResult<AgentPresetExportResult>>\n    import: (source: AgentPresetImportSource, document: AgentPresetImportDocument) => Promise<RemoteResult<AgentPresetImportResult>>\n    read: (presetId: string) => Promise<RemoteResult<AgentPreset>>\n    renameGroup: (groupId: string, name: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    save: (preset: AgentPreset, expectedRegexRules: RegexRule[]) => Promise<RemoteResult<AgentPreset>>\n    setActive: (presetId: string) => Promise<RemoteResult<AgentPresetCatalog>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f69436861726163746572436f6e66696775726174696f6e {\n    changes: (signal?: AbortSignal) => RemoteStreamHandle<CharacterConfigurationChange, never>\n    exportRegexRules: (characterId: string, ruleIds: string[]) => Promise<RemoteResult<{ fileName: string; json: string; }>>\n    importRegexRules: (characterId: string, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[], expectedRevision: number) => Promise<RemoteResult<RegexRuleImportResult>>\n    readConversationSettingLibraries: (characterId: string) => Promise<RemoteResult<SettingLibraryConversation[]>>\n    readRegexRules: (characterId: string) => Promise<RemoteResult<RegexRuleCollection>>\n    readSettingLibrary: (characterId: string) => Promise<RemoteResult<SettingLibrary>>\n    readVariableConfig: (characterId: string) => Promise<RemoteResult<VariableConfig>>\n    resetConversationSettingLibrary: (characterId: string, conversationId: string) => Promise<RemoteResult<void>>\n    saveConversationSettingLibrary: (characterId: string, conversationId: string, library: SettingLibrary) => Promise<RemoteResult<SettingLibrary>>\n    saveConversationSettingLibraryVersion: (characterId: string, conversationId: string, name: string) => Promise<RemoteResult<SettingLibrary>>\n    saveRegexRules: (characterId: string, collection: RegexRuleCollection, expectedRevision: number) => Promise<RemoteResult<RegexRuleCollection>>\n    saveSettingLibrary: (characterId: string, library: SettingLibrary) => Promise<RemoteResult<SettingLibrary>>\n    saveSettingLibraryViewState: (characterId: string, expandedGroupIds: string[]) => Promise<RemoteResult<string[]>>\n    saveVariableConfig: (characterId: string, config: VariableConfig) => Promise<RemoteResult<VariableConfig>>\n    saveVariableConfigViewState: (characterId: string, expandedObjectIds: string[]) => Promise<RemoteResult<string[]>>\n    testRegexRule: (text: string, rule: RegexRule, target: RegexRuleTarget) => Promise<RemoteResult<RegexRuleTestResult>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f6943686172616374657273 {\n    changes: (signal?: AbortSignal) => RemoteStreamHandle<ProductRecordChange, never>\n    commitImport: (token: string) => Promise<RemoteResult<CharacterImportResult>>\n    create: (character: CharacterRecord) => Promise<RemoteResult<CharacterCollection>>\n    delete: (characterIds: string[]) => Promise<RemoteResult<CharacterCollection>>\n    discardImport: (token: string) => Promise<RemoteResult<void>>\n    export: (characterId: string, format: CharacterExportFormat) => Promise<RemoteResult<CharacterExportResult>>\n    list: () => Promise<RemoteResult<CharacterCollection>>\n    prepareImport: (files: CharacterImportFile[], source: CharacterImportSource) => Promise<RemoteResult<CharacterImportPreview>>\n    saveGroups: (groups: string[], assignments: CharacterGroupAssignment[]) => Promise<RemoteResult<CharacterCollection>>\n    select: (characterId: string) => Promise<RemoteResult<CharacterCollection>>\n    update: (character: CharacterRecord) => Promise<RemoteResult<CharacterCollection>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f69436f6d7061746962696c697479 {\n    capabilities: () => Promise<RemoteResult<{ methods: string[]; version: number; }>>\n    changes: (signal?: AbortSignal) => RemoteStreamHandle<CompatibilityChange, never>\n    invoke: (command: CompatibilityCommand) => Promise<RemoteResult<CompatibilityValue>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f69436f6e766572736174696f6e4d6f64656c73 {\n    current: (conversationId: string) => Promise<RemoteResult<ConversationModelSelection>>\n    select: (conversationId: string, selection: ConversationModelSelection) => Promise<RemoteResult<ConversationModelSelection>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f69436f6e766572736174696f6e73 {\n    authorState: (conversationId: string) => Promise<RemoteResult<AuthorConversationState>>\n    changes: (signal?: AbortSignal) => RemoteStreamHandle<ConversationChange, never>\n    completeGroupRound: (conversationId: string, cancelled: boolean, signal?: AbortSignal) => Promise<RemoteResult<{ cancelled: boolean; }>>\n    create: (input: ConversationCreateInput) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    delete: (conversationId: string) => Promise<RemoteResult<void>>\n    deleteMessagesFrom: (conversationId: string, eventSeq: number, role: 'user' | 'assistant') => Promise<RemoteResult<{ details: ConversationDetailsMetadata; deletedMessageCount: number; remainingMessageCount: number; }>>\n    details: (conversationId: string, beforeSequence?: number, limit?: number) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    editMessage: (conversationId: string, eventSeq: number, role: 'user' | 'assistant', content: string) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    exportArchive: (conversationId: string) => Promise<RemoteResult<string>>\n    fork: (conversationId: string, atSeq: number | undefined, retainedTurnIds: string[], title: string) => Promise<RemoteResult<string>>\n    importArchive: (characterId: string, json: string) => Promise<RemoteResult<string>>\n    list: (signal?: AbortSignal) => Promise<RemoteResult<ConversationSummary[]>>\n    preparePrompt: (conversationId: string, text: string, signal?: AbortSignal) => Promise<RemoteResult<{ runtimeSessionId: string; operationId: string; }>>\n    projectDisplay: (conversationId: string, messages: ConversationMessageDisplayInput[]) => Promise<RemoteResult<ConversationMessageDisplayResult[]>>\n    regenerateMessage: (conversationId: string, eventSeq: number, requestId: string, replacementMessage?: string) => Promise<RemoteResult<{ runtimeSessionId: string; prepared: true; operationId: string; }>>\n    rename: (conversationId: string, title: string) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    replaceVariableState: (conversationId: string, stateJson: string) => Promise<RemoteResult<string>>\n    requestPreview: (conversationId: string, requestId: string, signal?: AbortSignal) => Promise<RemoteResult<ConversationRequestPreview>>\n    requestPreviews: (conversationId: string, signal?: AbortSignal) => RemoteStreamHandle<ConversationRequestPreviewSummary[], never>\n    revealFile: (conversationId: string, attachmentId: string, name: string, signal?: AbortSignal) => Promise<RemoteResult<void>>\n    selectOpening: (conversationId: string, openingId: string) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    startRegeneration: (conversationId: string, requestId: string, cancelled: boolean) => Promise<RemoteResult<{ accepted: boolean; turn?: number; }>>\n    updateOpening: (conversationId: string, content: string) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    variableTimeline: (conversationId: string) => Promise<RemoteResult<VariableViewerTimeline>>\n    waitForGeneration: (conversationId: string, operationId: string) => Promise<RemoteResult<void>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f6943726561746f7253747564696f {\n    changes: (signal?: AbortSignal) => RemoteStreamHandle<ProductRecordChange, never>\n    create: (input: CreateCreatorProjectInput) => Promise<RemoteResult<CreatorProjectCollection>>\n    delete: (projectId: string) => Promise<RemoteResult<CreatorProjectCollection>>\n    list: () => Promise<RemoteResult<CreatorProjectCollection>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f69446973706c6179507265666572656e636573 {\n    read: () => Promise<RemoteResult<DisplayPreferencesSnapshot>>\n    setChatDisplay: (chatDisplay: Record<string, DisplayPreferenceValue>, expectedRevision?: number) => Promise<RemoteResult<DisplayPreferencesSnapshot>>\n    updateUi: (ui: Record<string, DisplayPreferenceValue>, expectedRevision?: number) => Promise<RemoteResult<DisplayPreferencesSnapshot>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f694d6f64656c73 {\n    discoverModels: (input: ModelDiscoveryInput) => Promise<RemoteResult<ModelDiscoveryResult[]>>\n    revealApiKey: (configId: string) => Promise<RemoteResult<string>>\n    testConnection: (input: ModelConnectionInput) => Promise<RemoteResult<{ supported: true; }>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f69506572736f6e61 {\n    changes: (signal?: AbortSignal) => RemoteStreamHandle<ProductRecordChange, never>\n    read: () => Promise<RemoteResult<PersonaProfile>>\n    save: (profile: PersonaProfile) => Promise<RemoteResult<PersonaProfile>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f6953797374656d {\n    status: () => Promise<RemoteResult<ElecKoiHostStatus>>\n  }\n  interface TypertRemoteNamespace$656c65636b6f69576562536561726368 {\n    select: (mode: WebSearchMode) => Promise<RemoteResult<WebSearchMode>>\n    selection: () => Promise<RemoteResult<WebSearchMode>>\n    testTavily: (apiKey?: string, signal?: AbortSignal) => Promise<RemoteResult<TavilyConnection>>\n  }\n  interface TypertRemoteMap {\n    'eleckoiAgentPresets/assignGroup': (presetId: string, groupId: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    'eleckoiAgentPresets/catalog': () => Promise<RemoteResult<AgentPresetCatalog>>\n    'eleckoiAgentPresets/create': (name: string, libraryGroupId: string) => Promise<RemoteResult<AgentPreset>>\n    'eleckoiAgentPresets/createGroup': (name: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    'eleckoiAgentPresets/delete': (presetId: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    'eleckoiAgentPresets/deleteGroup': (groupId: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    'eleckoiAgentPresets/export': (presetId: string, format: AgentPresetExportFormat) => Promise<RemoteResult<AgentPresetExportResult>>\n    'eleckoiAgentPresets/import': (source: AgentPresetImportSource, document: AgentPresetImportDocument) => Promise<RemoteResult<AgentPresetImportResult>>\n    'eleckoiAgentPresets/read': (presetId: string) => Promise<RemoteResult<AgentPreset>>\n    'eleckoiAgentPresets/renameGroup': (groupId: string, name: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    'eleckoiAgentPresets/save': (preset: AgentPreset, expectedRegexRules: RegexRule[]) => Promise<RemoteResult<AgentPreset>>\n    'eleckoiAgentPresets/setActive': (presetId: string) => Promise<RemoteResult<AgentPresetCatalog>>\n    'eleckoiCharacterConfiguration/changes': (signal?: AbortSignal) => RemoteStreamHandle<CharacterConfigurationChange, never>\n    'eleckoiCharacterConfiguration/exportRegexRules': (characterId: string, ruleIds: string[]) => Promise<RemoteResult<{ fileName: string; json: string; }>>\n    'eleckoiCharacterConfiguration/importRegexRules': (characterId: string, fallbackScope: RegexRuleScope, documents: RegexRuleImportDocument[], expectedRevision: number) => Promise<RemoteResult<RegexRuleImportResult>>\n    'eleckoiCharacterConfiguration/readConversationSettingLibraries': (characterId: string) => Promise<RemoteResult<SettingLibraryConversation[]>>\n    'eleckoiCharacterConfiguration/readRegexRules': (characterId: string) => Promise<RemoteResult<RegexRuleCollection>>\n    'eleckoiCharacterConfiguration/readSettingLibrary': (characterId: string) => Promise<RemoteResult<SettingLibrary>>\n    'eleckoiCharacterConfiguration/readVariableConfig': (characterId: string) => Promise<RemoteResult<VariableConfig>>\n    'eleckoiCharacterConfiguration/resetConversationSettingLibrary': (characterId: string, conversationId: string) => Promise<RemoteResult<void>>\n    'eleckoiCharacterConfiguration/saveConversationSettingLibrary': (characterId: string, conversationId: string, library: SettingLibrary) => Promise<RemoteResult<SettingLibrary>>\n    'eleckoiCharacterConfiguration/saveConversationSettingLibraryVersion': (characterId: string, conversationId: string, name: string) => Promise<RemoteResult<SettingLibrary>>\n    'eleckoiCharacterConfiguration/saveRegexRules': (characterId: string, collection: RegexRuleCollection, expectedRevision: number) => Promise<RemoteResult<RegexRuleCollection>>\n    'eleckoiCharacterConfiguration/saveSettingLibrary': (characterId: string, library: SettingLibrary) => Promise<RemoteResult<SettingLibrary>>\n    'eleckoiCharacterConfiguration/saveSettingLibraryViewState': (characterId: string, expandedGroupIds: string[]) => Promise<RemoteResult<string[]>>\n    'eleckoiCharacterConfiguration/saveVariableConfig': (characterId: string, config: VariableConfig) => Promise<RemoteResult<VariableConfig>>\n    'eleckoiCharacterConfiguration/saveVariableConfigViewState': (characterId: string, expandedObjectIds: string[]) => Promise<RemoteResult<string[]>>\n    'eleckoiCharacterConfiguration/testRegexRule': (text: string, rule: RegexRule, target: RegexRuleTarget) => Promise<RemoteResult<RegexRuleTestResult>>\n    'eleckoiCharacters/changes': (signal?: AbortSignal) => RemoteStreamHandle<ProductRecordChange, never>\n    'eleckoiCharacters/commitImport': (token: string) => Promise<RemoteResult<CharacterImportResult>>\n    'eleckoiCharacters/create': (character: CharacterRecord) => Promise<RemoteResult<CharacterCollection>>\n    'eleckoiCharacters/delete': (characterIds: string[]) => Promise<RemoteResult<CharacterCollection>>\n    'eleckoiCharacters/discardImport': (token: string) => Promise<RemoteResult<void>>\n    'eleckoiCharacters/export': (characterId: string, format: CharacterExportFormat) => Promise<RemoteResult<CharacterExportResult>>\n    'eleckoiCharacters/list': () => Promise<RemoteResult<CharacterCollection>>\n    'eleckoiCharacters/prepareImport': (files: CharacterImportFile[], source: CharacterImportSource) => Promise<RemoteResult<CharacterImportPreview>>\n    'eleckoiCharacters/saveGroups': (groups: string[], assignments: CharacterGroupAssignment[]) => Promise<RemoteResult<CharacterCollection>>\n    'eleckoiCharacters/select': (characterId: string) => Promise<RemoteResult<CharacterCollection>>\n    'eleckoiCharacters/update': (character: CharacterRecord) => Promise<RemoteResult<CharacterCollection>>\n    'eleckoiCompatibility/capabilities': () => Promise<RemoteResult<{ methods: string[]; version: number; }>>\n    'eleckoiCompatibility/changes': (signal?: AbortSignal) => RemoteStreamHandle<CompatibilityChange, never>\n    'eleckoiCompatibility/invoke': (command: CompatibilityCommand) => Promise<RemoteResult<CompatibilityValue>>\n    'eleckoiConversationModels/current': (conversationId: string) => Promise<RemoteResult<ConversationModelSelection>>\n    'eleckoiConversationModels/select': (conversationId: string, selection: ConversationModelSelection) => Promise<RemoteResult<ConversationModelSelection>>\n    'eleckoiConversations/authorState': (conversationId: string) => Promise<RemoteResult<AuthorConversationState>>\n    'eleckoiConversations/changes': (signal?: AbortSignal) => RemoteStreamHandle<ConversationChange, never>\n    'eleckoiConversations/completeGroupRound': (conversationId: string, cancelled: boolean, signal?: AbortSignal) => Promise<RemoteResult<{ cancelled: boolean; }>>\n    'eleckoiConversations/create': (input: ConversationCreateInput) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    'eleckoiConversations/delete': (conversationId: string) => Promise<RemoteResult<void>>\n    'eleckoiConversations/deleteMessagesFrom': (conversationId: string, eventSeq: number, role: 'user' | 'assistant') => Promise<RemoteResult<{ details: ConversationDetailsMetadata; deletedMessageCount: number; remainingMessageCount: number; }>>\n    'eleckoiConversations/details': (conversationId: string, beforeSequence?: number, limit?: number) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    'eleckoiConversations/editMessage': (conversationId: string, eventSeq: number, role: 'user' | 'assistant', content: string) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    'eleckoiConversations/exportArchive': (conversationId: string) => Promise<RemoteResult<string>>\n    'eleckoiConversations/fork': (conversationId: string, atSeq: number | undefined, retainedTurnIds: string[], title: string) => Promise<RemoteResult<string>>\n    'eleckoiConversations/importArchive': (characterId: string, json: string) => Promise<RemoteResult<string>>\n    'eleckoiConversations/list': (signal?: AbortSignal) => Promise<RemoteResult<ConversationSummary[]>>\n    'eleckoiConversations/preparePrompt': (conversationId: string, text: string, signal?: AbortSignal) => Promise<RemoteResult<{ runtimeSessionId: string; operationId: string; }>>\n    'eleckoiConversations/projectDisplay': (conversationId: string, messages: ConversationMessageDisplayInput[]) => Promise<RemoteResult<ConversationMessageDisplayResult[]>>\n    'eleckoiConversations/regenerateMessage': (conversationId: string, eventSeq: number, requestId: string, replacementMessage?: string) => Promise<RemoteResult<{ runtimeSessionId: string; prepared: true; operationId: string; }>>\n    'eleckoiConversations/rename': (conversationId: string, title: string) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    'eleckoiConversations/replaceVariableState': (conversationId: string, stateJson: string) => Promise<RemoteResult<string>>\n    'eleckoiConversations/requestPreview': (conversationId: string, requestId: string, signal?: AbortSignal) => Promise<RemoteResult<ConversationRequestPreview>>\n    'eleckoiConversations/requestPreviews': (conversationId: string, signal?: AbortSignal) => RemoteStreamHandle<ConversationRequestPreviewSummary[], never>\n    'eleckoiConversations/revealFile': (conversationId: string, attachmentId: string, name: string, signal?: AbortSignal) => Promise<RemoteResult<void>>\n    'eleckoiConversations/selectOpening': (conversationId: string, openingId: string) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    'eleckoiConversations/startRegeneration': (conversationId: string, requestId: string, cancelled: boolean) => Promise<RemoteResult<{ accepted: boolean; turn?: number; }>>\n    'eleckoiConversations/updateOpening': (conversationId: string, content: string) => Promise<RemoteResult<ConversationDetailsMetadata>>\n    'eleckoiConversations/variableTimeline': (conversationId: string) => Promise<RemoteResult<VariableViewerTimeline>>\n    'eleckoiConversations/waitForGeneration': (conversationId: string, operationId: string) => Promise<RemoteResult<void>>\n    'eleckoiCreatorStudio/changes': (signal?: AbortSignal) => RemoteStreamHandle<ProductRecordChange, never>\n    'eleckoiCreatorStudio/create': (input: CreateCreatorProjectInput) => Promise<RemoteResult<CreatorProjectCollection>>\n    'eleckoiCreatorStudio/delete': (projectId: string) => Promise<RemoteResult<CreatorProjectCollection>>\n    'eleckoiCreatorStudio/list': () => Promise<RemoteResult<CreatorProjectCollection>>\n    'eleckoiDisplayPreferences/read': () => Promise<RemoteResult<DisplayPreferencesSnapshot>>\n    'eleckoiDisplayPreferences/setChatDisplay': (chatDisplay: Record<string, DisplayPreferenceValue>, expectedRevision?: number) => Promise<RemoteResult<DisplayPreferencesSnapshot>>\n    'eleckoiDisplayPreferences/updateUi': (ui: Record<string, DisplayPreferenceValue>, expectedRevision?: number) => Promise<RemoteResult<DisplayPreferencesSnapshot>>\n    'eleckoiModels/discoverModels': (input: ModelDiscoveryInput) => Promise<RemoteResult<ModelDiscoveryResult[]>>\n    'eleckoiModels/revealApiKey': (configId: string) => Promise<RemoteResult<string>>\n    'eleckoiModels/testConnection': (input: ModelConnectionInput) => Promise<RemoteResult<{ supported: true; }>>\n    'eleckoiPersona/changes': (signal?: AbortSignal) => RemoteStreamHandle<ProductRecordChange, never>\n    'eleckoiPersona/read': () => Promise<RemoteResult<PersonaProfile>>\n    'eleckoiPersona/save': (profile: PersonaProfile) => Promise<RemoteResult<PersonaProfile>>\n    'eleckoiSystem/status': () => Promise<RemoteResult<ElecKoiHostStatus>>\n    'eleckoiWebSearch/select': (mode: WebSearchMode) => Promise<RemoteResult<WebSearchMode>>\n    'eleckoiWebSearch/selection': () => Promise<RemoteResult<WebSearchMode>>\n    'eleckoiWebSearch/testTavily': (apiKey?: string, signal?: AbortSignal) => Promise<RemoteResult<TavilyConnection>>\n  }\n  interface TypertRemoteNamespaceMap {\n    'eleckoiAgentPresets': TypertRemoteNamespace$656c65636b6f694167656e7450726573657473\n    'eleckoiCharacterConfiguration': TypertRemoteNamespace$656c65636b6f69436861726163746572436f6e66696775726174696f6e\n    'eleckoiCharacters': TypertRemoteNamespace$656c65636b6f6943686172616374657273\n    'eleckoiCompatibility': TypertRemoteNamespace$656c65636b6f69436f6d7061746962696c697479\n    'eleckoiConversationModels': TypertRemoteNamespace$656c65636b6f69436f6e766572736174696f6e4d6f64656c73\n    'eleckoiConversations': TypertRemoteNamespace$656c65636b6f69436f6e766572736174696f6e73\n    'eleckoiCreatorStudio': TypertRemoteNamespace$656c65636b6f6943726561746f7253747564696f\n    'eleckoiDisplayPreferences': TypertRemoteNamespace$656c65636b6f69446973706c6179507265666572656e636573\n    'eleckoiModels': TypertRemoteNamespace$656c65636b6f694d6f64656c73\n    'eleckoiPersona': TypertRemoteNamespace$656c65636b6f69506572736f6e61\n    'eleckoiSystem': TypertRemoteNamespace$656c65636b6f6953797374656d\n    'eleckoiWebSearch': TypertRemoteNamespace$656c65636b6f69576562536561726368\n  }\n}\n\nexport declare const TYPERT_REMOTE: TypertRemoteContribution\nexport default TYPERT_REMOTE\n//# sourceMappingURL=typert.remote-client.d.ts.map\n"
