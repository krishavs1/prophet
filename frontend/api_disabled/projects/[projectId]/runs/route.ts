import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/routeAuth'
import { z } from 'zod'

type Params = { params: { projectId: string } }

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const { projectId } = params
  // Verify ownership
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const runs = await prisma.run.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      contractSource: true,
      metadata: true,
    },
  })
  return NextResponse.json({ runs })
}

const CreateRunSchema = z.object({
  metadata: z.any().optional(),
})

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const { projectId } = params
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const json = await req.json()
  const parsed = CreateRunSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  const run = await prisma.run.create({
    data: { projectId, metadata: parsed.data.metadata },
    select: { id: true, status: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json({ run }, { status: 201 })
}

