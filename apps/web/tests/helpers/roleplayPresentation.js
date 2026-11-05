import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { resolve } from 'node:path'
import React from 'react'

const source = readFileSync(resolve('packages/client/features/dsh-client-roleplay/src/client.js'), 'utf8')
const boundary = "inject: ['slots', 'sessions', 'eleckoiConversations',"
if (source.split(boundary).length !== 2) throw new Error('Unexpected roleplay contribution boundary')
let registration
runInNewContext(source.replace(boundary, `createInputRoundIndex, presentChatTurnNavigation, adaptChatSessionStats, ${boundary}`), {
  window: { __ModuleLoader__: { load: value => { registration = value } } },
})
// Expose presentation functions only to tests; production mounts the slot entry.
export const { createInputRoundIndex, presentChatTurnNavigation, adaptChatSessionStats } = registration.factory(name => {
  if (name !== 'react') throw new Error(`Unexpected roleplay dependency: ${name}`)
  return React
})
