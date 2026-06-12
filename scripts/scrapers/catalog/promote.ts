/**
 * Promotion — confidence-gated, automatic upsert of an extracted card into the
 * canonical `cards` / `card_category_rates` / `card_benefits` tables.
 *
 * Gate: not_a_credit_card === false, all REQUIRED_FOR_PROMOTION present, and
 * confidence >= MIN_CONFIDENCE. Rows that fail stay in staging (the caller records
 * the reason) and are retried next run — bad data never reaches the live set.
 *
 * Non-destructive: a NEW card gets its full rate/benefit set written; an EXISTING
 * card has its scalar fields updated (with every change logged to benefit_changelog)
 * and its rates/benefits replaced ONLY when this scrape actually produced some, so a
 * thin scrape can't wipe richer seeded data.
 */

import { eq } from 'drizzle-orm'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from '../../../db/schema'
import { cards, cardCategoryRates, cardBenefits, benefitChangelog } from '../../../db/schema'
import { REQUIRED_FOR_PROMOTION, type ScrapedCard } from './schema'
import type { ExtractionResult } from './types'
import { slugify, cardCoreName } from './util'

export type CatalogDb = NeonHttpDatabase<typeof schema>

export const MIN_CONFIDENCE = 0.75

export type PromoteResult =
  | { promoted: true; cardId: string; created: boolean; changes: number }
  | { promoted: false; reason: string }

// Infer the card scheme from its own name — this is reading the page, not guessing.
// Falls back to 'Unknown' (never fabricated). Amex issuer is always the Amex network.
function inferNetwork(card: ScrapedCard, issuer: string): string {
  if (card.network) return card.network
  const n = card.name?.toLowerCase() ?? ''
  if (/\brupay\b/.test(n)) return 'RuPay'
  if (/\bdiners\b/.test(n)) return 'Diners'
  if (/\bmaster\s?card\b/.test(n)) return 'Mastercard'
  if (/\bvisa\b/.test(n)) return 'Visa'
  if (/\bamex\b|american express/.test(n) || issuer === 'Amex') return 'Amex'
  return 'Unknown'
}

function deriveSegment(card: ScrapedCard): string {
  if (card.card_type === 'co-branded') return 'co_branded'
  const fee = Math.max(card.annual_fee ?? 0, card.joining_fee ?? 0)
  if (card.invite_only || fee >= 10000) return 'super_premium'
  if (fee >= 2500) return 'premium'
  if (fee >= 500) return 'mid'
  return 'starter'
}

function gateReason(ex: ExtractionResult): string | null {
  const { card, confidence } = ex
  if (card.not_a_credit_card) return 'not_a_credit_card'
  for (const f of REQUIRED_FOR_PROMOTION) {
    if (card[f as keyof ScrapedCard] == null) return `missing_required:${f}`
  }
  if (confidence < MIN_CONFIDENCE) return `low_confidence:${confidence}`
  return null
}

// Scalar fields we track for changelog diffs on existing cards.
const TRACKED: { key: keyof typeof cards.$inferSelect; changeType: string }[] = [
  { key: 'annual_fee', changeType: 'fee_change' },
  { key: 'joining_fee', changeType: 'fee_change' },
  { key: 'base_earn_rate', changeType: 'earn_rate_change' },
  { key: 'annual_fee_waiver_spend', changeType: 'fee_change' },
  { key: 'min_income_salary', changeType: 'eligibility_change' },
  { key: 'is_active', changeType: 'status_change' },
]

function toCardRow(card: ScrapedCard, slug: string, issuer: string, sourceUrl: string) {
  return {
    slug,
    name: card.name!, // gate guarantees present
    issuer,
    network: inferNetwork(card, issuer), // from name/issuer only; 'Unknown' otherwise
    card_type: card.card_type ?? 'lifestyle',
    annual_fee: Math.round(card.annual_fee!),
    joining_fee: Math.round(card.joining_fee!),
    annual_fee_waiver_spend:
      card.annual_fee_waiver_spend != null ? Math.round(card.annual_fee_waiver_spend) : null,
    reward_currency: card.reward_currency!,
    base_earn_rate: String(card.base_earn_rate!),
    forex_markup: card.forex_markup != null ? String(card.forex_markup) : null,
    min_income_salary: card.min_income_salary != null ? Math.round(card.min_income_salary) : null,
    credit_score_required:
      card.credit_score_required != null ? Math.round(card.credit_score_required) : null,
    invite_only: card.invite_only ?? false,
    is_lifetime_free: card.is_lifetime_free ?? false,
    is_active: true,
    joining_bonus_value:
      card.welcome_bonus_value != null ? Math.round(card.welcome_bonus_value) : null,
    joining_bonus_description: card.welcome_bonus_description ?? null,
    card_segment: deriveSegment(card),
    apply_url: sourceUrl,
    updated_at: new Date(),
  }
}

async function writeRates(db: CatalogDb, cardId: string, card: ScrapedCard) {
  const rates = card.category_rates.filter(
    (r): r is typeof r & { category: string; earn_rate: number } =>
      r.category != null && r.earn_rate != null
  )
  if (rates.length === 0) return
  await db.delete(cardCategoryRates).where(eq(cardCategoryRates.card_id, cardId))
  // Dedupe by category (last wins) to satisfy the unique(card_id, category) constraint.
  const byCat = new Map(rates.map((r) => [r.category, r]))
  await db.insert(cardCategoryRates).values(
    [...byCat.values()].map((r) => ({
      card_id: cardId,
      category: r.category,
      earn_rate: String(r.earn_rate),
      earn_cap_monthly: r.cap_monthly != null ? Math.round(r.cap_monthly) : null,
      notes: r.notes ?? null,
    }))
  )
}

async function writeBenefits(db: CatalogDb, cardId: string, card: ScrapedCard) {
  const benefits = card.benefits.filter(
    (b): b is typeof b & { title: string; description: string } =>
      !!b.title && !!b.description
  )
  if (benefits.length === 0) return
  await db.delete(cardBenefits).where(eq(cardBenefits.card_id, cardId))
  await db.insert(cardBenefits).values(
    benefits.map((b) => ({
      card_id: cardId,
      benefit_type: b.type ?? 'other',
      title: b.title,
      description: b.description,
      quantity_per_year: b.quantity_per_year != null ? Math.round(b.quantity_per_year) : null,
      spend_threshold: b.spend_threshold != null ? Math.round(b.spend_threshold) : null,
      monetary_value: b.monetary_value != null ? Math.round(b.monetary_value) : null,
    }))
  )
}

export async function promoteToDb(
  ex: ExtractionResult,
  meta: { issuer: string; sourceUrl: string },
  db: CatalogDb
): Promise<PromoteResult> {
  const reason = gateReason(ex)
  if (reason) return { promoted: false, reason }

  const card = ex.card
  const core = cardCoreName(card.name!)
  // Match an existing card (incl. hand-seeded ones) by its distinguishing core name
  // so we UPDATE rather than create a near-duplicate. New cards get a clean slug
  // derived from the core (no redundant "credit-card" suffix).
  const issuerCards = await db.query.cards.findMany({ where: eq(cards.issuer, meta.issuer) })
  const existing = issuerCards.find((c) => cardCoreName(c.name) === core)
  const slug = existing?.slug ?? slugify(meta.issuer, core)
  const row = toCardRow(card, slug, meta.issuer, meta.sourceUrl)

  if (!existing) {
    const [inserted] = await db.insert(cards).values(row).returning({ id: cards.id })
    await writeRates(db, inserted.id, card)
    await writeBenefits(db, inserted.id, card)
    return { promoted: true, cardId: inserted.id, created: true, changes: 0 }
  }

  // Existing card: diff scalars, log changes, update, then replace rates/benefits
  // only if the scrape produced them.
  let changes = 0
  const logs: (typeof benefitChangelog.$inferInsert)[] = []
  for (const { key, changeType } of TRACKED) {
    const oldVal = (existing as Record<string, unknown>)[key]
    const newVal = (row as Record<string, unknown>)[key]
    if (newVal === undefined) continue
    if (String(oldVal) !== String(newVal)) {
      changes++
      logs.push({
        card_id: existing.id,
        change_type: changeType,
        field_changed: key,
        old_value: oldVal as never,
        new_value: newVal as never,
        effective_date: new Date().toISOString().slice(0, 10),
        source_url: meta.sourceUrl,
        source_type: 'scraped',
        confidence: String(ex.confidence),
        summary: `${card.name}: ${key} changed from ${String(oldVal)} to ${String(newVal)} (auto-scraped, pending review).`,
        is_published: false,
      })
    }
  }

  await db.update(cards).set(row).where(eq(cards.id, existing.id))
  if (logs.length > 0) await db.insert(benefitChangelog).values(logs)
  await writeRates(db, existing.id, card)
  await writeBenefits(db, existing.id, card)

  return { promoted: true, cardId: existing.id, created: false, changes }
}
