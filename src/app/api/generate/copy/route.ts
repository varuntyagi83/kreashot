import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { message: 'Copy generation - to be implemented in Phase 4' },
    { status: 501 }
  )
}
