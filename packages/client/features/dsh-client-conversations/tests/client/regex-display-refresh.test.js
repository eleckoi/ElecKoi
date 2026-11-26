import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dshClientPlugin } from '../../../../../../tests/helpers/dshClientPlugin'
import { MessageDisplayProjector } from '../../../../../host/product-data/src/domain/conversations/MessageDisplayProjector'
import { mvuMessageDisplayCompatibility } from '@eleckoi/compatibility-mvu'
import { preserveMessageRenderKeys } from '../../../../../../apps/web/src/modules/chat/hooks/useConversationMessages.js'
import { finalReplyText } from '../../../../../shared/src/foundation/finalReply'

const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)) }
const scopes = ['globalRules', 'agentPresetRules', 'characterRules']
const sourceMessage = { id: 'assistant-1', conversationId: 'chat-1', role: 'assistant',
  content: '[CARD]', status: 'complete', variableStateJson: '{}', createdAt: '2026-10-10T00:00:00.000Z' }
const makeCollection = scope => ({ characterId: 'character-1', agentPresetId: 'preset-1',
  agentPresetName: 'Synthetic preset', agentPresetRegexRevision: 'a'.repeat(64), revision: 1,
  globalRules: [], characterRules: [], agentPresetRules: [],
  [scope]: [{ id: 'card', name: 'Synthetic display', pattern: '/\\[CARD\\]/g',
    replacement: '<section>Old card</section>', targets: ['AiOutput', 'UserInput'],
    enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 }],
  versions: [], activeVersionId: '' })

function feed() {
  const streams = new Set()
  return {
    open(signal) {
      const state = { queue: [{ kind: 'snapshot' }], done: false, wake: undefined }
      streams.add(state)
      const stop = () => { state.done = true; streams.delete(state); state.wake?.() }
      signal?.addEventListener('abort', stop, { once: true })
      return (async function* () {
        try {
          while (!state.done) {
            if (state.queue.length) { yield state.queue.shift(); continue }
            await new Promise(resolve => { state.wake = resolve })
            state.wake = undefined
          }
        } finally { signal?.removeEventListener('abort', stop); stop() }
      })()
    },
    emit(change) { for (const state of streams) { state.queue.push(change); state.wake?.() } }
  }
}

function plugin(path) {
  let registration
  runInNewContext(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    AbortController, console, window: { __ModuleLoader__: { load: value => { registration = value } } }
  })
  return dshClientPlugin(registration)
}

async function mount(scope, message = sourceMessage, rulePatch = {}) {
  let collection = makeCollection(scope)
  collection[scope][0] = { ...collection[scope][0], ...rulePatch }
  let regexRules
  let catalog
  let rendered = []
  const publications = []
  const cleanups = []
  const changes = feed()
  const conversationChanges = feed()
  const projector = new MessageDisplayProjector(mvuMessageDisplayCompatibility)
  const projectDisplay = vi.fn(async (conversationId, input) => ({ ok: true,
    value: input.map((message, index) => {
      const projected = projector.project({ ...message, conversationId }, collection, undefined, input.length - index - 1)
      return { id: message.id, sourceContent: message.content,
        displayContent: projected.displayContent ?? projected.content, variableStateJson: projected.variableStateJson,
        ...(message.reasoning ? { reasoning: projector.projectReasoning({ ...message, conversationId }, message.reasoning, collection,
          undefined, input.length - index - 1) } : {}) }
    }) }))
  const readRules = vi.fn(async () => ({ ok: true, value: structuredClone(collection) }))
  const saveRules = vi.fn(async (_characterId, value) => {
    collection = { ...structuredClone(value), revision: collection.revision + 1 }
    changes.emit({ kind: 'configuration', domain: 'regexRules' })
    return { ok: true, value: structuredClone(collection) }
  })
  const remote = {
    eleckoiCharacterConfiguration: {
      changes: signal => changes.open(signal), readRegexRules: readRules,
      saveRegexRules: saveRules,
      importRegexRules: async (_characterId, _fallbackScope, documents) => ({ ok: true,
        value: { collection: (await saveRules(_characterId, { ...collection, [scope]: JSON.parse(documents[0].json) })).value,
          importedFileCount: 1, importedRuleCount: 1, failedFileNames: [] } })
    },
    eleckoiConversations: {
      changes: signal => conversationChanges.open(signal),
      list: async () => ({ ok: true, value: [{ id: 'chat-1' }] }),
      details: async () => ({ ok: true, value: { conversation: { id: 'chat-1' },
        metadata: { characterId: 'character-1' }, runtimeSessionId: '', messages: [{ ...message,
          ...(message.status === 'streaming' ? { displayContent: finalReplyText(message.content, { streaming: true }) } : {}) }],
        hasMore: false, beforeSequence: null } }), projectDisplay
    }
  }
  const common = { remote, on: () => () => {}, effect: run => { cleanups.push(run()) } }
  plugin('../../../dsh-client-character-configuration/src/client.js').apply({ ...common,
    provide: (name, value) => { if (name === 'eleckoiRegexRules') regexRules = value } })
  plugin('../../src/client.js').apply({ ...common,
    eleckoiRegexRules: regexRules, provide: (_name, value) => { catalog = value } })
  catalog.subscribeDetails(() => {
    const details = catalog.getDetailsSnapshot().details
    if (details) {
      rendered = preserveMessageRenderKeys(rendered, details.messages)
      publications.push(rendered.map(message => ({ ...message })))
    }
  })
  await settle()
  await catalog.open('chat-1')
  await settle()
  return { regexRules, catalog, readRules, saveRules, projectDisplay, changes,
    collection: () => collection, rendered: () => rendered, publications,
    close: () => { for (const cleanup of cleanups.reverse()) cleanup() } }
}

describe('regex display refresh', () => {
  it.each(scopes)('removes an existing display result when the saved %s scope is disabled and restores it on re-enable', async scope => {
    const app = await mount(scope), enabledKey = { globalRules: 'globalEnabled', agentPresetRules: 'agentPresetEnabled', characterRules: 'characterEnabled' }[scope]
    try {
      expect(app.rendered()[0].displayContent).toContain('Old card')
      await app.regexRules.save('character-1', { ...app.collection(), [enabledKey]: false })
      await settle()
      expect(app.rendered()[0].displayContent).toBe('[CARD]')
      expect(app.collection()[scope][0].enabled).toBe(true)
      await app.regexRules.save('character-1', { ...app.collection(), [enabledKey]: true })
      await settle()
      expect(app.rendered()[0].displayContent).toContain('Old card')
      expect(app.rendered()[0].content).toBe('[CARD]')
    } finally { app.close() }
  })

  it('releases body and reasoning projections when their messages leave the loaded page', () => {
    const projector = new MessageDisplayProjector(mvuMessageDisplayCompatibility)
    const collection = makeCollection('globalRules')
    for (let index = 0; index < 30; index++) {
      const message = { ...sourceMessage, id: `synthetic-loaded-${index}` }
      projector.project(message, collection)
      projector.projectReasoning(message, [{ id: 'synthetic-thought', text: '[CARD]' }], collection)
    }
    projector.retainMessages(new Set(['synthetic-loaded-29']))
    expect(projector.cache.size).toBe(1)
    expect(projector.reasoningCache.size).toBe(1)
    projector.retainMessages(new Set())
    expect(projector.cache.size).toBe(0)
    expect(projector.reasoningCache.size).toBe(0)
  })
  it('projects completed reasoning through Host display rules, refreshes edited rules, and sends no tool details or running fragments', async () => {
    const message = { ...sourceMessage, status: 'streaming', process: [
      { id: 'synthetic-reasoning-done', kind: 'reasoning', status: 'complete', detail: '[CARD]', summary: '' },
      { id: 'synthetic-reasoning-live', kind: 'reasoning', status: 'running', detail: '[CARD]', summary: '' },
      { id: 'synthetic-tool', kind: 'tool', status: 'complete', detail: 'Synthetic tool result', arguments: '{"value":"Synthetic tool argument"}' },
    ] }
    const app = await mount('globalRules', message, { targets: ['Reasoning'], replacement: 'Changed reasoning' })
    try {
      const current = () => app.catalog.getDetailsSnapshot().details.messages[0]
      expect(current().process[0]).toMatchObject({ detail: '[CARD]', displayDetail: 'Changed reasoning' })
      expect(current().process[1].displayDetail).toBeUndefined()
      const sent = app.projectDisplay.mock.calls.at(-1)[1][0]
      expect(sent.reasoning).toEqual([{ id: 'synthetic-reasoning-done', text: '[CARD]' }])
      expect(sent.process).toBeUndefined()
      const calls = app.projectDisplay.mock.calls.length
      const details = app.catalog.getDetailsSnapshot().details
      app.catalog.publishDetails({ ...app.catalog.getDetailsSnapshot(), details: { ...details, messages: [{ ...current(),
        process: current().process.map(item => item.status === 'running' ? { ...item, detail: '[CARD] more streamed text' } : item) }] } })
      await settle()
      expect(app.projectDisplay.mock.calls).toHaveLength(calls)
      await app.regexRules.save('character-1', { ...app.collection(), globalRules: app.collection().globalRules.map(rule => ({ ...rule, replacement: '' })) })
      await settle()
      expect(current().process[0]).toMatchObject({ detail: '[CARD]', displayDetail: '' })
    } finally { app.close() }
  })
  it('uses the native variable checkpoint instead of feeding display variables back into projection', async () => {
    const message = { ...sourceMessage, nativeVariableStateJson: '{"label":"source"}', variableStateJson: '{"label":"display"}' }
    const app = await mount('agentPresetRules', message)
    try {
      expect(app.projectDisplay.mock.calls.at(-1)[1][0].variableStateJson).toBe(message.nativeVariableStateJson)
      const calls = app.projectDisplay.mock.calls.length
      await app.catalog.refreshDetails()
      await settle()
      expect(app.projectDisplay.mock.calls).toHaveLength(calls)
    } finally { app.close() }
  })

  it('sends reply speaker bindings and publishes merged display text alongside the source blocks', async () => {
    const roleplayBlocks = ['原文前半。', '原文后半。'].map((text, index) => ({
      id: `reply:${index}`, kind: 'speech', speakerId: 'speaker-1', speakerName: '合成发言甲', text,
    }))
    const message = { ...sourceMessage, content: '合成发言甲：原文前半。\n\n合成发言甲：原文后半。', roleplayReply: true, roleplayBlocks }
    const app = await mount('characterRules', message)
    try {
      const roleplayGroups = [{ id: 'reply:0', sourceText: '原文前半。\n\n原文后半。', displayText: '合并后替换。' }]
      app.projectDisplay.mockImplementationOnce(async (_id, [input]) => ({ ok: true, value: [{
        id: input.id, sourceContent: input.content, displayContent: '合成发言甲：合并后替换。',
        variableStateJson: input.variableStateJson, roleplayGroups,
      }] }))
      await app.regexRules.save('character-1', app.collection())
      await settle()
      expect(app.projectDisplay.mock.calls.at(-1)[1][0].roleplayBlocks).toEqual(roleplayBlocks)
      expect(app.rendered()[0]).toMatchObject({ content: message.content, roleplayBlocks, roleplayGroups })
    } finally { app.close() }
  })

  it('keeps a settled frontend visible while refreshed message metadata is projected', async () => {
    const message = { ...sourceMessage, content: '<FINAL>Narrative</FINAL>\n[CARD]' }
    const app = await mount('agentPresetRules', message)
    try {
      const visible = app.rendered()[0].displayContent
      const project = app.projectDisplay.getMockImplementation()
      let finish
      app.projectDisplay.mockImplementationOnce(async (...args) => {
        const response = await project(...args)
        return new Promise(resolve => { finish = () => resolve(response) })
      })
      message.createdAt = '2026-10-10T00:00:01.000Z'
      const refresh = app.catalog.refreshDetails()
      await settle()
      expect(app.rendered()[0].displayContent).toBe(visible)
      finish()
      await refresh
      expect(app.rendered()[0].displayContent).toBe(visible)
    } finally { app.close() }
  })

  it('does not alternate live text with rich regex output between stream chunks', async () => {
    const message = { ...sourceMessage, content: '<FINAL>Narrative</FINAL>\n[CARD]', status: 'streaming' }
    const app = await mount('agentPresetRules', message)
    try {
      const initialCalls = app.projectDisplay.mock.calls.length
      for (const suffix of ['\nFirst suffix', '\nSecond suffix']) {
        message.content += suffix
        await app.catalog.refreshDetails()
        await settle()
        expect(app.rendered()[0].displayContent).toBe(finalReplyText(message.content, { streaming: true }))
      }
      expect(app.projectDisplay.mock.calls).toHaveLength(initialCalls)
      for (const rows of app.publications) {
        const live = rows.find(row => row.id === message.id && row.status === 'streaming')
        if (live) expect(live.displayContent).not.toContain('<section>')
      }
      message.status = 'complete'
      await app.catalog.refreshDetails()
      await settle()
      expect(app.rendered()[0].displayContent).toContain('<section>Old card</section>')
      expect(app.rendered()[0].displayContent).toContain('Second suffix')
      expect(app.rendered()[0].content).toBe(message.content)
      expect(app.projectDisplay.mock.calls).toHaveLength(initialCalls + 1)
    } finally { app.close() }
  })

  it.each(scopes)('defers saved %s replacements until the live reply has settled', async scope => {
    const message = { ...sourceMessage, content: '<FINAL>Narrative</FINAL>\n[CARD]', status: 'streaming' }
    const app = await mount(scope, message)
    try {
      const updated = structuredClone(app.collection())
      updated[scope][0].replacement = '<section>Updated panel</section>'
      await app.regexRules.save('character-1', updated)
      await settle()
      expect(app.rendered()[0].displayContent).toBe('Narrative\n[CARD]')
      message.status = 'complete'
      await app.catalog.refreshDetails()
      await settle()
      expect(app.rendered()[0].displayContent).toContain('<section>Updated panel</section>')
      expect(app.rendered()[0].displayContent).not.toContain('Old card')
    } finally { app.close() }
  })

  it('keeps panels before, inside and after the final opening in message order', () => {
    const collection = makeCollection('agentPresetRules')
    const original = collection.agentPresetRules[0]
    collection.agentPresetRules.push(
      { ...original, id: 'footer', pattern: '/\\[FOOTER\\]/g', replacement: '<section>Footer</section>', order: 1 },
      { ...original, id: 'prompt', pattern: '/\\[PROMPT\\]/g', replacement: '<section>Prompt only</section>',
        displayOnly: false, promptOnly: true, order: 2 }
    )
    const projector = new MessageDisplayProjector(mvuMessageDisplayCompatibility)
    const content = 'Hidden preparation [CARD]\n<FINAL>Narrative [CARD]</FINAL>\n[FOOTER]\nVisible suffix\n[CARD]\n[PROMPT]'
    for (const status of ['complete', 'cancelled']) {
      const projected = projector.project({ ...sourceMessage, content, status }, collection)
      expect(projected.displayContent.match(/Old card|Footer/g)).toEqual(['Old card', 'Old card', 'Footer', 'Old card'])
      expect(projected.displayContent).toContain('Visible suffix')
      expect(projected.displayContent).toContain('[PROMPT]')
      expect(projected.displayContent).not.toContain('Hidden preparation')
      expect(projected.displayContent).not.toContain('Prompt only')
      expect(projected.content).toBe(content)
    }
  })

  it('passes final tags to display regexes before projecting the resulting frontend', () => {
    const collection = makeCollection('agentPresetRules')
    collection.agentPresetRules[0] = { ...collection.agentPresetRules[0],
      pattern: '<FINAL>([\\s\\S]*?)</FINAL>', replacement: '<section>$1</section>' }
    const content = 'Hidden preparation\n<FINAL>Wrapped narrative</FINAL>\nVisible suffix'
    const projected = new MessageDisplayProjector(mvuMessageDisplayCompatibility).project({ ...sourceMessage, content }, collection)
    expect(projected.displayContent).toContain('<section>Wrapped narrative</section>')
    expect(projected.displayContent).toContain('Visible suffix')
    expect(projected.displayContent).not.toContain('Hidden preparation')
    expect(projected.content).toBe(content)
  })

  it('waits for settled text before applying frontend replacements before the final opening', () => {
    const collection = makeCollection('agentPresetRules')
    const projector = new MessageDisplayProjector(mvuMessageDisplayCompatibility)
    const content = 'Hidden preparation [CARD] unfinished'
    const projected = projector.project({ ...sourceMessage, content, status: 'streaming' }, collection)
    expect(projected.displayContent).toBe('')
    expect(projected.displayContent).not.toContain('Hidden preparation')
    expect(projected.displayContent).not.toContain('unfinished')
    expect(projected.content).toBe(content)
    expect(projector.project({ ...sourceMessage, content, status: 'cancelled' }, collection).displayContent).toContain('Old card')
  })

  it('keeps full live source through successive display projections before and after the closing tag', async () => {
    const message = { ...sourceMessage, content: 'Hidden preparation [CARD]', status: 'streaming' }
    const app = await mount('agentPresetRules', message)
    try {
      expect(app.rendered()[0].displayContent).toBe('')
      expect(app.rendered()[0].displayContent).not.toContain('Hidden preparation')
      message.content += '\n<FINAL>Narrative</FINAL>\nFirst suffix'
      await app.catalog.refreshDetails()
      await settle()
      expect(app.rendered()[0]).toMatchObject({ content: message.content, status: 'streaming' })
      expect(app.rendered()[0].displayContent).toContain('Narrative\nFirst suffix')
      message.content += '\nSecond suffix [CARD]'
      await app.catalog.refreshDetails()
      await settle()
      expect(app.rendered()[0].displayContent).toContain('Second suffix')
      expect(app.rendered()[0].displayContent).not.toContain('Old card')
      expect(app.rendered()[0].displayContent).toContain('[CARD]')
      message.status = 'complete'
      await app.catalog.refreshDetails()
      await settle()
      expect(app.rendered()[0].content).toBe(message.content)
      expect(app.rendered()[0].displayContent).toContain('Second suffix')
      expect(app.rendered()[0].displayContent.match(/Old card/g)).toHaveLength(2)
    } finally { app.close() }
  })

  it.each(scopes)('refreshes full-reply %s matches without hiding unmatched text after the final opening', async scope => {
    const content = 'Synthetic process [CARD]\n<FINAL>\nSynthetic narrative\n</FINAL>\n[CARD]\nVisible suffix'
    const app = await mount(scope, { ...sourceMessage, content })
    try {
      expect(app.rendered()[0].displayContent).toContain('Synthetic narrative')
      expect(app.rendered()[0].displayContent.match(/Old card/g)).toHaveLength(2)
      expect(app.rendered()[0].displayContent).not.toContain('Synthetic process')
      expect(app.rendered()[0].displayContent).toContain('Visible suffix')
      expect(app.rendered()[0].content).toBe(content)
      const updated = structuredClone(app.collection())
      updated[scope][0].replacement = 'Updated footer'
      await app.regexRules.save('character-1', updated)
      await settle()
      expect(app.rendered()[0].displayContent).toBe('Synthetic narrative\nUpdated footer\nVisible suffix')
      updated.revision = app.collection().revision
      updated[scope][0].enabled = false
      await app.regexRules.save('character-1', updated)
      await settle()
      expect(app.rendered()[0].displayContent).toBe('Synthetic narrative\n[CARD]\nVisible suffix')
    } finally { app.close() }
  })

  it('keeps nonmatching image instructions in the raw message and projects rich matches from the full reply', async () => {
    const prompt = '<ACTION_CALL name="generate_image">{"frames":[{"id":1,"prompt":"synthetic prompt"}]}</ACTION_CALL>'
    const content = `${prompt}\n<FINAL>\n[CARD]\n</FINAL>`
    const app = await mount('characterRules', { ...sourceMessage, content })
    try {
      expect(app.projectDisplay).toHaveBeenCalled()
      expect(app.rendered()[0].content).toBe(content)
      expect(app.rendered()[0].displayContent).toContain('Old card')
      expect(app.rendered()[0].displayContent).not.toContain('synthetic prompt')
      expect(app.rendered()[0].displayContent).not.toContain('frames')
      const updated = structuredClone(app.collection())
      updated.characterRules[0].replacement = ''
      await app.saveRules('character-1', updated)
      await settle()
      expect(app.rendered()[0].displayContent).toBe('')
      expect(app.rendered()[0].content).toBe(content)
    } finally { app.close() }
  })

  it('invalidates the Host cache after an active preset regex revision change', () => {
    const original = makeCollection('agentPresetRules')
    const projector = new MessageDisplayProjector(mvuMessageDisplayCompatibility)
    expect(projector.project(sourceMessage, original).displayContent).toContain('Old card')
    const updated = structuredClone(original)
    updated.agentPresetRules[0].replacement = '<section>New card</section>'
    updated.agentPresetRegexRevision = 'b'.repeat(64)
    expect(projector.project(sourceMessage, updated).displayContent).toContain('New card')
    expect(updated.revision).toBe(original.revision)
  })

  for (const scope of scopes) {
    it.each(['plain', 'empty', 'disable', 'delete', 'pattern', 'depth', 'prompt', 'order', 'version', 'import'])(
      `refreshes an existing message after ${scope} %s without regeneration`, async action => {
        const app = await mount(scope)
        try {
          expect(app.rendered()[0].displayContent).toContain('Old card')
          const updated = structuredClone(app.collection())
          const rule = updated[scope][0]
          let expected = '[CARD]'
          if (action === 'plain' || action === 'import') { rule.replacement = expected = 'New plain text' }
          if (action === 'empty') rule.replacement = expected = ''
          if (action === 'disable') rule.enabled = false
          if (action === 'delete') updated[scope] = []
          if (action === 'pattern') rule.pattern = '/UNMATCHED/g'
          if (action === 'depth') rule.minDepth = 1
          if (action === 'prompt') { rule.displayOnly = false; rule.promptOnly = true }
          if (action === 'order') {
            rule.replacement = 'intermediate'
            updated[scope].push({ ...rule, id: 'second', pattern: '/intermediate/g', replacement: 'New order', order: 1 })
            await app.regexRules.save('character-1', updated)
            await settle()
            expect(app.rendered()[0].displayContent).toBe('New order')
            rule.order = 1
            updated[scope][1].order = 0
            updated.revision = app.collection().revision
            expected = 'intermediate'
          }
          if (action === 'version') {
            updated.versions = [{ id: 'off', name: 'Disabled version', globalEnabledIds: [], agentPresetEnabledIds: [], characterEnabledIds: [] }]
            updated.activeVersionId = 'off'
          }
          if (action === 'import') await app.regexRules.import('character-1', updated, 'Character', [{ displayName: 'synthetic.json', json: JSON.stringify(updated[scope]) }])
          else await app.regexRules.save('character-1', updated)
          await settle()
          expect(app.catalog.getDetailsSnapshot().details.messages[0].displayContent).toBe(expected)
          expect(app.rendered()[0].displayContent).toBe(expected)
          expect(app.rendered()[0].content).toBe('[CARD]')
        } finally { app.close() }
      })
  }

  it.each(scopes)('refreshes external %s changes without ever opening the regex editor', async scope => {
    const app = await mount(scope)
    try {
      expect(app.regexRules.getSnapshot('character-1').status).toBe('ready')
      app.collection()[scope][0].replacement = '<section>New external card</section>'
      if (scope === 'agentPresetRules') app.collection().agentPresetRegexRevision = 'b'.repeat(64)
      else app.collection().revision += 1
      app.changes.emit({ kind: 'configuration', domain: scope === 'agentPresetRules' ? 'agentPresets' : 'regexRules',
        ...(scope === 'characterRules' ? { characterId: 'character-1' } : {}) })
      await settle()
      expect(app.rendered()[0].displayContent).toContain('New external card')
    } finally { app.close() }
  })

  it.each(scopes)('uses saved %s edits when returning from configuration to chat', async scope => {
    const app = await mount(scope)
    try {
      app.catalog.activate('')
      const calls = app.projectDisplay.mock.calls.length
      const updated = structuredClone(app.collection())
      updated[scope][0].replacement = 'Saved away from chat'
      await app.regexRules.save('character-1', updated)
      await settle()
      expect(app.projectDisplay.mock.calls.length).toBe(calls)
      await app.catalog.open('chat-1')
      await settle()
      expect(app.catalog.getDetailsSnapshot().details.messages[0].displayContent).toBe('Saved away from chat')
      expect(app.rendered()[0].displayContent).toBe('Saved away from chat')
      expect(app.rendered()[0].content).toBe('[CARD]')
    } finally { app.close() }
  })

  it('keeps the last projected display while awaiting a saved rule, and rejects its late superseded result', async () => {
    const app = await mount('characterRules')
    try {
      const project = app.projectDisplay.getMockImplementation()
      const deferred = []
      app.projectDisplay.mockImplementation(async (...args) => {
        const result = await project(...args)
        return new Promise(resolve => deferred.push(() => resolve(result)))
      })
      const first = structuredClone(app.collection())
      first.characterRules[0].replacement = 'First edit'
      await app.regexRules.save('character-1', first)
      await settle()
      expect(deferred.length).toBeGreaterThan(0)
      expect(app.rendered()[0].displayContent).toContain('Old card')
      app.projectDisplay.mockImplementation(project)
      const second = structuredClone(app.collection())
      second.characterRules[0].replacement = 'Latest edit'
      await app.regexRules.save('character-1', second)
      await settle()
      expect(app.rendered()[0].displayContent).toBe('Latest edit')
      deferred.forEach(resolve => resolve())
      await settle()
      expect(app.rendered()[0].displayContent).toBe('Latest edit')
    } finally { app.close() }
  })

  it('retains the saved display if saving rules fails', async () => {
    const app = await mount('characterRules')
    try {
      app.saveRules.mockRejectedValueOnce(new Error('Synthetic save failure'))
      const updated = structuredClone(app.collection())
      updated.characterRules[0].replacement = 'Unsaved edit'
      await expect(app.regexRules.save('character-1', updated)).rejects.toThrow('Synthetic save failure')
      await settle()
      expect(app.rendered()[0].displayContent).toContain('Old card')
      expect(app.collection().characterRules[0].replacement).toContain('Old card')
    } finally { app.close() }
  })

  it('rejects a pending display result after switching chats', async () => {
    const app = await mount('characterRules')
    try {
      let finish = () => {}
      app.projectDisplay.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      const updated = structuredClone(app.collection())
      updated.characterRules[0].replacement = 'Late edit'
      await app.regexRules.save('character-1', updated)
      await settle()
      app.catalog.activate('chat-2')
      finish({ ok: true, value: [{ id: sourceMessage.id, sourceContent: sourceMessage.content,
        displayContent: 'Late edit', variableStateJson: '{}' }] })
      await settle()
      expect(app.catalog.getDetailsSnapshot()).toMatchObject({ id: 'chat-2', status: 'loading', details: null })
    } finally { app.close() }
  })
})
