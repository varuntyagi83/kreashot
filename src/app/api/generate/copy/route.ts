import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'

export async function POST() {
  const ctx = await requireSession()
  if (ctx instanceof NextResponse) return ctx

  return NextResponse.json(
    { message: 'Copy generation - to be implemented in Phase 4' },
    { status: 501 }
  )
}
