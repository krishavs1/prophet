import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionCookieName, verifySession } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token: string | undefined = req.cookies.get(getSessionCookieName())?.value
  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 })
  }
  const session = await verifySession(token)
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 })
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, address: true, createdAt: true },
  })
  return NextResponse.json({ user })
}

