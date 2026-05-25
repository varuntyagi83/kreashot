import { getRedis } from './redis'

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
      console.error('[rate-limit] Redis call failed, falling back to in-memory:', err)
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
