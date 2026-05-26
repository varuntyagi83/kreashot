type RedisClient = {
  incr: (k: string) => Promise<number>
  incrBy: (k: string, n: number) => Promise<number>
  decrBy: (k: string, n: number) => Promise<number>
  expire: (k: string, s: number) => Promise<void>
}

let _client: RedisClient | null = null

export async function getRedis(): Promise<RedisClient | null> {
  if (_client) return _client
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    const { createClient } = await import('redis')
    const c = createClient({ url })
    c.on('error', (err: Error) => {
      console.error('[redis] error:', err.message)
      _client = null // force reconnection on next call
    })
    await c.connect()
    _client = {
      incr: (k) => c.incr(k),
      incrBy: (k, n) => c.incrBy(k, n),
      decrBy: (k, n) => c.decrBy(k, n),
      expire: (k, s) => c.expire(k, s).then(() => undefined),
    }
    return _client
  } catch (err) {
    console.warn('[redis] unavailable, Redis-backed features will degrade gracefully:', err)
    return null
  }
}
