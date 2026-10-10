/** The typed ST preset is an ordered Prompt graph, independent of native Agent tools. */
export function tavernPresetPlan(context) {
  const preset = context?.compatibilityPreset
  if (preset?.compatibility !== true) return []
  const card = context.compatibilityCard?.data ?? {}
  const persona = context.compatibilityPersona ?? {}
  const placeholders = {
    personaDescription: persona.description,
    charDescription: card.description,
    charPersonality: card.personality,
    scenario: card.scenario,
    dialogueExamples: card.mes_example
  }
  return preset.prompts.filter(prompt => prompt.enabled === true).map(prompt => {
    let content = prompt.placeholder ? placeholders[prompt.id] ?? '' : prompt.content ?? ''
    if (prompt.id === 'main' && preset.settings.prefer_character_prompt !== false && card.system_prompt) content = card.system_prompt
    if (prompt.id === 'jailbreak' && preset.settings.prefer_character_jailbreak !== false && card.post_history_instructions) content = card.post_history_instructions
    const depth = prompt.position?.type === 'in_chat'
    return {
      ...prompt,
      id: `tavern-preset:${preset.id}:${prompt.id}`,
      presetPromptId: prompt.id,
      role: prompt.role,
      content: String(content),
      anchor: depth ? 'beforeLatestUserInput' : 'tavern-relative',
      projectionKind: depth ? 'tavern-preset-depth' : 'tavern-preset',
      ...(depth ? { worldbookPosition: 'at_depth', depth: prompt.position.depth, order: prompt.position.order } : {}),
      ...(['charDescription', 'charPersonality', 'scenario'].includes(prompt.id) ? { section: 'character-definition' } : {}),
      ...(prompt.id === 'dialogueExamples' ? { section: 'examples' } : {}),
      traceTitle: `预设条目 · ${prompt.name || prompt.id}`,
      traceSource: preset.name
    }
  })
}

export function isCompatibilityCharacterField(id) {
  return /^compat-character:[^:]+:(?:description|personality|scenario|mes_example|system_prompt|post_history_instructions)$/.test(id)
}

/** Preserve real Agent/tool messages while resolving every relative ST placeholder in order. */
export function projectTavernPresetMessages(messages, plan, createMessage, projectionPrefix) {
  const entries = plan.filter(entry => entry.projectionKind === 'tavern-preset')
  if (!entries.length) return { messages, anchorIndexes: {} }
  const byId = new Map(plan.map(entry => [`${projectionPrefix}:${entry.id}`, entry]))
  const isPrefix = message => {
    const entry = byId.get(message.id)
    return message.role === 'system' && message.source?.kind !== 'plugin:eleckoi-product-history'
      || entry && ['instructions', 'insert_point_1', 'insert_point_2'].includes(entry.anchor)
  }
  const prefix = messages.filter(isPrefix), history = messages.filter(message => !isPrefix(message))
  const result = [...prefix], anchors = {}
  let hasHistory = false
  for (const entry of entries) {
    const index = result.length
    switch (entry.presetPromptId) {
      case 'worldInfoBefore': anchors.beforeCharacterDefinition = index; break
      case 'worldInfoAfter': anchors.afterCharacterDefinition = index; break
      case 'chatHistory':
        anchors.beforeHistory = index
        result.push(...history)
        anchors.afterHistory = result.length
        hasHistory = true
        break
      case 'dialogueExamples':
        anchors.beforeExamples = index
        if (entry.content.trim()) result.push(createMessage(entry))
        anchors.afterExamples = result.length
        break
      default:
        if (entry.content.trim()) result.push(createMessage(entry))
    }
  }
  if (!hasHistory) {
    // Disabling chatHistory suppresses chat text, but never breaks the Agent's
    // current tool-call/result trajectory on a continuation.
    const current = history.findLastIndex(message => message.role === 'user' && message.source?.kind === 'user')
    result.push(...history.slice(current + 1).filter(message => message.source?.kind === 'tool'
      || message.role === 'assistant' && message.source?.kind === 'model'))
  }
  return { messages: result, anchorIndexes: anchors }
}
