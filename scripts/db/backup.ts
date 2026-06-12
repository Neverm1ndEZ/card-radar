/**
 * Backup the scraped card catalog into mirror tables, kept in sync with prod.
 *
 * The catalog scraper owns three tables of scraped data:
 *   cards · card_category_rates · card_benefits
 * This creates `<table>_backup` mirrors and refreshes them from prod (truncate +
 * copy). It runs automatically at the end of every scrape (see run.ts), so the
 * backups always reflect the latest promoted catalog, and can also be run alone:
 *
 *   bun run db:backup
 *
 * The mirrors are created with LIKE ... INCLUDING ALL (copies columns, defaults,
 * not-null, checks, indexes, PK/unique) but NOT foreign keys — so they're
 * standalone snapshots that never interfere with prod writes or each other.
 */

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'
import * as schema from '../../db/schema'

// Source -> mirror. Order doesn't matter (mirrors carry no FKs).
const BACKUP_TABLES = ['cards', 'card_category_rates', 'card_benefits'] as const

type Db = { execute: (q: ReturnType<typeof sql.raw>) => Promise<unknown> }

export async function backupScrapedCards(db: Db): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const t of BACKUP_TABLES) {
    const bak = `${t}_backup`
    // Drop + recreate each refresh so the mirror always matches the CURRENT prod
    // schema (a plain TRUNCATE+INSERT would break the moment a column is added).
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${bak}`))
    await db.execute(sql.raw(`CREATE TABLE ${bak} (LIKE ${t} INCLUDING ALL)`))
    await db.execute(sql.raw(`INSERT INTO ${bak} SELECT * FROM ${t}`))
    const res = (await db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM ${bak}`)
    )) as { rows?: { n: number }[] } | { n: number }[]
    const rows = Array.isArray(res) ? res : (res.rows ?? [])
    counts[bak] = rows[0]?.n ?? 0
  }
  return counts
}

// Standalone entrypoint: `bun run db:backup`
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  const db = drizzle({ client: neon(process.env.DATABASE_URL), schema })
  console.log('💾 Backing up scraped catalog → *_backup tables…')
  const counts = await backupScrapedCards(db as unknown as Db)
  for (const [t, n] of Object.entries(counts)) console.log(`  ✓ ${t}: ${n} rows`)
}

// Run only when invoked directly, not when imported by run.ts.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('backup.ts')) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
