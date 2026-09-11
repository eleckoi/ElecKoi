import { defineTool } from '@deepseek-ai/dsh-tools'

const validStatuses = new Set(['pending', 'inProgress', 'completed'])

export const name = 'eleckoi-roleplay-plan-tool'
export const inject = ['tools']

export function apply(ctx) {
  const steps = roleplayPlanSteps()
  if (!steps.length) return
  return ctx.tools.register(defineTool({
    name: 'update_roleplay_plan',
    description: [
      '更新本轮角色扮演计划。必须复述完整任务列表并填写状态；任务文字和顺序由作者固定。',
      ...steps.map((step, index) => `${index + 1}. ${step}`),
      '最后一项由应用在检测到 FINAL 正文后完成，模型不要主动将其标记为 completed。'
    ].join('\n'),
    parameters: {
      explanation: { type: 'string', description: '可选的简短进度说明。' },
      plan: {
        type: 'array',
        required: true,
        description: '完整角色扮演计划；每次调用会替换上一份状态。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            step: { type: 'string', required: true },
            status: { type: 'string', enum: ['pending', 'inProgress', 'completed'], required: true }
          }
        }
      }
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
    },
    async execute(args) {
      return canonicalizePlan(args, steps)
    }
  }))
}

function roleplayPlanSteps() {
  try {
    const value = JSON.parse(process.env.ELECKOI_ROLEPLAY_PLAN_STEPS || '[]')
    if (!Array.isArray(value)) return []
    return value.map((step) => String(step).trim()).filter(Boolean).slice(0, 20)
  } catch {
    return []
  }
}

function canonicalizePlan(args, steps) {
  const submitted = Array.isArray(args.plan) ? args.plan : []
  const statuses = steps.map((_step, index) => {
    const status = submitted[index]?.status
    return validStatuses.has(status) ? status : 'pending'
  })
  const precedingTasksCompleted = statuses.slice(0, -1).every((status) => status === 'completed')
  const last = statuses.length - 1
  statuses[last] = precedingTasksCompleted
    ? 'inProgress'
    : statuses[last] === 'completed' ? 'pending' : statuses[last]
  const counts = Object.fromEntries([...validStatuses].map((status) => [status, statuses.filter((item) => item === status).length]))
  return {
    status: 'ok',
    message: precedingTasksCompleted
      ? '现在只剩最终输出项。直接输出 <FINAL> 正文，不要再次调用 update_roleplay_plan；应用检测到正文后会自动完成最终项。'
      : `角色扮演计划已更新：${counts.completed} 已完成，${counts.inProgress} 进行中，${counts.pending} 待处理。最终输出项由应用在检测到 <FINAL> 正文后自动完成。`,
    ...(typeof args.explanation === 'string' && args.explanation.trim() ? { explanation: args.explanation.trim() } : {}),
    plan: steps.map((step, index) => ({ step, status: statuses[index] }))
  }
}
