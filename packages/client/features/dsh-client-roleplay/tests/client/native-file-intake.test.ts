// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import { relativizeToCwd, workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'

const require = createRequire(import.meta.url)
const ts = createRequire(require.resolve('@deepseek-ai/dsh-typert-generator/package.json'))('typescript')
const source = readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-conversation/client'), 'utf8')
const ast = ts.createSourceFile('native.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
let body: string | undefined
function visit(node: any) {
  if (ts.isPropertyAssignment(node) && node.name?.getText(ast) === 'addFiles' && ts.isArrowFunction(node.initializer)) {
    if (body) throw Error('Native file intake is no longer unique')
    body = node.initializer.getText(ast)
  }
  ts.forEachChild(node, visit)
}
visit(ast)
if (!body) throw Error('Locked native file intake changed')

function intake(desktop: boolean) {
  const add = vi.fn((_references: unknown[], _ids: string[]) => true), createDrafts = vi.fn((_id, files) => files.map((file: File, i: number) => ({ id: `draft-${i}`, file })))
  const build = new Function('sessions', 'sessionId', 'shell', 't', 'bridge', 'cwd', 'isImageMediaType', 'formatFileMention', 'relativizeToCwd', 'workspaceTitleOf', 'conversation', 'UnsupportedImageMediaTypeError', `return (${body})`)
  const filePath = 'C:\\outside-workspace\\测试.txt'
  const run = build({ binding: () => ({ session: { getSnapshot: () => ({ subagent: null }) } }), list: { getSnapshot: () => ({ byId: { session: { cwd: 'C:\\workspace' } } }) } }, 'session',
    { snapshot: { phase: 'idle' }, addFiles: add }, (key: string) => key,
    desktop ? { pathFor: (file: File) => file.name.endsWith('.txt') ? filePath : '' } : undefined,
    'C:\\workspace', (type: string) => type.startsWith('image/'), formatFileMention, relativizeToCwd, workspaceTitleOf,
    { createDrafts, releaseDraftAttachments: vi.fn() }, class extends Error {})
  return { run, add, createDrafts, filePath }
}
describe('locked official file intake shared by picking and dropping files', () => {
  it('keeps desktop files outside the Workspace as native path references for the native reader', () => {
    const f = intake(true), file = new File(['正文'], '测试.txt', { type: 'text/plain' })
    expect(f.run([file])).toBeNull()
    expect(f.createDrafts).toHaveBeenCalledWith('session', [], true)
    expect(f.add.mock.calls[0]![0]).toEqual([expect.objectContaining({ ref: formatFileMention({ path: f.filePath, kind: 'file' }, false) })])
  })
  it('passes Android/browser documents and images to the native upload queue without a host path', () => {
    const f = intake(false), file = new File(['正文'], '测试.txt', { type: 'text/plain' }), image = new File(['image'], 'photo.png', { type: 'image/png' })
    expect(f.run([file, image])).toBeNull()
    expect(f.createDrafts).toHaveBeenCalledWith('session', [file, image], true)
    expect(f.add).toHaveBeenCalledWith([], ['draft-0', 'draft-1'])
  })
  it('keeps desktop images on the same native image upload route', () => {
    const f = intake(true), image = new File(['image'], 'photo.png', { type: 'image/png' })
    expect(f.run([image])).toBeNull()
    expect(f.createDrafts).toHaveBeenCalledWith('session', [image], true)
  })
})
