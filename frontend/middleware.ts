import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const PROTECTED_PATHS: RegExp[] = [
  /^\/projects(?:\/|$)/,
]

const SESSION_COOKIE = 'prophet_session'

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((re) => re.test(pathname))
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'dev-insecure-secret-change-me'
  return new TextEncoder().encode(secret)
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl
  if (!isProtectedPath(pathname)) {
    return NextResponse.next()
  }

  const token: string | undefined = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    const url = new URL('/', req.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }
  try {
    await jwtVerify(token, getSecret(), { algorithms: ['HS256'] })
    return NextResponse.next()
  } catch {
    const url = new URL('/', req.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
}

