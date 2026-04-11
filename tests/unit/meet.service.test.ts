import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
    clients: new Set()
  }))
}))

vi.mock('../../src/main/db/queries/meet', () => ({
  createMeetSession: vi.fn().mockReturnValue({
    id: 'session-1',
    inviteCode: 'ABC234',
    inviteExpiresAt: new Date(Date.now() + 900_000)
  }),
  getMeetSessionByInviteCode: vi.fn(),
  getMeetSessionById: vi.fn(),
  getActiveMeetSession: vi.fn(),
  updateMeetSession: vi.fn(),
  endMeetSession: vi.fn(),
  addMeetCost: vi.fn(),
  getMeetSessionCosts: vi.fn().mockReturnValue([])
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

describe('MeetService', () => {
  it('should be importable and export meetService singleton', async () => {
    const mod = await import('../../src/main/services/meet.service')
    expect(mod.meetService).toBeDefined()
    expect(typeof mod.meetService.createSession).toBe('function')
    expect(typeof mod.meetService.endSession).toBe('function')
    expect(typeof mod.meetService.relayChunkToGuest).toBe('function')
  })
})
