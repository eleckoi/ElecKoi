const mainMessages = {
  missingConversation: '找不到这个对话。',
  activeTurnConflict: '这个对话仍有回复正在生成。'
} as const

export function t(key: keyof typeof mainMessages): string {
  return mainMessages[key]
}
