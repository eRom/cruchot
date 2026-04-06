describe('test-mode module', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('TEST_MODE is false when env var is not set', async () => {
    delete process.env.CRUCHOT_TEST_MODE
    const { TEST_MODE } = await import('../test-mode')
    expect(TEST_MODE).toBe(false)
  })

  it('TEST_MODE is true when CRUCHOT_TEST_MODE=1', async () => {
    process.env.CRUCHOT_TEST_MODE = '1'
    const { TEST_MODE } = await import('../test-mode')
    expect(TEST_MODE).toBe(true)
  })

  it('TEST_MODE is false for any value other than "1"', async () => {
    process.env.CRUCHOT_TEST_MODE = 'true'
    const { TEST_MODE } = await import('../test-mode')
    expect(TEST_MODE).toBe(false)
  })

  it('TEST_MODE is false when CRUCHOT_TEST_MODE is empty string', async () => {
    process.env.CRUCHOT_TEST_MODE = ''
    const { TEST_MODE } = await import('../test-mode')
    expect(TEST_MODE).toBe(false)
  })

  it('TEST_USERDATA reflects CRUCHOT_TEST_USERDATA env var', async () => {
    process.env.CRUCHOT_TEST_USERDATA = '/tmp/cruchot-test-abc'
    const { TEST_USERDATA } = await import('../test-mode')
    expect(TEST_USERDATA).toBe('/tmp/cruchot-test-abc')
  })

  it('TEST_USERDATA is undefined when env var is not set', async () => {
    delete process.env.CRUCHOT_TEST_USERDATA
    const { TEST_USERDATA } = await import('../test-mode')
    expect(TEST_USERDATA).toBeUndefined()
  })
})
