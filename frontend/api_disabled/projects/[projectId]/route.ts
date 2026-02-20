import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/routeAuth'

type Params = { params: { projectId: string } }

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const { projectId } = params
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: auth.userId },
    select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ project })
}

