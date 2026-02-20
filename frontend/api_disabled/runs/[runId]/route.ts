import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/routeAuth'
import { z } from 'zod'

type Params = { params: { runId: string } }

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const { runId } = params
  const run = await prisma.run.findFirst({
    where: { id: runId, project: { userId: auth.userId } },
    select: {
      id: true,
      projectId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      contractSource: true,
      prophetReport: true,
      simulationLogs: true,
      metadata: true,
    },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ run })
}

const UpdateRunSchema = z.object({
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
  contractSource: z.string().max(1_000_000).nullable().optional(),
  prophetReport: z.any().nullable().optional(),
  simulationLogs: z.any().nullable().optional(),
  metadata: z.any().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const { runId } = params
  // Ensure run belongs to user
  const owned = await prisma.run.findFirst({
    where: { id: runId, project: { userId: auth.userId } },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const json = await req.json()
  const parsed = UpdateRunSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  const run = await prisma.run.update({
    where: { id: runId },
    data: parsed.data,
    select: {
      id: true,
      status: true,
      updatedAt: true,
      contractSource: true,
      prophetReport: true,
      simulationLogs: true,
      metadata: true,
    },
  })
  return NextResponse.json({ run })
}

