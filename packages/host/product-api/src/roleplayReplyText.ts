type Speaker = { speakerName: string; speakerId?: string }

export type RoleplayReplyBlock = Speaker & { id: string; kind: 'speech'; text: string }

export function roleplayReplySpeakers(meta: unknown): Speaker[] {
  const { speaker, speakers } = (meta ?? {}) as { speaker?: unknown; speakers?: unknown }
  // RETIRE WHEN: supported Session histories and imports all store speakers arrays. Remove the legacy
  // speaker read fallback and its regression coverage together. Reads preserve the stored speaker identity.
  return (Array.isArray(speakers) ? speakers : [speaker]).flatMap(value => {
    if (typeof value?.speakerName !== 'string') return []
    return [{ speakerName: value.speakerName, ...(typeof value.speakerId === 'string' ? { speakerId: value.speakerId } : {}) }]
  })
}

/** Read ordinary DSH assistant text in the order its speaker tags arrive. */
export function roleplayReplyBlocks(raw: string, speakers: readonly Speaker[], callId: string, streaming = false): RoleplayReplyBlock[] {
  const blocks: RoleplayReplyBlock[] = []
  const append = (speaker: Speaker, text: string) => {
    if (text.trim() || streaming) blocks.push({ id: `${callId}:${blocks.length}`, kind: 'speech', ...speaker, text })
  }
  const tags = speakers.map(speaker => ({ speaker, opening: `<${speaker.speakerName}>`, closing: `</${speaker.speakerName}>` }))
  let position = 0
  let found = false
  while (position < raw.length) {
    const start = raw.indexOf('<', position)
    if (start < 0) break
    position = start + 1
    const tag = tags.find(({ opening }) => raw.startsWith(opening, start))
    if (!tag) continue
    found = true
    const { speaker, opening, closing } = tag
    const bodyStart = start + opening.length
    const close = raw.indexOf(closing, bodyStart)
    if (close < 0) {
      const body = raw.slice(bodyStart)
      const partial = streaming ? body.lastIndexOf('<') : -1
      append(speaker, partial >= 0 && closing.startsWith(body.slice(partial)) ? body.slice(0, partial) : body)
      break
    }
    const body = raw.slice(bodyStart, close)
    if (body.trim()) append(speaker, body)
    position = close + closing.length
  }
  const [speaker] = speakers
  if (!found && speaker && speakers.length === 1) {
    const opening = `<${speaker.speakerName}>`
    append(speaker, streaming && opening.startsWith(raw.trimStart()) ? '' : raw)
  }
  return blocks
}

/** Keep successive text from the same speaker together. */
export function appendRoleplayReplyBlock(blocks: RoleplayReplyBlock[], block: RoleplayReplyBlock): RoleplayReplyBlock {
  const previous = blocks.at(-1)
  const sameSpeaker = previous && (previous.speakerId && block.speakerId
    ? previous.speakerId === block.speakerId : previous.speakerName === block.speakerName)
  if (!sameSpeaker) {
    blocks.push(block)
    return block
  }
  if (block.text.trim()) previous.text = previous.text ? `${previous.text}\n\n${block.text}` : block.text
  return previous
}
