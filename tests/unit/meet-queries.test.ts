import { describe, it, expect } from 'vitest'

describe('meet queries', () => {
  describe('generateInviteCode', () => {
    it('generates a 6-char code from safe alphabet', async () => {
      const { generateInviteCode } = await import('../../src/main/db/queries/meet')
      const code = generateInviteCode()
      expect(code).toHaveLength(6)
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
    })

    it('generates unique codes', async () => {
      const { generateInviteCode } = await import('../../src/main/db/queries/meet')
      const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()))
      expect(codes.size).toBe(100)
    })
  })
})
