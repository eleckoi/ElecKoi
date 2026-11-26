export interface RoleplayReplyBlock {
  kind: 'speech' | 'cover'
  text: string
  speakerId?: string
  speakerName?: string
}

export function groupRoleplayReplyBlocks<T extends RoleplayReplyBlock>(blocks: readonly T[] | undefined, pending = false) {
  const groups: { speaker: T; blocks: T[] }[] = []
  for (const block of blocks ?? []) {
    if (!block.text.trim() && !pending) continue
    const previous = groups.at(-1)
    const speaker = previous?.speaker
    const sameSpeaker = speaker?.kind === block.kind && (block.kind === 'cover'
      || (speaker.speakerId && block.speakerId
        ? speaker.speakerId === block.speakerId
        : speaker.speakerName === block.speakerName))
    if (previous && sameSpeaker) previous.blocks.push(block)
    else groups.push({ speaker: block, blocks: [block] })
  }
  return groups
}

export function roleplayGroupText(blocks: readonly { text: string }[]): string {
  return blocks.filter(block => block.text.trim()).map(block => block.text).join('\n\n')
}
