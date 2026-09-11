import { describe, expect, it } from 'vitest'
import {
  AUTHOR_API_VERSION,
  AuthorBridgeRequestGate,
  inlineMessageInteractivePermissions,
  routeAuthorApiRequest
} from '@eleckoi/author-sdk'
import {
  MVU_STATUS_PLACEHOLDER,
  injectMvuFrontendActionBridge,
  injectMvuFrontendSnapshotBridge,
  mvuMessageDisplayCompatibility,
  resolveMvuMessageVariableMacros
} from '@eleckoi/compatibility-mvu'
import {
  decorateRichDisplayReplacement,
  detectCompleteStreamingRichMessageDocument,
  detectRichMessagePresentation
} from '../src/shared/foundation/richMessage'
import { transformWithRegexRules } from '../src/shared/foundation/regex/RegexRuleProcessor'
import type { RegexRule } from '../src/shared/contracts/regex/schemas'

function request(method: string, params: Record<string, unknown> = {}) {
  return JSON.stringify({ id: 'test-1', apiVersion: AUTHOR_API_VERSION, method, params })
}

describe('author SDK routing', () => {
  it('allows the inline read surface but rejects an unauthorized write before invoking native code', async () => {
    const invoked: string[] = []
    const allowed = JSON.parse(await routeAuthorApiRequest(
      request('variables.getState'),
      inlineMessageInteractivePermissions,
      (method) => { invoked.push(method); return { value: 1 } }
    )) as { ok: boolean; result: unknown }
    const denied = JSON.parse(await routeAuthorApiRequest(
      request('variables.setState', { state: {} }),
      inlineMessageInteractivePermissions,
      (method) => { invoked.push(method) }
    )) as { ok: boolean; error: { code: string } }
    expect(allowed).toMatchObject({ ok: true, result: { value: 1 } })
    expect(denied).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    expect(invoked).toEqual(['variables.getState'])
  })

  it('bounds request size, concurrency and rate without leaking acquired slots', () => {
    let time = 0
    const gate = new AuthorBridgeRequestGate(8, 1, 2, 100, () => time)
    expect(gate.tryAcquire('123456789')).toBe('BRIDGE_REQUEST_TOO_LARGE')
    expect(gate.tryAcquire('one')).toBeNull()
    expect(gate.tryAcquire('two')).toBe('BRIDGE_BUSY')
    gate.release()
    expect(gate.tryAcquire('two')).toBeNull()
    gate.release()
    expect(gate.tryAcquire('three')).toBe('BRIDGE_RATE_LIMITED')
    time = 101
    expect(gate.tryAcquire('three')).toBeNull()
  })
})

describe('MVU display compatibility', () => {
  it('resolves macros from the message snapshot rather than a mutable global state', () => {
    const state = JSON.stringify({ stat_data: { player: { hp: 7 }, tags: ['a', 'b'] } })
    expect(resolveMvuMessageVariableMacros('HP={{get_message_variable::player.hp}}', state)).toBe('HP=7')
    expect(resolveMvuMessageVariableMacros('{{format_message_variable::tags}}', state)).toBe('- a\n- b')
  })

  it('adds the status placeholder only to a complete assistant projection whose display rules use it', () => {
    const patterns = [`/${MVU_STATUS_PLACEHOLDER.replace('/', '\\/')}/g`]
    expect(mvuMessageDisplayCompatibility.prepareAssistantText('正文', false, patterns)).toBe('正文')
    expect(mvuMessageDisplayCompatibility.prepareAssistantText('正文', true, [])).toBe('正文')
    expect(mvuMessageDisplayCompatibility.prepareAssistantText('正文', true, patterns)).toContain(MVU_STATUS_PLACEHOLDER)
  })

  it('injects read-only snapshot and controlled action bridges only when referenced', () => {
    const html = '<script>getAllVariables(); triggerSlash("/send hi|/trigger")</script>'
    const withSnapshot = injectMvuFrontendSnapshotBridge(html, '{"stat_data":{"hp":3}}')
    const withActions = injectMvuFrontendActionBridge(withSnapshot)
    expect(withActions).toContain('eleckoi-mvu-snapshot-bridge')
    expect(withActions).toContain('eleckoi-mvu-action-bridge')
    expect(withActions).toContain('readOnly: true')
    expect(injectMvuFrontendSnapshotBridge('<div>plain</div>', '{}')).toBe('<div>plain</div>')
  })
})

describe('rich message projection', () => {
  it('does not execute fenced examples or incomplete streaming HTML', () => {
    expect(detectRichMessagePresentation('```html\n<div class="demo">x</div>\n```', false)).toBeNull()
    expect(detectCompleteStreamingRichMessageDocument('<div class="demo">')).toBeNull()
    expect(detectCompleteStreamingRichMessageDocument('<div class="demo">ok</div>')).not.toBeNull()
  })

  it('promotes complete frontend documents in Markdown fences', () => {
    const presentation = detectRichMessagePresentation(
      'before\n```html\n<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body>card</body></html>\n```\nafter',
      false
    )
    expect(presentation?.parts.map((part) => part.kind)).toEqual(['markdown', 'rich', 'markdown'])
    expect(presentation?.parts[1]).toMatchObject({
      kind: 'rich',
      document: {
        kind: 'full-document',
        source: '<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body>card</body></html>'
      }
    })
  })

  it('promotes a fenced frontend document alongside a decorated regex frontend', () => {
    const source = [
      '```html',
      '<!DOCTYPE html><html><head></head><body>opening</body></html>',
      '```',
      decorateRichDisplayReplacement('<div class="status">status</div>')
    ].join('\n')
    const presentation = detectRichMessagePresentation(source, false)
    expect(presentation?.parts.map((part) => part.kind)).toEqual(['rich', 'rich'])
    expect(presentation?.parts[0]).toMatchObject({
      kind: 'rich',
      document: { kind: 'full-document' }
    })
    expect(presentation?.parts[1]).toMatchObject({
      kind: 'rich',
      document: { kind: 'fragment' }
    })
  })

  it('treats body-only interactive output as a standalone rich document', () => {
    const presentation = detectRichMessagePresentation(
      '<body><main id="panel">ready</main><script>window.ready=true</script></body>',
      false
    )
    expect(presentation?.parts).toHaveLength(1)
    expect(presentation?.parts[0]).toMatchObject({ kind: 'rich', document: { kind: 'full-document' } })
  })

  it('protects rich regex output from later display rules and splits it from Markdown', () => {
    const rules: RegexRule[] = [
      { id: 'rich', name: 'rich', pattern: '/STATUS/g', replacement: '<div class="board">value</div>', targets: ['AiOutput'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 },
      { id: 'later', name: 'later', pattern: '/value/g', replacement: 'mutated', targets: ['AiOutput'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 1 }
    ]
    const result = transformWithRegexRules('before STATUS after', rules, 'AiOutput', {
      replacementDecorator: decorateRichDisplayReplacement,
      protectDecoratedReplacements: true
    })
    expect(result).toContain('value</div>')
    expect(result).not.toContain('mutated')
    expect(detectRichMessagePresentation(result, false)?.parts.map((part) => part.kind)).toEqual(['markdown', 'rich', 'markdown'])
  })
})
