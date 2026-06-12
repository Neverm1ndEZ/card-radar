import { db } from '../../../db'
import { cards, scrapedCardStaging } from '../../../db/schema'
import { sql } from 'drizzle-orm'

async function main() {
  const cardCount = await db.select({ n: sql<number>`count(*)` }).from(cards)
  const byBank = await db
    .select({
      issuer: scrapedCardStaging.issuer,
      total: sql<number>`count(*)`,
      scraped: sql<number>`count(*) filter (where ${scrapedCardStaging.scraped_at} is not null)`,
      promoted: sql<number>`count(*) filter (where ${scrapedCardStaging.promoted} = true)`,
      staged_not_promoted: sql<number>`count(*) filter (where ${scrapedCardStaging.scraped_at} is not null and ${scrapedCardStaging.promoted} = false)`,
    })
    .from(scrapedCardStaging)
    .groupBy(scrapedCardStaging.issuer)
    .orderBy(scrapedCardStaging.issuer)

  console.log('=== cards table:', Number(cardCount[0].n), 'live cards ===')
  console.log('issuer       total scraped promoted staged-not-promoted')
  for (const r of byBank) {
    console.log(
      `${r.issuer.padEnd(12)} ${String(r.total).padStart(5)} ${String(r.scraped).padStart(7)} ${String(r.promoted).padStart(8)} ${String(r.staged_not_promoted).padStart(18)}`,
    )
  }
  const totals = byBank.reduce(
    (a, r) => ({
      total: a.total + Number(r.total),
      scraped: a.scraped + Number(r.scraped),
      promoted: a.promoted + Number(r.promoted),
    }),
    { total: 0, scraped: 0, promoted: 0 },
  )
  console.log(`TOTAL        ${String(totals.total).padStart(5)} ${String(totals.scraped).padStart(7)} ${String(totals.promoted).padStart(8)}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
