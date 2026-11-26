import * as zod from 'zod'
import * as reactVirtual from '@tanstack/react-virtual'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as store from '@deepseek-ai/dsh-client-store'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as slots from '@deepseek-ai/dsh-client-ui-slots'
import * as cordis from '@deepseek-ai/cordis'
import { withDshAssets } from './clientModuleRequire.js'

const modules = { zod, '@tanstack/react-virtual': reactVirtual,
  react: React, 'react/jsx-runtime': jsxRuntime, 'react-dom': ReactDOM,
  '@deepseek-ai/dsh-client-store': store,
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
  '@deepseek-ai/dsh-client-ui-slots': slots,
  '@deepseek-ai/cordis': cordis,
}

// Exercise the installed Client bundles and their actual plugin registrations.
// Private engine inspection is confined to this test loader.
function loadClient(name, exposed = '') {
  const source = readFileSync(resolve(`node_modules/@deepseek-ai/${name}/lib/client.js`), 'utf8')
  if (source.split('return module.exports').length !== 2) throw new Error('Unexpected Client bundle boundary')
  let registration
  const environment = {
    window: { __ModuleLoader__: { load: value => { registration = value } } },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
  }
  for (const name of ['document', 'HTMLElement', 'ResizeObserver', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    Object.defineProperty(environment, name, { get: () => globalThis[name] })
  }
  runInNewContext(source.replace('return module.exports', `return { ...module.exports${exposed} };`), environment)
  return registration.factory(withDshAssets(name => {
    if (!(name in modules)) throw new Error(`Unexpected Client dependency: ${name}`)
    return modules[name]
  }))
}

const conversation = loadClient('dsh-client-ui-conversation', ', BoundConversation, ConversationNodeAssembler, ConversationEventRegistry, inspectSystemPrompt, inspectRequestPrompt, ContextMeter, ConversationRoot, ConversationContent, ConversationWidthControls, installDraftWheel, keepDraftFocus')
const trajectory = loadClient('dsh-client-ui-trajectory', ', deriveTrajectoryLayout, registerTrajectoryToolDefinition, TrajectoryView, zh')
export const OfficialTrajectoryView = trajectory.TrajectoryView
export const officialTrajectoryLayout = trajectory.deriveTrajectoryLayout
export const registerOfficialTrajectoryTools = trajectory.registerTrajectoryToolDefinition
export const officialTrajectoryZh = trajectory.zh

export function officialTrajectoryFixture() {
  const events = new conversation.ConversationEventRegistry(new cordis.Context())
  const definitions = events.definitions
  const views = new Map()
  trajectory.apply({
    effect() {}, locale: { bind: () => key => key },
    uiConversation: {
      events,
      views: { register: definition => views.set(definition.target, definition) },
      inspectSystemPrompt: conversation.inspectSystemPrompt,
      inspectRequestPrompt: conversation.inspectRequestPrompt,
    },
    uiSession: { provide() {} }, slots: { inject() {} },
  })
  const engine = new conversation.ConversationNodeAssembler(
    events,
    { entries: () => [...views.values()] },
  )
  engine.activateTarget('trajectory')
  return {
    definitions,
    replace(events, hasMore = false) {
      engine.replaceWindow(events.map(event => ({ type: 'durable', event })), hasMore)
      engine.flush()
      return engine.snapshot('trajectory')
    },
    append(event) {
      engine.append({ type: event.type === 'assistant/live-chunk' ? 'transient' : 'durable', event })
      engine.flush()
      return engine.snapshot('trajectory')
    },
    prepend(events) {
      engine.prepend(events.map(event => ({ type: 'durable', event })), false)
      engine.flush()
      return engine.snapshot('trajectory')
    },
  }
}

export const trajectoryAssistantDefinition = officialTrajectoryFixture().definitions.get('trajectory-assistant-step')

export const OfficialActivityPill = loadClient('dsh-client-ui-chat', ', ActivityPill').ActivityPill
export const OfficialReasoningRow = loadClient('dsh-client-ui-chat', ', ReasoningRow').ReasoningRow
export const OfficialAssistantNodeView = loadClient('dsh-client-ui-chat', ', AssistantNodeView').AssistantNodeView
export const OfficialReasoningContent = loadClient('dsh-client-ui-chat', ', ReasoningContent').ReasoningContent
export const OfficialCompactionNodeView = loadClient('dsh-client-ui-chat', ', CompactionNodeView').CompactionNodeView
export const OfficialTurnErrorNodeView = loadClient('dsh-client-ui-chat', ', TurnErrorNodeView').TurnErrorNodeView
export const OfficialContextMeter = conversation.ContextMeter
export const OfficialConversationContent = conversation.ConversationContent
export const OfficialConversationRoot = conversation.ConversationRoot
export const OfficialConversationWidthControls = conversation.ConversationWidthControls
export const installOfficialDraftWheel = conversation.installDraftWheel
export const keepOfficialDraftFocus = conversation.keepDraftFocus
export const officialComposerSeat = loadClient('dsh-client-ui-chat', ', composerSeat').composerSeat

export function officialChatFixture() {
  const chat = loadClient('dsh-client-ui-chat', ', registerConversationNodes')
  const events = new conversation.ConversationEventRegistry(new cordis.Context())
  const definitions = events.definitions
  const views = new Map()
  let fallback
  chat.registerConversationNodes({ uiConversation: {
    events,
    views: { register: definition => views.set(definition.target, definition) },
    groups: { register() {} },
    inspectSystemPrompt: conversation.inspectSystemPrompt,
    inspectRequestPrompt: conversation.inspectRequestPrompt,
  } })
  const engine = new conversation.ConversationNodeAssembler(
    events,
    { entries: () => [...views.values()] },
  )
  engine.activateTarget('chat')
  return {
    bind(feed) { return new conversation.BoundConversation(feed, engine) },
    replace(events) {
      engine.replaceWindow(events.map(event => ({ type: 'durable', event })), false)
      engine.flush()
      return engine.snapshot('chat')
    },
    append(event) {
      engine.append({ type: event.type === 'assistant/live-chunk' ? 'transient' : 'durable', event })
      engine.flush()
      return engine.snapshot('chat')
    },
    prepend(events) {
      engine.prepend(events.map(event => ({ type: 'durable', event })), false)
      engine.flush()
      return engine.snapshot('chat')
    },
  }
}
