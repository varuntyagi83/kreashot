import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { message: 'Background generation - to be implemented in Phase 3' },
    { status: 501 }
  )
}
