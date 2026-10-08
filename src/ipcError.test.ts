import { describe, it, expect } from 'vitest'
import { ipcErrorMessage } from './ipcError'

describe('ipcErrorMessage', () => {
  it("keeps the handler's own message", () => {
    expect(ipcErrorMessage(new Error("Error invoking remote method 'tags:renameGenre': Error: There is already a Tag called \"House\""))).toBe('There is already a Tag called "House"')
    expect(ipcErrorMessage(new Error("Error invoking remote method 'x': It broke"))).toBe('It broke')
  })

  it('leaves other errors and values as they are', () => {
    expect(ipcErrorMessage(new Error('plain'))).toBe('plain')
    expect(ipcErrorMessage('text')).toBe('text')
  })
})
