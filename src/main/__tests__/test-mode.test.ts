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

  it('TEST_PROVIDER reflects CRUCHOT_TEST_PROVIDER env var', async () => {
    process.env.CRUCHOT_TEST_PROVIDER = 'ollama'
    const { TEST_PROVIDER } = await import('../test-mode')
    expect(TEST_PROVIDER).toBe('ollama')
  })

  it('TEST_PROVIDER is undefined when env var is not set', async () => {
    delete process.env.CRUCHOT_TEST_PROVIDER
    const { TEST_PROVIDER } = await import('../test-mode')
    expect(TEST_PROVIDER).toBeUndefined()
  })

  it('TEST_MODEL reflects CRUCHOT_TEST_MODEL env var', async () => {
    process.env.CRUCHOT_TEST_MODEL = 'qwen3.5:4b'
    const { TEST_MODEL } = await import('../test-mode')
    expect(TEST_MODEL).toBe('qwen3.5:4b')
  })

  it('TEST_API_KEY reflects CRUCHOT_TEST_API_KEY env var', async () => {
    process.env.CRUCHOT_TEST_API_KEY = 'fake-key-for-test'
    const { TEST_API_KEY } = await import('../test-mode')
    expect(TEST_API_KEY).toBe('fake-key-for-test')
  })

  it('TEST_MODEL is undefined when env var is not set', async () => {
    delete process.env.CRUCHOT_TEST_MODEL
    const { TEST_MODEL } = await import('../test-mode')
    expect(TEST_MODEL).toBeUndefined()
  })

  it('TEST_API_KEY is undefined when env var is not set', async () => {
    delete process.env.CRUCHOT_TEST_API_KEY
    const { TEST_API_KEY } = await import('../test-mode')
    expect(TEST_API_KEY).toBeUndefined()
  })

  it('assertTestMode() throws when TEST_MODE is false', async () => {
    delete process.env.CRUCHOT_TEST_MODE
    const { assertTestMode } = await import('../test-mode')
    expect(() => assertTestMode()).toThrow(/CRUCHOT_TEST_MODE/)
  })

  it('assertTestMode() does not throw when TEST_MODE is true', async () => {
    process.env.CRUCHOT_TEST_MODE = '1'
    const { assertTestMode } = await import('../test-mode')
    expect(() => assertTestMode()).not.toThrow()
  })
})
