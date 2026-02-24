import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { message: 'Final asset generation - to be implemented in Phase 6' },
    { status: 501 }
  )
}
