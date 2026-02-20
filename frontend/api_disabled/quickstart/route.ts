import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/routeAuth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const now = new Date()
  const name = `Quickstart ${now.toISOString().slice(0, 19).replace('T', ' ')}`
  const project = await prisma.project.create({
    data: { userId: auth.userId, name },
    select: { id: true },
  })
  const run = await prisma.run.create({
    data: { projectId: project.id, metadata: { quickstart: true } },
    select: { id: true },
  })
  const url = `/analyze?projectId=${project.id}&runId=${run.id}`
  return NextResponse.json({ url }, { status: 201 })
}

