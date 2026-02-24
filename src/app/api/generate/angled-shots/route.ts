import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { message: 'Angled shots generation - to be implemented in Phase 2' },
    { status: 501 }
  )
}
