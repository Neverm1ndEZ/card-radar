/**
 * One-off additive migration for the richer reward schema (2026-06-06).
 *
 * drizzle-kit push needs a TTY to disambiguate the new `card_accelerators` table from
 * a rename, which we can't provide in this non-interactive shell. These changes are
 * purely additive (new nullable columns + a new table), so we apply the DDL directly
 * and idempotently. Safe to re-run.
 */
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

async function main() {
  const stmts = [
    `ALTER TABLE card_category_rates ADD COLUMN IF NOT EXISTS rate_kind text`,
    `ALTER TABLE card_category_rates ADD COLUMN IF NOT EXISTS cap_group text`,
    `ALTER TABLE card_category_rates ADD COLUMN IF NOT EXISTS min_txn_monthly integer`,
    `ALTER TABLE card_category_rates ADD COLUMN IF NOT EXISTS conditions jsonb`,
    `ALTER TABLE card_category_rates ADD COLUMN IF NOT EXISTS source text`,
    `CREATE TABLE IF NOT EXISTS card_accelerators (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
       label text NOT NULL,
       channel text,
       applies_to text[],
       multiplier numeric(5,2),
       effective_rate_pct numeric(5,2),
       monthly_cap integer,
       condition_note text,
       is_active boolean DEFAULT true,
       source text
     )`,
    `CREATE INDEX IF NOT EXISTS card_accelerators_card_id_idx ON card_accelerators(card_id)`,
  ]
  for (const s of stmts) {
    await sql.query(s)
    console.log('OK:', s.split('\n')[0].trim().slice(0, 70))
  }
  console.log('\nMigration complete.')
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
