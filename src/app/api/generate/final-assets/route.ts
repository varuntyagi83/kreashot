import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'

export async function POST() {
  const ctx = await requireSession()
  if (ctx instanceof NextResponse) return ctx
  return NextResponse.json(
    { message: 'Final asset generation - to be implemented in Phase 6' },
    { status: 501 }
  )
}
