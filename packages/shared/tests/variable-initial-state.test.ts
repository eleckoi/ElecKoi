import { describe, expect, it } from 'vitest'
import type { VariableItemConfig, VariableObjectConfig } from '../src/contracts/variables/schemas'
import { generatedInitialStateJson, generatedInitialStatePreviewJson } from '../src/foundation/variables/initialState'

const object = (id: string, parentId = '', dynamicKey = false): VariableObjectConfig => ({
  id, name: id, parentId, dynamicKey, enabled: true, description: '', updateRule: '',
  order: 1, treeViewOrder: 1, createdAt: '', updatedAt: ''
})
const variable = (id: string, objectId: string, defaultValue: string): VariableItemConfig => ({
  id, title: id, objectId, defaultValue, type: 'string', enabled: true, description: '',
  updateRule: '', readMode: 'on_demand', order: 1, treeViewOrder: 1, createdAt: '', updatedAt: ''
})

describe('variable initial state generation', () => {
  const objects = [object('world'), object('members', 'world', true)]
  const variables = [variable('date', 'world', '第一天'), variable('name', 'members', 'template')]
  const members = { alpha: { name: 'authored', note: null }, beta: { name: 'another' } }
  const preserved = { objects, initialStateJson: JSON.stringify({ world: { date: '第一日', members } }) }
  const generate = (nextObjects = objects, nextVariables = variables, source = preserved) => JSON.parse(generatedInitialStateJson(nextObjects, nextVariables, source))

  it('updates static defaults beside a populated dynamic dictionary without creating placeholder entries', () => {
    expect(generate()).toEqual({ world: { date: '第一天', members } })
    expect(JSON.parse(generatedInitialStatePreviewJson(objects, variables)))
      .toEqual({ world: { date: '第一天', '<members>': { name: 'template' } } })
    expect(generate()).not.toHaveProperty('world.<members>')
  })

  it('removes disabled or deleted static variables and groups while retaining other dictionary data', () => {
    expect(generate(objects, variables.filter(item => item.id !== 'date'))).toEqual({ world: { members } })
    expect(generate(objects, variables.map(item => ({ ...item, enabled: false })))).toEqual({ world: { members } })
    expect(generate(objects.map(item => item.id === 'members' ? { ...item, enabled: false } : item)))
      .toEqual({ world: { date: '第一天' } })
    expect(generate(objects.filter(item => item.id !== 'members'), variables.filter(item => item.objectId !== 'members')))
      .toEqual({ world: { date: '第一天' } })
  })

  it('retains dictionary data by object identity when its group or parent is renamed or moved', () => {
    const renamed = objects.map(item => ({ ...item, name: `${item.name}-renamed` }))
    expect(generate(renamed)).toEqual({ 'world-renamed': { date: '第一天', 'members-renamed': members } })
    const moved = objects.map(item => item.id === 'members' ? { ...item, parentId: '' } : item)
    expect(generate(moved)).toEqual({ world: { date: '第一天' }, members })
    // The client may already have moved the snapshot before the Host normalizes it.
    expect(generate(moved, variables, { objects, initialStateJson: JSON.stringify(generate(moved)) }))
      .toEqual({ world: { date: '第一天' }, members })
  })

  it('keeps an empty dynamic dictionary and uses defaults if no valid seed exists', () => {
    expect(generate(objects, variables, { objects, initialStateJson: '{"world":{"members":{}}}' }))
      .toEqual({ world: { date: '第一天', members: {} } })
    for (const initialStateJson of ['{}', '[]', 'null', 'invalid']) {
      expect(generate(objects, variables, { objects, initialStateJson })).toEqual({ world: { date: '第一天' } })
    }
  })

  it('treats an object-valued variable as an authored default rather than a dynamic dictionary', () => {
    const fields = [...variables, { ...variable('settings', 'world', '{"value":"new"}'), type: 'object' as const }]
    expect(generate(objects, fields, { objects, initialStateJson: '{"world":{"settings":{"value":"old","removed":true}}}' }))
      .toEqual({ world: { date: '第一天', settings: { value: 'new' } } })
  })
})
