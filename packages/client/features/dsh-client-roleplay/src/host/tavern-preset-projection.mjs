const characterFields = new Set(['charDescription', 'charPersonality', 'scenario'])
const placeholderFields = new Set(['worldInfoBefore', 'worldInfoAfter', 'chatHistory', 'dialogueExamples', 'personaDescription', ...characterFields])
const anchorNames = ['beforeCharacterDefinition', 'afterCharacterDefinition', 'beforeExamples', 'afterExamples', 'beforeHistory']

/** Project only an explicit ST preset graph; native Agent presets keep their own order. */
export function tavernPresetPlan(context) {
  const preset = context?.compatibilityPreset
  if (preset?.compatibility !== true) return []
  const card = context.compatibilityCard?.data ?? {}, persona = context.compatibilityPersona ?? {}
  const placeholders = { personaDescription: persona.description, charDescription: card.description,
    charPersonality: card.personality, scenario: card.scenario, dialogueExamples: card.mes_example }
  return preset.prompts.filter(prompt => prompt.enabled === true).map((prompt, index) => {
    const promptId = prompt.id ?? prompt.identifier
    const placeholder = prompt.placeholder === true || prompt.marker === true || placeholderFields.has(promptId)
    let content = placeholder ? placeholders[promptId] ?? '' : prompt.content ?? ''
    if (promptId === 'main' && preset.settings?.prefer_character_prompt !== false && card.system_prompt) content = card.system_prompt
    if (promptId === 'jailbreak' && preset.settings?.prefer_character_jailbreak !== false && card.post_history_instructions) content = card.post_history_instructions
    const depth = prompt.position?.type === 'in_chat'
    return { ...prompt, id: `tavern-preset:${preset.id}:${promptId}`, presetPromptId: promptId,
      role: prompt.role ?? 'system', content: String(content), anchor: depth ? 'chat_depth' : 'tavern-relative',
      projectionKind: depth ? 'tavern-preset-depth' : 'tavern-preset',
      depth: depth ? Number(prompt.position.depth) || 0 : undefined,
      order: depth ? Number(prompt.position.order) || 0 : index,
      placementRank: 1, positionOrder: 0,
      section: characterFields.has(promptId) ? 'character-definition' : promptId === 'dialogueExamples' ? 'examples' : undefined,
      traceTitle: `预设条目 · ${prompt.name || promptId}`, traceSource: preset.name }
  })
}

export function isCompatibilityCharacterField(id) {
  return /^compat-character:[^:]+:(?:description|personality|scenario|mes_example|system_prompt|post_history_instructions)$/.test(id)
}

/** Resolve actual card/example boundaries while retaining native Agent/tool messages. */
export function projectTavernPresetMessages(messages, plan, createMessage, projectionPrefix) {
  const entries = plan.filter(entry => entry.projectionKind === 'tavern-preset')
  const byId = new Map(plan.map(entry => [`${projectionPrefix}:${entry.id}`, entry]))
  const anchored = name => plan.filter(entry => entry.anchor === name).map(createMessage)
  if (!entries.length) return projectNativeAnchors(messages, plan, byId, anchored)

  const isPrefix = message => {
    const entry = byId.get(message.id)
    return message.role === 'system' && message.source?.kind !== 'plugin:eleckoi-product-history'
      || entry && ['insert_point_1', 'insert_point_2', 'character-definition', 'examples'].includes(entry.anchor)
  }
  const prefix = messages.filter(isPrefix), history = messages.filter(message => !isPrefix(message))
  const result = [...prefix], anchors = {}
  let hasHistory = false
  for (const entry of entries) {
    switch (entry.presetPromptId) {
      case 'worldInfoBefore':
        anchors.beforeCharacterDefinition = result.length
        result.push(...anchored('beforeCharacterDefinition'))
        break
      case 'worldInfoAfter':
        anchors.afterCharacterDefinition = result.length
        result.push(...anchored('afterCharacterDefinition'))
        break
      case 'dialogueExamples':
        anchors.beforeExamples = result.length
        result.push(...anchored('beforeExamples'))
        if (entry.content.trim()) result.push(createMessage(entry))
        result.push(...anchored('afterExamples'))
        anchors.afterExamples = result.length
        break
      case 'chatHistory':
        anchors.beforeHistory = result.length
        result.push(...anchored('beforeHistory'), ...history)
        anchors.afterHistory = result.length
        hasHistory = true
        break
      default:
        if (entry.content.trim()) result.push(createMessage(entry))
    }
  }
  if (!hasHistory) {
    // A disabled history placeholder suppresses old chat text, while the
    // current real input and Agent tool continuation still reach the model.
    const current = history.findLastIndex(message => message.role === 'user' && message.source?.kind === 'user')
    result.push(...history.slice(current < 0 ? history.length : current))
  }
  return { messages: result, anchorIndexes: anchors }
}

function projectNativeAnchors(messages, plan, byId, anchored) {
  const sectionIndexes = section => messages.flatMap((message, index) => byId.get(message.id)?.section === section ? [index] : [])
  const character = sectionIndexes('character-definition'), examples = sectionIndexes('examples')
  const prefixEnd = messages.findIndex(message => message.role !== 'system' && !byId.has(message.id))
  const historyStart = prefixEnd < 0 ? messages.length : prefixEnd
  const characterBefore = character[0] ?? examples[0] ?? historyStart
  const characterAfter = character.length ? character.at(-1) + 1 : characterBefore
  const exampleBefore = examples[0] ?? characterAfter
  const exampleAfter = examples.length ? examples.at(-1) + 1 : exampleBefore
  const indexes = { beforeCharacterDefinition: characterBefore, afterCharacterDefinition: characterAfter,
    beforeExamples: exampleBefore, afterExamples: exampleAfter, beforeHistory: historyStart }
  const slots = new Map()
  for (const name of anchorNames) {
    const values = slots.get(indexes[name]) ?? []
    values.push(...anchored(name)); slots.set(indexes[name], values)
  }
  const result = []
  for (let index = 0; index <= messages.length; index++) {
    result.push(...(slots.get(index) ?? []))
    if (index < messages.length) result.push(messages[index])
  }
  return { messages: result, anchorIndexes: indexes }
}
