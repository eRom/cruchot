import { classifyError, withRetry } from '../errors'

describe('classifyError', () => {
  it('classifies 401 as fatal and non-retryable', () => {
    const err = Object.assign(new Error('Unauthorized'), { statusCode: 401 })
    const result = classifyError(err)
    expect(result.category).toBe('fatal')
    expect(result.retryable).toBe(false)
    expect(result.statusCode).toBe(401)
  })

  it('classifies 403 as fatal and non-retryable', () => {
    const err = Object.assign(new Error('Forbidden'), { statusCode: 403 })
    const result = classifyError(err)
    expect(result.category).toBe('fatal')
    expect(result.retryable).toBe(false)
    expect(result.statusCode).toBe(403)
  })

  it('classifies 429 (rate limit) as transient and retryable', () => {
    const err = Object.assign(new Error('Too Many Requests'), { statusCode: 429 })
    const result = classifyError(err)
    expect(result.category).toBe('transient')
    expect(result.retryable).toBe(true)
    expect(result.statusCode).toBe(429)
  })

  it('classifies 429 with quota message as actionable and non-retryable', () => {
    const err = Object.assign(new Error('insufficient_quota exceeded'), { statusCode: 429 })
    const result = classifyError(err)
    expect(result.category).toBe('actionable')
    expect(result.retryable).toBe(false)
  })

  it('classifies 500 as transient and retryable', () => {
    const err = Object.assign(new Error('Internal Server Error'), { statusCode: 500 })
    const result = classifyError(err)
    expect(result.category).toBe('transient')
    expect(result.retryable).toBe(true)
    expect(result.statusCode).toBe(500)
  })

  it('classifies 502 as transient and retryable', () => {
    const err = Object.assign(new Error('Bad Gateway'), { statusCode: 502 })
    const result = classifyError(err)
    expect(result.category).toBe('transient')
    expect(result.retryable).toBe(true)
  })

  it('classifies 503 as transient and retryable', () => {
    const err = Object.assign(new Error('Service Unavailable'), { statusCode: 503 })
    const result = classifyError(err)
    expect(result.category).toBe('transient')
    expect(result.retryable).toBe(true)
  })

  it('classifies network errors as transient and retryable', () => {
    const err = new Error('fetch failed: ECONNREFUSED')
    const result = classifyError(err)
    expect(result.category).toBe('transient')
    expect(result.retryable).toBe(true)
  })

  it('classifies ENOTFOUND as transient', () => {
    const err = new Error('getaddrinfo ENOTFOUND api.provider.com')
    const result = classifyError(err)
    expect(result.retryable).toBe(true)
  })

  it('classifies unknown error as fatal and non-retryable', () => {
    const err = new Error('Something totally unexpected')
    const result = classifyError(err)
    expect(result.category).toBe('fatal')
    expect(result.retryable).toBe(false)
  })

  it('classifies non-Error unknown as fatal', () => {
    const result = classifyError('some string error')
    expect(result.category).toBe('fatal')
    expect(result.retryable).toBe(false)
  })

  it('unwraps cause chain to find root error', () => {
    const rootErr = Object.assign(new Error('Root 401'), { statusCode: 401 })
    const wrappedErr = Object.assign(new Error('Wrapper'), { cause: rootErr })
    const result = classifyError(wrappedErr)
    expect(result.category).toBe('fatal')
    expect(result.retryable).toBe(false)
  })

  it('classifies "invalid api key" message as fatal', () => {
    const err = new Error('Invalid API key provided')
    const result = classifyError(err)
    expect(result.category).toBe('fatal')
    expect(result.retryable).toBe(false)
  })

  it('classifies "authentication failed" as fatal', () => {
    const err = new Error('Authentication failed for this request')
    const result = classifyError(err)
    expect(result.category).toBe('fatal')
    expect(result.retryable).toBe(false)
  })

  it('uses status field (not statusCode) if present', () => {
    const err = Object.assign(new Error('Error'), { status: 503 })
    const result = classifyError(err)
    expect(result.category).toBe('transient')
    expect(result.retryable).toBe(true)
  })
})

describe('withRetry', () => {
  it('returns immediately on first success', async () => {
    let calls = 0
    const result = await withRetry(async () => {
      calls++
      return 'ok'
    }, 3, 10)
    expect(result).toBe('ok')
    expect(calls).toBe(1)
  })

  it('retries on transient error and succeeds', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls++
        if (calls < 3) {
          throw Object.assign(new Error('Server Error'), { statusCode: 503 })
        }
        return 'success'
      },
      3,
      10
    )
    expect(result).toBe('success')
    expect(calls).toBe(3)
  }, 5000)

  it('throws immediately on fatal (non-retryable) error', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
        },
        3,
        10
      )
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(calls).toBe(1)
  })

  it('throws after maxRetries on persistent transient error', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw Object.assign(new Error('Server Error'), { statusCode: 503 })
        },
        2,
        10
      )
    ).rejects.toMatchObject({ statusCode: 503 })
    // 1 initial + 2 retries = 3 total calls
    expect(calls).toBe(3)
  }, 5000)
})
