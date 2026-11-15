/** One actual request-preview message, read from the running Host. */
export interface TrajectoryRequestContextItem {
  order: number
  messageId: string
  role: 'system' | 'user' | 'assistant'
  kind: 'system' | 'prompt' | 'history' | 'user' | 'assistant' | 'tool' | 'context'
  title: string
  source: string
  anchor: string
  content: string
}
