/**
 * Rate limiter with Redis sliding window (preferred) and in-memory fallback.
 *
 * Set REDIS_URL in Railway to enable persistent rate limits across deploys
 * and instances. Without it, limits reset on every deploy and are not shared
 * across horizontally-scaled instances.
 *
 * Redis URL format: redis://:<password>@<host>:<port>
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store — used when Redis is unavailable
const memStore = new Map<string, RateLimitEntry>()

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of memStore.entries()) {
    if (now > entry.resetAt) memStore.delete(key)
  }
}, 5 * 60 * 1000)

// Lazy Redis client — only initialised when REDIS_URL is set
let redisClient: { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<void> } | null = null

async function getRedis() {
  if (redisClient) return redisClient
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    // Dynamic import so the build doesn't fail when the package is absent
    const { createClient } = await import('redis')
    const client = createClient({ url })
    client.on('error', (err: Error) => console.error('[rate-limit] Redis error:', err.message))
    await client.connect()
    redisClient = {
      incr: (k: string) => client.incr(k),
      expire: (k: string, s: number) => client.expire(k, s).then(() => undefined),
    }
    return redisClient
  } catch (err) {
    console.warn('[rate-limit] Redis unavailable, falling back to in-memory:', err)
    return null
  }
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = await getRedis()

  if (redis) {
    try {
      const windowSeconds = Math.ceil(windowMs / 1000)
      const redisKey = `rl:${key}`
      const count = await redis.incr(redisKey)
      if (count === 1) {
        await redis.expire(redisKey, windowSeconds)
      }
      const resetAt = Date.now() + windowMs
      if (count > maxRequests) {
        return { allowed: false, remaining: 0, resetAt }
      }
      return { allowed: true, remaining: maxRequests - count, resetAt }
    } catch (err) {
      // Redis connection dropped — null out the cached client and fall through to in-memory
      console.error('[rate-limit] Redis call failed, falling back to in-memory:', err)
      redisClient = null
    }
  }

  // In-memory fallback
  const now = Date.now()
  const entry = memStore.get(key)
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs
    memStore.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: maxRequests - 1, resetAt }
  }
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }
  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt }
}
