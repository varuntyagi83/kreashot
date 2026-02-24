import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { message: 'Ad export - to be implemented in Phase 7' },
    { status: 501 }
  )
}
