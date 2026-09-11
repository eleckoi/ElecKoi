import { describe, expect, it, vi } from 'vitest'
import {
  characterDeckKeyDirection,
  hasBlockingCharacterOverlay,
  preventPointerFocus
} from '../src/renderer/src/modules/persona/components/characterProfileKeyboard.js'

function keyboardEvent(overrides = {}) {
  return {
    key: '',
    defaultPrevented: false,
    isComposing: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { closest: () => null },
    ...overrides
  }
}

describe('character profile keyboard navigation', () => {
  it('maps unmodified left and right keys without requiring deck focus', () => {
    expect(characterDeckKeyDirection(keyboardEvent({ key: 'ArrowLeft' }))).toBe(-1)
    expect(characterDeckKeyDirection(keyboardEvent({ key: 'ArrowRight' }))).toBe(1)
    expect(characterDeckKeyDirection(keyboardEvent({ key: 'Enter' }))).toBe(0)
  })

  it('leaves arrow keys alone while typing, composing, using modifiers or showing an overlay', () => {
    expect(characterDeckKeyDirection(keyboardEvent({ key: 'ArrowLeft', target: { closest: () => ({}) } }))).toBe(0)
    expect(characterDeckKeyDirection(keyboardEvent({ key: 'ArrowRight', isComposing: true }))).toBe(0)
    expect(characterDeckKeyDirection(keyboardEvent({ key: 'ArrowRight', ctrlKey: true }))).toBe(0)
    expect(characterDeckKeyDirection(keyboardEvent({ key: 'ArrowRight' }), true)).toBe(0)
  })

  it('detects blocking overlays and prevents mouse clicks from leaving focus rings', () => {
    expect(hasBlockingCharacterOverlay({ querySelector: () => ({}) })).toBe(true)
    expect(hasBlockingCharacterOverlay({ querySelector: () => null })).toBe(false)
    const preventDefault = vi.fn()
    preventPointerFocus({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
  })
})
