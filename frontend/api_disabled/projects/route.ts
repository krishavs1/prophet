import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/routeAuth'
import { z } from 'zod'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const projects = await prisma.project.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json({ projects })
}

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(req)
  if (auth instanceof NextResponse) return auth
  const json = await req.json()
  const parsed = CreateProjectSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const project = await prisma.project.create({
    data: { userId: auth.userId, name: parsed.data.name, description: parsed.data.description },
    select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json({ project }, { status: 201 })
}

