/**
 * Apply the curated reward override layer + reference data on top of the scraped catalog.
 *
 * Runs AFTER the scraper promotes (the orchestrator calls applyCuratedLayer at the end
 * of every live run) or standalone via `bun run db:curate`. This is REQUIRED post-scrape:
 * promote.ts replaces a card's category rates from the (unreliable) scrape, so without
 * re-applying, a re-scraped flagship would lose its hand-verified rates/caps.
 *
 * Non-destructive to the long tail: only touches the reward fields of the ~30 curated
 * flagship cards, and (re)seeds the reference tables the scraper never populates
 * (program_valuations / transfer_partners).
 *
 * Idempotent. Reports any curated/seed slug that no longer matches a live card.
 */
import { eq } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from '../../db/schema'
import {
  cards,
  cardCategoryRates,
  cardAccelerators,
  programValuations,
  transferPartners,
} from '../../db/schema'
import { PROGRAM_CPP, TRANSFER_PARTNER_SEEDS } from '../../db/reference-data'
import { CURATED_CARDS, SEED_SLUG_REMAP } from '../../db/curated-rewards'

type CurateDb = NeonHttpDatabase<typeof schema>

export type CurateCounts = { programValuations: number; transferPartners: number; curatedCards: number }

export async function applyCuratedLayer(
  db: CurateDb,
  log: (msg: string) => void = () => {}
): Promise<CurateCounts> {
  const today = new Date().toISOString().slice(0, 10)
  const all = await db.select({ id: cards.id, slug: cards.slug }).from(cards)
  const slugToId = new Map(all.map((c) => [c.slug, c.id]))

  // ── program_valuations (CPP) ──
  await db.delete(programValuations)
  const cppRows = Object.entries(PROGRAM_CPP).map(([program_name, cpp]) => ({
    program_name,
    cpp_inr: String(cpp),
    valuation_method: 'curated',
    notes: 'Curated blended CPP (db/reference-data.ts).',
    effective_from: today,
  }))
  await db.insert(programValuations).values(cppRows)

  // ── transfer_partners ──
  await db.delete(transferPartners)
  const tpRows: (typeof transferPartners.$inferInsert)[] = []
  const tpMissing = new Set<string>()
  for (const s of TRANSFER_PARTNER_SEEDS) {
    const cardId = slugToId.get(SEED_SLUG_REMAP[s.card_slug] ?? s.card_slug)
    if (!cardId) { tpMissing.add(s.card_slug); continue }
    tpRows.push({
      card_id: cardId,
      program_name: s.program_name,
      program_type: s.program_type,
      transfer_ratio: String(s.transfer_ratio),
      min_transfer: s.min_transfer ?? null,
      transfer_increments: s.transfer_increments ?? null,
      is_active: s.is_active,
      notes: s.notes ?? null,
    })
  }
  if (tpRows.length) await db.insert(transferPartners).values(tpRows)
  if (tpMissing.size) log(`  ⚠ transfer-partner slugs not found: ${[...tpMissing].join(', ')}`)

  // ── curated cards (base rate, category rates, accelerators) ──
  let applied = 0
  const ccMissing: string[] = []
  for (const c of CURATED_CARDS) {
    const cardId = slugToId.get(c.slug)
    if (!cardId) { ccMissing.push(c.slug); continue }

    if (c.base != null) {
      await db.update(cards).set({ base_earn_rate: String(c.base), updated_at: new Date() }).where(eq(cards.id, cardId))
    }

    if (c.rates && c.rates.length) {
      await db.delete(cardCategoryRates).where(eq(cardCategoryRates.card_id, cardId))
      const byCat = new Map(c.rates.map((r) => [r.category, r])) // dedupe (unique card_id+category)
      await db.insert(cardCategoryRates).values(
        [...byCat.values()].map((r) => ({
          card_id: cardId,
          category: r.category,
          earn_rate: String(r.rate),
          earn_cap_monthly: r.cap ?? null,
          rate_kind: r.kind,
          cap_group: r.cap_group ?? null,
          min_txn_monthly: r.min_txn ?? null,
          notes: r.note ?? null,
          source: 'curated',
        }))
      )
    }

    await db.delete(cardAccelerators).where(eq(cardAccelerators.card_id, cardId))
    if (c.accelerators && c.accelerators.length) {
      await db.insert(cardAccelerators).values(
        c.accelerators.map((a) => ({
          card_id: cardId,
          label: a.label,
          channel: a.channel ?? null,
          applies_to: a.applies_to,
          multiplier: a.multiplier != null ? String(a.multiplier) : null,
          effective_rate_pct: a.effective_rate_pct != null ? String(a.effective_rate_pct) : null,
          monthly_cap: a.monthly_cap ?? null,
          condition_note: a.condition_note ?? null,
          is_active: true,
          source: 'curated',
        }))
      )
    }
    applied++
  }
  if (ccMissing.length) log(`  ⚠ curated slugs not found: ${ccMissing.join(', ')}`)

  return { programValuations: cppRows.length, transferPartners: tpRows.length, curatedCards: applied }
}

// ── Standalone CLI entry (bun run db:curate) ──────────────────────────────────
async function cli() {
  const { db } = await import('../../db')
  const counts = await applyCuratedLayer(db as unknown as CurateDb, (m) => console.warn(m))
  console.log(
    `Curated layer applied: program_valuations=${counts.programValuations}, ` +
    `transfer_partners=${counts.transferPartners}, curated_cards=${counts.curatedCards}/${CURATED_CARDS.length}`
  )
  process.exit(0)
}

// Only run the CLI when invoked directly, not when imported by the scraper.
const invokedDirectly = process.argv[1]?.includes('apply-curated')
if (invokedDirectly) {
  cli().catch((e) => { console.error(e); process.exit(1) })
}
