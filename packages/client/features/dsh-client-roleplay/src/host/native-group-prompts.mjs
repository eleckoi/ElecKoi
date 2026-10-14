const fields = [
  ['description', 'Description'], ['personality', 'Personality'],
  ['scenario', 'Scenario'], ['mesExamples', 'Example Messages']
]
const value = input => typeof input === 'string' ? input : ''
const cardField = (card, key) => value(card[key] ?? card.data?.[key])

/** Group cards become ordinary contributions to the selected member's native Agent. */
export function groupCardPromptPlan(group, characters, characterId, metadata, expand, transform = text => text) {
  const mode = Number(group.generation_mode ?? 0)
  if (mode === 0) return null
  if (![1, 2].includes(mode)) throw new Error('群聊角色资料模式无效。')
  const all = group.memberIds.map(id => {
    const card = characters.find(item => item.id === id)
    if (!card) throw new Error(`群聊角色已被删除：${id}`)
    return card
  })
  const enabled = all.filter(card => !group.disabledIds.includes(card.id) || card.id === characterId)
  const included = mode === 2 ? all : enabled
  const prefix = value(group.generation_mode_join_prefix), suffix = value(group.generation_mode_join_suffix)
  const prepare = (source, name, label) => source ? expand(source.replace(/<FIELDNAME>/gi, label), name).replaceAll('\r', '') : ''
  const merged = Object.fromEntries(fields.map(([key, label]) => {
    const content = included.map(card => {
      const raw = cardField(card, key === 'mesExamples' ? 'mes_example' : key).trim()
      if (!raw) return ''
      const body = key === 'mesExamples' && !raw.startsWith('<START>') ? `<START>\n${raw}` : raw
      return prepare(prefix, card.name, label) + prepare(body, card.name, label) + prepare(suffix, card.name, label)
    }).filter(Boolean).join('\n')
    return [key, transform(content)]
  }))
  const selected = characters.find(card => card.id === characterId)
  for (const [key, metadataKey] of [['scenario', 'scenario'], ['mesExamples', 'mes_example']]) {
    const override = value(metadata?.[metadataKey]).trim()
    if (override) merged[key] = transform(expand(override, selected.name).replaceAll('\r', ''))
  }
  const depthPrompts = enabled.flatMap(card => {
    const depth = card.data?.extensions?.depth_prompt ?? card.extensions?.depth_prompt
    const raw = value(depth?.prompt).trim()
    if (!raw) return []
    const depthValue = depth.depth === undefined ? 4 : Number(depth.depth)
    if (!Number.isInteger(depthValue) || depthValue < 0) throw new Error(`群聊角色 ${card.name} 的深度提示位置无效。`)
    const role = depth.role ?? 'system'
    const nativeRole = typeof role === 'number' ? ['system', 'user', 'assistant'][role] : role
    if (!['system', 'user', 'assistant'].includes(nativeRole)) throw new Error(`群聊角色 ${card.name} 的深度提示角色无效。`)
    return [{ id: `group:${group.id}:depth:${card.id}`, content: transform(expand(raw, card.name).replaceAll('\r', ''), depthValue),
      role: nativeRole, anchor: 'chat_depth', depth: depthValue, order: 0, title: `${card.name} · 深度提示`, source: 'group' }]
  })
  return { groupId: group.id, mode, ...merged, depthPrompts }
}

/** Keep native libraries and writeback baselines intact; replace only request contributions. */
export function applyGroupCardPromptPlan(runtime, plan) {
  if (!plan) return
  const context = runtime.conversationContext
  context.characterDescription = plan.description
  context.characterPersonality = plan.personality
  context.scenario = plan.scenario
  context.mesExamples = plan.mesExamples
  context.characterDepthPrompt = plan.depthPrompts.map(entry => entry.content).join('\n')
  const library = context.settingLibrary, source = library?.entries.find(entry => entry.id === 'tavern-character-description')
  const custom = library?.promptPositions?.find(position => position.id === source?.promptPositionId)
  context.replacedCharacterFieldIds = (library?.entries ?? []).filter(entry => entry.id === 'tavern-character-description'
    || /^compat-character:[^:]+:(description|personality|scenario|mes_example)$/.test(entry.id)).map(entry => entry.id)
  const contributions = fields.filter(([key]) => plan[key].trim()).map(([key, label], index) => ({
    id: `group:${plan.groupId}:card:${key}`, content: plan[key], role: 'system',
    anchor: custom?.anchor || source?.position || 'instructions',
    order: (source?.order ?? 0) + index, title: `群聊 · ${label}`, source: 'group'
  }))
  context.promptContributions = [...(context.promptContributions ?? []), ...contributions, ...plan.depthPrompts]
}
