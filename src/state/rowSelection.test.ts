import { describe, it, expect } from 'vitest'
import { keysBelongToFocus, rangeBetween, toggleInSelection } from './rowSelection'

const order = [10, 20, 30, 40, 50]

describe('rangeBetween', () => {
  it('gives the rows from the anchor to the row, either way round', () => {
    expect(rangeBetween(order, 20, 40)).toEqual([20, 30, 40])
    expect(rangeBetween(order, 40, 20)).toEqual([20, 30, 40])
    expect(rangeBetween(order, 30, 30)).toEqual([30])
  })

  it('gives nothing without an anchor, or when a row is not listed', () => {
    expect(rangeBetween(order, null, 40)).toBeNull()
    expect(rangeBetween(order, 99, 40)).toBeNull()
    expect(rangeBetween(order, 20, 99)).toBeNull()
  })
})

describe('toggleInSelection', () => {
  it('adds a row to the one already selected', () => {
    expect(toggleInSelection(order, new Set(), 40, 20)).toEqual([20, 40])
  })

  it('adds to and takes out of several, in table order', () => {
    expect(toggleInSelection(order, new Set([40, 20]), 40, 10)).toEqual([10, 20, 40])
    expect(toggleInSelection(order, new Set([40, 20]), 40, 40)).toEqual([20])
  })

  it('takes out the only selected row', () => {
    expect(toggleInSelection(order, new Set(), 20, 20)).toEqual([])
  })

  it('selects the row when nothing was', () => {
    expect(toggleInSelection(order, new Set(), null, 30)).toEqual([30])
  })

  it('keeps selected rows that are no longer listed, last', () => {
    expect(toggleInSelection(order, new Set([99, 50]), null, 10)).toEqual([10, 50, 99])
  })
})

describe('keysBelongToFocus', () => {
  it('leaves the keys to a field, a menu or a slider', () => {
    expect(keysBelongToFocus({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(keysBelongToFocus({ tagName: 'INPUT', type: 'search' })).toBe(true)
    expect(keysBelongToFocus({ tagName: 'INPUT', type: 'range' })).toBe(true)
    expect(keysBelongToFocus({ tagName: 'INPUT' })).toBe(true)
    expect(keysBelongToFocus({ tagName: 'TEXTAREA' })).toBe(true)
    expect(keysBelongToFocus({ tagName: 'SELECT' })).toBe(true)
    expect(keysBelongToFocus({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('gives them to the table after a click on a button or a tick box', () => {
    expect(keysBelongToFocus({ tagName: 'BUTTON' })).toBe(false)
    expect(keysBelongToFocus({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(keysBelongToFocus({ tagName: 'BODY' })).toBe(false)
    expect(keysBelongToFocus(null)).toBe(false)
  })
})
