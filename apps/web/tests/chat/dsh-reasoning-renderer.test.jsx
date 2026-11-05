// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { OfficialReasoningRow } from '../../../../tests/helpers/officialTrajectory.js'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
let root
afterEach(async () => {
  if (root) await act(() => root.unmount())
  root = undefined
  document.body.replaceChildren()
})

it('keeps raw reasoning available to the Body Slot while rendering display text through streaming and settlement', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const renderSlot = vi.fn((_name, props) => <p data-reasoning-body>{props.text}</p>)
  const props = { useDisclosure: () => ({ expanded: true, toggle() {} }),
    usePresentation: selector => selector({ settledReasoningPreview: true }),
    renderSlot, t: key => key }
  const render = (text, running) => act(() => root.render(<OfficialReasoningRow {...props} text={text} running={running} />))

  await render('<sign', true)
  expect(host.textContent).toBe('')
  expect(host.querySelector('[data-reasoning-body]')).toBeNull()
  expect(renderSlot).toHaveBeenLastCalledWith('conversation.chat.reasoning.body', {
    rawText: '<sign', text: '', running: true,
  })
  await render('<signature>Synthetic opaque data', true)
  expect(host.textContent).toBe('')
  expect(host.querySelector('[data-reasoning-body]')).toBeNull()

  const rawText = '<signature>Synthetic opaque data</signature>\r\n\r\nSynthetic **visible reasoning**'
  await render(rawText, true)
  expect(renderSlot).toHaveBeenLastCalledWith('conversation.chat.reasoning.body', {
    rawText, text: 'Synthetic **visible reasoning**', running: true,
  })
  expect(host.querySelector('[data-reasoning-body]').textContent).toBe('Synthetic **visible reasoning**')
  expect(host.textContent).not.toContain('Synthetic opaque data')

  await render(rawText, false)
  expect(renderSlot).toHaveBeenLastCalledWith('conversation.chat.reasoning.body', {
    rawText, text: 'Synthetic **visible reasoning**', running: false,
  })
  await render('Synthetic ordinary reasoning', false)
  expect(renderSlot).toHaveBeenLastCalledWith('conversation.chat.reasoning.body', {
    rawText: 'Synthetic ordinary reasoning', text: 'Synthetic ordinary reasoning', running: false,
  })
})
