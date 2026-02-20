import { NextRequest, NextResponse } from 'next/server'
import { SiweMessage } from 'siwe'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  getNonceCookieName,
  getSessionCookieName,
  verifySession,
} from '@/lib/auth'

type VerifyBody = {
  message: string
  signature: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { message, signature } = (await req.json()) as VerifyBody
  if (typeof message !== 'string' || typeof signature !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const nonceCookie: string | undefined = req.cookies.get(getNonceCookieName())?.value
  if (!nonceCookie) {
    return NextResponse.json({ error: 'Missing nonce cookie' }, { status: 400 })
  }

  const siweMessage = new SiweMessage(message)
  const result = await siweMessage.verify({ signature })
  if (!result.success || !result.data) {
    return NextResponse.json({ error: 'Invalid SIWE' }, { status: 401 })
  }

  if (result.data.nonce !== nonceCookie) {
    return NextResponse.json({ error: 'Bad nonce' }, { status: 401 })
  }

  const address: string = (result.data.address ?? '').toLowerCase()
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 })
  }

  // Upsert user by address
  const user = await prisma.user.upsert({
    where: { address },
    update: {},
    create: { address },
    select: { id: true, address: true, createdAt: true },
  })

  // Issue session
  const token: string = await createSession({ userId: user.id, address: user.address })
  const res = NextResponse.json({ user })
  res.cookies.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  // Clear used nonce
  res.cookies.set(getNonceCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
    path: '/',
  })
  return res
}

