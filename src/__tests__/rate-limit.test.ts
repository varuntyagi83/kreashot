/**
 * Tests for the in-memory fallback path of checkRateLimit.
 *
 * REDIS_URL is deliberately absent so getRedis() returns null and the
 * module uses its in-memory Map. Each describe block resets the module
 * registry so the Map and the redisClient singleton start fresh.
 */

// Remove REDIS_URL before any module loads
delete process.env.REDIS_URL

describe('checkRateLimit — in-memory fallback', () => {
  let checkRateLimit: (
    key: string,
    maxRequests: number,
    windowMs: number
  ) => Promise<{ allowed: boolean; remaining: number; resetAt: number }>

  beforeAll(async () => {
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    checkRateLimit = (await import('@/lib/rate-limit')).checkRateLimit
  })

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('allows first request and returns maxRequests - 1 remaining', async () => {
    const key = `test-allow-first-${Date.now()}`
    const result = await checkRateLimit(key, 5, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('allows up to maxRequests within the window', async () => {
    const key = `test-up-to-max-${Date.now()}`
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit(key, 3, 60_000)
      expect(r.allowed).toBe(true)
    }
  })

  it('blocks request N+1 (one over the limit)', async () => {
    const key = `test-over-limit-${Date.now()}`
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(key, 3, 60_000)
    }
    const result = await checkRateLimit(key, 3, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('remaining decrements with each allowed request', async () => {
    const key = `test-remaining-${Date.now()}`
    const r1 = await checkRateLimit(key, 5, 60_000)
    const r2 = await checkRateLimit(key, 5, 60_000)
    const r3 = await checkRateLimit(key, 5, 60_000)
    expect(r1.remaining).toBe(4)
    expect(r2.remaining).toBe(3)
    expect(r3.remaining).toBe(2)
  })

  it('allows requests again after the window resets', async () => {
    const key = `test-reset-${Date.now()}`
    const windowMs = 1_000

    // Exhaust the limit
    for (let i = 0; i < 2; i++) {
      await checkRateLimit(key, 2, windowMs)
    }
    const blocked = await checkRateLimit(key, 2, windowMs)
    expect(blocked.allowed).toBe(false)

    // Advance time past the window by mocking Date.now()
    const future = Date.now() + windowMs + 100
    const spy = jest.spyOn(Date, 'now').mockReturnValue(future)

    const result = await checkRateLimit(key, 2, windowMs)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1)

    spy.mockRestore()
  })

  it('resetAt is in the future', async () => {
    const key = `test-resetAt-${Date.now()}`
    const before = Date.now()
    const result = await checkRateLimit(key, 5, 10_000)
    expect(result.resetAt).toBeGreaterThan(before)
  })

  it('different keys are tracked independently', async () => {
    const keyA = `test-keyA-${Date.now()}`
    const keyB = `test-keyB-${Date.now()}`

    // Exhaust keyA
    for (let i = 0; i < 2; i++) await checkRateLimit(keyA, 2, 60_000)
    const blockedA = await checkRateLimit(keyA, 2, 60_000)
    expect(blockedA.allowed).toBe(false)

    // keyB should be unaffected
    const resultB = await checkRateLimit(keyB, 2, 60_000)
    expect(resultB.allowed).toBe(true)
  })
})
