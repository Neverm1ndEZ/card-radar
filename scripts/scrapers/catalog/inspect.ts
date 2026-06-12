import { db } from '../../../db'
import { scrapedCardStaging } from '../../../db/schema'
import { sql } from 'drizzle-orm'

// Usage: inspect.ts <name-substring> [field]
async function main() {
  const needle = process.argv[2] ?? ''
  const rows = await db
    .select()
    .from(scrapedCardStaging)
    .where(sql`lower(${scrapedCardStaging.card_name}) like ${'%' + needle.toLowerCase() + '%'}`)

  for (const r of rows) {
    console.log('═══════════════════════════════════════')
    console.log('card_name:', r.card_name)
    console.log('issuer:', r.issuer, '| slug:', r.slug)
    console.log('url:', r.source_url)
    console.log('confidence:', r.confidence, '| promoted:', r.promoted)
    console.log('promote_skipped_reason:', r.promote_skipped_reason)
    console.log('--- extracted ---')
    console.log(JSON.stringify(r.extracted, null, 2))
    if (process.argv[3] === 'raw') {
      console.log('--- raw_excerpt ---')
      console.log(r.raw_excerpt)
    }
  }
  console.log(`\n(${rows.length} rows)`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
