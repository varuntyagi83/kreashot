import { checkPlanLimit } from '@/lib/plan-limits'

// Mock the entire @/lib/db module so Prisma never connects to a real DB
jest.mock('@/lib/db', () => ({
  prisma: {
    company: {
      findUnique: jest.fn(),
    },
    angledShot: { count: jest.fn() },
    background: { count: jest.fn() },
    composite: { count: jest.fn() },
    finalAsset: { count: jest.fn() },
  },
}))

import { prisma } from '@/lib/db'

// Cast to access jest.fn() methods on each field
const mockCompanyFindUnique = prisma.company.findUnique as jest.Mock
const mockAngledShotCount = prisma.angledShot.count as jest.Mock
const mockBackgroundCount = prisma.background.count as jest.Mock
const mockCompositeCount = prisma.composite.count as jest.Mock
const mockFinalAssetCount = prisma.finalAsset.count as jest.Mock

describe('checkPlanLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('allows free plan under daily limit', async () => {
    mockCompanyFindUnique.mockResolvedValue({ plan: 'free' })
    mockCompositeCount.mockResolvedValue(10)

    const result = await checkPlanLimit('company-1', 'composite', 1)
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(25)
    expect(result.used).toBe(10)
  })

  it('blocks free plan at daily limit', async () => {
    mockCompanyFindUnique.mockResolvedValue({ plan: 'free' })
    mockCompositeCount.mockResolvedValue(25)

    const result = await checkPlanLimit('company-1', 'composite', 1)
    expect(result.allowed).toBe(false)
  })

  it('allows pro plan up to 200/day', async () => {
    mockCompanyFindUnique.mockResolvedValue({ plan: 'pro' })
    mockAngledShotCount.mockResolvedValue(199)

    const result = await checkPlanLimit('company-1', 'angled_shot', 1)
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(200)
  })

  it('blocks pro plan over 200/day', async () => {
    mockCompanyFindUnique.mockResolvedValue({ plan: 'pro' })
    mockBackgroundCount.mockResolvedValue(200)

    const result = await checkPlanLimit('company-1', 'background', 1)
    expect(result.allowed).toBe(false)
  })

  it('allows scale plan unlimited', async () => {
    mockCompanyFindUnique.mockResolvedValue({ plan: 'scale' })

    const result = await checkPlanLimit('company-1', 'composite', 100)
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(-1)
    // Should not query DB for count since limit is Infinity
    expect(mockCompositeCount).not.toHaveBeenCalled()
  })

  it('falls back to free plan when company not found', async () => {
    mockCompanyFindUnique.mockResolvedValue(null)
    mockCompositeCount.mockResolvedValue(0)

    const result = await checkPlanLimit('missing-company', 'composite', 1)
    expect(result.limit).toBe(25)
  })

  it('respects batch count against limit', async () => {
    mockCompanyFindUnique.mockResolvedValue({ plan: 'free' })
    mockCompositeCount.mockResolvedValue(20)

    // 20 used + batch of 6 = 26, exceeds 25
    const result = await checkPlanLimit('company-1', 'composite', 6)
    expect(result.allowed).toBe(false)
  })

  it('allows pro plan exactly at limit when batch fits', async () => {
    mockCompanyFindUnique.mockResolvedValue({ plan: 'pro' })
    mockFinalAssetCount.mockResolvedValue(199)

    // 199 used + 1 = 200, exactly at limit — allowed
    const result = await checkPlanLimit('company-1', 'final_asset', 1)
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(199)
  })

  it('returns used count of 0 for scale plan', async () => {
    mockCompanyFindUnique.mockResolvedValue({ plan: 'scale' })

    const result = await checkPlanLimit('company-1', 'background', 1)
    expect(result.used).toBe(0)
  })
})
