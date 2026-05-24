import { prisma } from '@/lib/db'

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
