import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { SpendProfileSchema } from '@/lib/validators'
import { optimizeExistingCard } from '@/services/cardOptimizer'

// For a card the user already holds, return how to optimize spending on it.
const OptimizeRequestSchema = z.object({
  slug: z.string().min(1),
  monthly_spends: SpendProfileSchema,
})

export async function POST(req: NextRequest) {
  try {
    const parsed = OptimizeRequestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
    }

    const { slug, monthly_spends } = parsed.data
    const result = await optimizeExistingCard(slug, monthly_spends)
    if (!result) {
      return NextResponse.json({ error: `No card found for slug "${slug}"` }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[/api/optimize]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
