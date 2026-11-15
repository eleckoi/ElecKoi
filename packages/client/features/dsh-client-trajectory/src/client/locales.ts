export const zh = {
  'kind.system': '系统',
  'kind.user': '用户',
  'kind.assistant': '助手',
  'context.notRecorded': '请求上下文为空',
  'context.expand': '展开完整内容',
  'context.collapse': '收起内容',
  'context.size': '{characters} 字符 · {lines} 行',
} as const
export type TrajectoryTranslate = (key: keyof typeof zh, params?: Record<string, string | number>) => string