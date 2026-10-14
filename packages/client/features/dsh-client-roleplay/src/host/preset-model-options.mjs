/** Project only public native options; payload-only fields use the shared adapter. */
export function projectPresetModelOptions(options, settings) {
  if (!settings || typeof settings !== 'object') return options
  const output = { ...options }
  for (const [name, aliases] of [
    ['temperature', ['temperature']], ['topP', ['top_p', 'topP']],
    ['maxTokens', ['max_completion_tokens', 'max_tokens', 'maxTokens']]
  ]) {
    const value = aliases.map(key => settings[key]).find(value => value !== undefined)
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`预设模型参数 ${name} 必须是有限数值。`)
    output[name] = value
  }
  const effort = settings.reasoning_effort ?? settings.reasoningEffort
  if (effort !== undefined && effort !== 'auto') output.reasoningEffort = ({ min: 'minimal' })[effort] ?? effort
  const stop = settings.stop ?? settings.stop_sequences
  if (stop !== undefined) {
    if (!Array.isArray(stop) || stop.some(item => typeof item !== 'string')) throw new TypeError('预设 stop 必须是文本数组。')
    if (stop.length) output.stop = stop
  }
  return output
}

export function presetRequiresPayloadAdapter(settings) {
  if (!settings || typeof settings !== 'object') return false
  if ((settings.stop ?? settings.stop_sequences)?.length) return true
  return [
    [['top_k', 'topK'], 0], [['frequency_penalty', 'frequencyPenalty'], 0],
    [['presence_penalty', 'presencePenalty'], 0], [['repetition_penalty'], 1],
    [['min_p'], 0], [['top_a'], 0], [['seed'], -1]
  ].some(([keys, neutral]) => {
    const value = keys.map(key => settings[key]).find(value => value !== undefined)
    return value !== undefined && value !== neutral
  })
}

