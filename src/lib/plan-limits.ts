import { prisma } from '@/lib/db'
import { getRedis } from './redis'

export type GenerationType = 'angled_shot' | 'background' | 'composite' | 'final_asset'

const PLAN_DAILY_LIMITS: Record<string, Record<GenerationType, number>> = {
  free:  { angled_shot: 25, background: 25, composite: 25, final_asset: 25 },
  pro:   { angled_shot: 200, background: 200, composite: 200, final_asset: 200 },
  scale: { angled_shot: Infinity, background: Infinity, composite: Infinity, final_asset: Infinity },
}

function startOfDayUtc(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function secondsUntilUtcMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000) + 3600
}

export async function checkPlanLimit(
  companyId: string,
  type: GenerationType,
  count = 1
): Promise<{ allowed: boolean; limit: number; used: number }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: true },
  })
  const plan = company?.plan || 'free'
  const limits = PLAN_DAILY_LIMITS[plan] ?? PLAN_DAILY_LIMITS.free
  const limit = limits[type]

  if (!isFinite(limit)) return { allowed: true, limit: -1, used: 0 }

  // Redis atomic path — eliminates the check-then-act race condition
  const redis = await getRedis()
  if (redis) {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const key = `plan:${companyId}:${type}:${today}`
      const newTotal = await redis.incrBy(key, count)
      if (newTotal === count) {
        // Key was just created — set TTL to expire after UTC midnight
        await redis.expire(key, secondsUntilUtcMidnight())
      }
      if (newTotal > limit) {
        await redis.decrBy(key, count)
        return { allowed: false, limit, used: newTotal - count }
      }
      return { allowed: true, limit, used: newTotal }
    } catch (err) {
      console.warn('[plan-limits] Redis unavailable, falling back to DB count:', err)
    }
  }

  // DB fallback — non-atomic, acceptable without Redis for small traffic
  const since = startOfDayUtc()
  let used = 0
  if (type === 'angled_shot') {
    used = await prisma.angledShot.count({ where: { companyId, createdAt: { gte: since } } })
  } else if (type === 'background') {
    used = await prisma.background.count({ where: { companyId, createdAt: { gte: since } } })
  } else if (type === 'composite') {
    used = await prisma.composite.count({ where: { companyId, createdAt: { gte: since } } })
  } else if (type === 'final_asset') {
    used = await prisma.finalAsset.count({ where: { companyId, createdAt: { gte: since } } })
  }
  return { allowed: used + count <= limit, limit, used }
}
