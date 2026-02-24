import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { message: 'Products endpoint - to be implemented in Phase 1' },
    { status: 501 }
  )
}

export async function POST() {
  return NextResponse.json(
    { message: 'Products endpoint - to be implemented in Phase 1' },
    { status: 501 }
  )
}
