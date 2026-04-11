import { describe, it, expect, vi } from 'vitest'

vi.mock('ws', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1
  })),
  WebSocket: { OPEN: 1 }
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

describe('MeetClientService', () => {
  it('should be importable and export meetClientService singleton', async () => {
    const mod = await import('../../src/main/services/meet-client.service')
    expect(mod.meetClientService).toBeDefined()
    expect(typeof mod.meetClientService.join).toBe('function')
    expect(typeof mod.meetClientService.leave).toBe('function')
    expect(typeof mod.meetClientService.sendChat).toBe('function')
  })
})
