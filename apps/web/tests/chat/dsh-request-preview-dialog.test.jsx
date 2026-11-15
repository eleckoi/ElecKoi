// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('React', React)
const { RequestPreviewDialog } = await import('../../src/modules/chat/components/RequestPreviewDialog.jsx')
const items = content => [{ order: 1, messageId: 'synthetic-input', role: 'user', kind: 'user',
  title: '合成输入', source: '本轮输入', anchor: '', content }]
const requests = [1, 2].map(round => ({ id: `request-${round}`, round, request: 1, turn: round, step: 1, model: 'synthetic' }))
let root, host
beforeEach(() => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
const click = async element => { expect(element).not.toBeNull(); await act(async () => element.click()) }
const catalogButton = round => [...document.querySelectorAll('.request-preview-round')]
  .find(section => section.querySelector('h3').textContent === `第 ${round} 轮`)?.querySelector('button')
async function render(model, onClose = vi.fn()) {
  await act(async () => root.render(<RequestPreviewDialog conversationId="synthetic-conversation" conversationModel={model} onClose={onClose} />))
}
function model() {
  let publish
  const value = {
    observeRequestPreviews: vi.fn(async (_id, onChange) => { publish = onChange; onChange([]) }),
    readRequestPreview: vi.fn(),
    async publish(requests) { await act(async () => publish(requests)) }
  }
  return value
}

describe('runtime request preview dialog', () => {
  it('loads only the selected request, aborts obsolete reads and follows new requests until an older request is selected', async () => {
    const service = model()
    const pending = []
    service.readRequestPreview.mockImplementation((_id, id, signal) => new Promise(resolve => pending.push({ id, signal, resolve })))
    await render(service)
    expect(document.body.textContent).toContain('本次运行尚未发起请求')
    expect(service.readRequestPreview).not.toHaveBeenCalled()
    await service.publish(requests)
    expect(pending[0].id).toBe('request-2')
    await click(catalogButton(1))
    expect(pending[0].signal.aborted).toBe(true)
    await act(async () => {
      pending[1].resolve({ items: items('合成已选择请求') })
      pending[0].resolve({ items: items('合成迟到请求') })
    })
    expect(document.body.textContent).toContain('合成已选择请求')
    expect(document.body.textContent).not.toContain('合成迟到请求')
    await service.publish([...requests, { ...requests[1], id: 'request-3', request: 2 }])
    expect(service.readRequestPreview).toHaveBeenCalledTimes(2)
    await click(document.querySelector('.request-preview-round button:last-child'))
    expect(pending[2].id).toBe('request-3')
    await service.publish([...requests, { ...requests[1], id: 'request-3', request: 2 }, { ...requests[1], id: 'request-4', request: 3 }])
    expect(pending[2].signal.aborted).toBe(true)
    expect(pending[3].id).toBe('request-4')
    await act(async () => root.render(null))
    expect(service.observeRequestPreviews.mock.calls[0][2].aborted).toBe(true)
    expect(pending[3].signal.aborted).toBe(true)
  })

  it('keeps role, title, source, order and readable body with opt-in expansion and request-specific retry', async () => {
    const service = model()
    const body = '合成设定文本\n'.repeat(60)
    service.readRequestPreview.mockRejectedValueOnce(new Error('合成读取失败')).mockResolvedValueOnce({ items: items(body) })
    await render(service)
    await service.publish(requests.slice(0, 1))
    expect(document.querySelector('[role="alert"]').textContent).toContain('合成读取失败')
    await click(document.querySelector('[role="alert"] button'))
    const entry = document.querySelector('.request-preview-content li')
    expect(entry.textContent).toContain('合成输入')
    expect(entry.textContent).toContain('用户')
    expect(entry.textContent).toContain('本轮输入')
    expect(entry.querySelector('pre').textContent).not.toBe(body)
    await click(entry.querySelector('button'))
    expect(entry.querySelector('pre').textContent).toBe(body)
    expect(entry.querySelector('button').getAttribute('aria-expanded')).toBe('true')
    expect(service.readRequestPreview.mock.calls.map(call => call[1])).toEqual(['request-1', 'request-1'])
    const onClose = vi.fn()
    await render(service, onClose)
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
