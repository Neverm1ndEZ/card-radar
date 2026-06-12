import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { db } from '@/db'
import { cards } from '@/db/schema'
import { eq, ilike, or, SQL } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const issuer = searchParams.get('issuer')
    const card_type = searchParams.get('type')
    const search = searchParams.get('q')
    const active_only = searchParams.get('active') !== 'false'

    const conditions: SQL[] = []
    if (active_only) conditions.push(eq(cards.is_active, true))
    if (issuer) conditions.push(eq(cards.issuer, issuer))
    if (card_type) conditions.push(eq(cards.card_type, card_type))
    if (search) {
      const searchCondition = or(
        ilike(cards.name, `%${search}%`),
        ilike(cards.issuer, `%${search}%`)
      )
      if (searchCondition) conditions.push(searchCondition)
    }

    const result = await db.query.cards.findMany({
      where: conditions.length > 0 ? (t, { and }) => and(...conditions) : undefined,
      with: { categoryRates: true },
      orderBy: (t, { desc }) => [desc(t.annual_fee)],
    })

    return NextResponse.json({ cards: result })
  } catch (err) {
    console.error('[/api/cards]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
