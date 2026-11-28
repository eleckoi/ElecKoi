import { describe, expect, it } from 'vitest'
import { apply as applyRoleplayPlanTool } from '../../../../../../apps/desktop/resources/dsh/roleplay-plan-tool.mjs'

describe('DSH roleplay plan tool', () => {
  it('declares and executes every long author task beyond the former twenty-item ceiling', async () => {
    let definition
    const steps = Array.from({ length: 101 }, (_, index) => `Synthetic task ${index}: ${'text '.repeat(501)}tail-${index}`)
    applyRoleplayPlanTool({ tools: { register(value) { definition = value; return () => {}; } } }, { steps })
    expect(definition.description).toContain(steps.at(-1))
    const result = await definition.execute({ plan: steps.map(step => ({ step, status: 'pending' })) })
    expect(result.plan.map(item => item.step)).toEqual(steps)
    const ready = await definition.execute({ plan: steps.map(step => ({ step, status: 'completed' })) })
    expect(ready.message).toContain('本轮必须至少调用一次 eleckoi_roleplay_reply')
    expect(ready.message).toContain('子代理已提交的正文计入本轮要求')
  })

  it('stays registered when the active preset has no plan steps', async () => {
    let definition
    applyRoleplayPlanTool({
      tools: {
        register(value) {
          definition = value
          return () => undefined
        }
      }
    }, { steps: [] })

    expect(definition?.name).toBe('update_roleplay_plan')
    await expect(definition.execute({ plan: [] })).resolves.toEqual({
      status: 'ok',
      plan: []
    })
  })
})
