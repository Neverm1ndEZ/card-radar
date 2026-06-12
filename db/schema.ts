import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  date,
  numeric,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const cards = pgTable('cards', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
  issuer: text('issuer').notNull(),
  network: text('network').notNull(),
  card_type: text('card_type').notNull(),
  annual_fee: integer('annual_fee').notNull(),
  joining_fee: integer('joining_fee').notNull(),
  annual_fee_waiver_spend: integer('annual_fee_waiver_spend'),
  reward_currency: text('reward_currency').notNull(),
  base_earn_rate: numeric('base_earn_rate', { precision: 5, scale: 2 }).notNull(),
  forex_markup: numeric('forex_markup', { precision: 4, scale: 2 }),
  min_income_salary: integer('min_income_salary'),
  credit_score_required: integer('credit_score_required'),
  invite_only: boolean('invite_only').default(false),
  is_lifetime_free: boolean('is_lifetime_free').default(false),
  is_active: boolean('is_active').default(true),
  // Joining bonus: monetary INR value of welcome benefit (vouchers, miles, cashback)
  joining_bonus_value: integer('joining_bonus_value'),
  joining_bonus_description: text('joining_bonus_description'),
  // FD-backed secured cards
  fd_backed: boolean('fd_backed').default(false),
  min_fd_amount: integer('min_fd_amount'),
  no_cibil_required: boolean('no_cibil_required').default(false),
  // Segment for filtering/display
  card_segment: text('card_segment'),
  image_url: text('image_url'),
  apply_url: text('apply_url'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const cardCategoryRates = pgTable(
  'card_category_rates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    card_id: uuid('card_id')
      .references(() => cards.id, { onDelete: 'cascade' })
      .notNull(),
    category: text('category').notNull(),
    earn_rate: numeric('earn_rate', { precision: 5, scale: 2 }).notNull(),
    earn_cap_monthly: integer('earn_cap_monthly'),
    notes: text('notes'),
    // Disambiguates what `earn_rate` MEANS. The scraper historically stored mixed
    // semantics (sometimes a cashback %, sometimes points-per-₹100, sometimes a
    // stated value-back %), and the engine blindly multiplied by CPP — double-haircutting
    // value-back rates on points cards. Now explicit:
    //   'cashback_pct'    — % cash back (value is the % directly; CPP not applied)
    //   'value_back_pct'  — stated net value-back % for a points/portal offer (CPP not applied)
    //   'points_per_100'  — reward points earned per ₹100 (value = pts × CPP)
    // NULL = legacy/unknown → engine treats as points_per_100 for points currencies,
    // cashback_pct for cash-like currencies (preserves prior behaviour).
    rate_kind: text('rate_kind'),
    // Rows sharing a non-null cap_group share ONE monthly ₹ ceiling (e.g. HSBC Live+
    // dining+grocery share a single ₹1,000/mo cap). Engine pools reward across the group
    // and caps the total. NULL = the per-row earn_cap_monthly applies independently.
    cap_group: text('cap_group'),
    // Minimum number of transactions per statement cycle to unlock this rate, if any.
    min_txn_monthly: integer('min_txn_monthly'),
    // Other structured conditions (min ticket size, eligible-merchant list, etc.).
    conditions: jsonb('conditions').$type<Record<string, unknown>>(),
    // Provenance: 'scraped' (LLM catalog) vs 'curated' (hand-verified override layer).
    source: text('source'),
  },
  (t) => [unique().on(t.card_id, t.category)]
)

// Accelerated / portal rewards — the multiplier offers that don't fit the per-macro-
// category model: e.g. HDFC Infinia → SmartBuy 10X on flights/hotels → ~33% value-back,
// Axis Atlas → Travel EDGE bonus miles. These are surfaced on the per-card detail page
// (pillar 2) and can be folded into valuation when the user's spend matches a channel.
export const cardAccelerators = pgTable('card_accelerators', {
  id: uuid('id').defaultRandom().primaryKey(),
  card_id: uuid('card_id')
    .references(() => cards.id, { onDelete: 'cascade' })
    .notNull(),
  label: text('label').notNull(), // human label, e.g. "SmartBuy 10X (Flights & Hotels)"
  channel: text('channel'), // portal/program, e.g. "SmartBuy", "Gyftr", "Travel EDGE"
  // Spend categories or merchants this boost applies to (macro categories or platform keys).
  applies_to: text('applies_to').array(),
  multiplier: numeric('multiplier', { precision: 5, scale: 2 }), // e.g. 10 for "10X"
  // Effective net value-back % via this channel (the headline number we display/use).
  effective_rate_pct: numeric('effective_rate_pct', { precision: 5, scale: 2 }),
  monthly_cap: integer('monthly_cap'), // ₹ monthly reward cap via this channel, if any
  condition_note: text('condition_note'),
  is_active: boolean('is_active').default(true),
  source: text('source'),
})

export const cardBenefits = pgTable('card_benefits', {
  id: uuid('id').defaultRandom().primaryKey(),
  card_id: uuid('card_id')
    .references(() => cards.id, { onDelete: 'cascade' })
    .notNull(),
  benefit_type: text('benefit_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  quantity_per_year: integer('quantity_per_year'),
  quantity_per_quarter: integer('quantity_per_quarter'),
  spend_threshold: integer('spend_threshold'),
  monetary_value: integer('monetary_value'),
  is_hidden: boolean('is_hidden').default(false),
  is_active: boolean('is_active').default(true),
  activation_steps: jsonb('activation_steps').$type<string[]>(),
  partner_names: text('partner_names').array(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const benefitChangelog = pgTable('benefit_changelog', {
  id: uuid('id').defaultRandom().primaryKey(),
  card_id: uuid('card_id')
    .references(() => cards.id, { onDelete: 'cascade' })
    .notNull(),
  benefit_id: uuid('benefit_id').references(() => cardBenefits.id, {
    onDelete: 'set null',
  }),
  change_type: text('change_type').notNull(),
  field_changed: text('field_changed').notNull(),
  old_value: jsonb('old_value'),
  new_value: jsonb('new_value'),
  effective_date: date('effective_date'),
  source_url: text('source_url'),
  source_type: text('source_type'),
  confidence: numeric('confidence', { precision: 3, scale: 2 }),
  community_votes: integer('community_votes').default(0),
  summary: text('summary').notNull(),
  is_published: boolean('is_published').default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const transferPartners = pgTable('transfer_partners', {
  id: uuid('id').defaultRandom().primaryKey(),
  card_id: uuid('card_id')
    .references(() => cards.id, { onDelete: 'cascade' })
    .notNull(),
  program_name: text('program_name').notNull(),
  program_type: text('program_type').notNull(),
  transfer_ratio: numeric('transfer_ratio', { precision: 6, scale: 2 }).notNull(),
  min_transfer: integer('min_transfer'),
  transfer_increments: integer('transfer_increments'),
  is_active: boolean('is_active').default(true),
  notes: text('notes'),
})

export const programValuations = pgTable('program_valuations', {
  id: uuid('id').defaultRandom().primaryKey(),
  program_name: text('program_name').notNull(),
  cpp_inr: numeric('cpp_inr', { precision: 6, scale: 4 }).notNull(),
  valuation_method: text('valuation_method'),
  notes: text('notes'),
  effective_from: date('effective_from').notNull(),
  effective_to: date('effective_to'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// scraped_card_staging: cache/audit + idempotency layer for the catalog scraper.
// NOT a manual review queue — the orchestrator auto-promotes rows that clear the
// confidence gate into the canonical `cards` table. Rows below the gate stay here
// and are retried on the next run. `extracted` holds the full normalized payload;
// `raw_excerpt` is the page text the extraction was grounded against (audit trail).
export const scrapedCardStaging = pgTable('scraped_card_staging', {
  id: uuid('id').defaultRandom().primaryKey(),
  issuer: text('issuer').notNull(),
  card_name: text('card_name').notNull(),
  slug: text('slug').notNull(),
  source_url: text('source_url').unique().notNull(),
  network: text('network'),
  // sha256 of the cleaned page text — lets us skip re-extraction when unchanged
  content_hash: text('content_hash'),
  raw_excerpt: text('raw_excerpt'),
  extracted: jsonb('extracted').$type<Record<string, unknown>>(),
  extraction_model: text('extraction_model'),
  confidence: numeric('confidence', { precision: 3, scale: 2 }),
  field_confidence: jsonb('field_confidence').$type<Record<string, number>>(),
  // promotion bookkeeping
  promoted: boolean('promoted').default(false),
  promoted_card_id: uuid('promoted_card_id').references(() => cards.id, {
    onDelete: 'set null',
  }),
  promote_skipped_reason: text('promote_skipped_reason'),
  // lifecycle timestamps
  discovered_at: timestamp('discovered_at', { withTimezone: true }).defaultNow(),
  scraped_at: timestamp('scraped_at', { withTimezone: true }),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
})

export const cardRestrictions = pgTable('card_restrictions', {
  id: uuid('id').defaultRandom().primaryKey(),
  blocker_card_id: uuid('blocker_card_id')
    .references(() => cards.id, { onDelete: 'cascade' })
    .notNull(),
  blocked_card_id: uuid('blocked_card_id')
    .references(() => cards.id, { onDelete: 'cascade' })
    .notNull(),
  restriction_type: text('restriction_type').notNull(),
  condition_data: jsonb('condition_data').$type<Record<string, unknown>>(),
  source_url: text('source_url'),
  is_active: boolean('is_active').default(true),
  notes: text('notes'),
})

// Relations
export const cardsRelations = relations(cards, ({ many }) => ({
  categoryRates: many(cardCategoryRates),
  benefits: many(cardBenefits),
  changelog: many(benefitChangelog),
  transferPartners: many(transferPartners),
  accelerators: many(cardAccelerators),
  blockerRestrictions: many(cardRestrictions, { relationName: 'blocker' }),
  blockedRestrictions: many(cardRestrictions, { relationName: 'blocked' }),
}))

export const cardCategoryRatesRelations = relations(cardCategoryRates, ({ one }) => ({
  card: one(cards, { fields: [cardCategoryRates.card_id], references: [cards.id] }),
}))

export const cardAcceleratorsRelations = relations(cardAccelerators, ({ one }) => ({
  card: one(cards, { fields: [cardAccelerators.card_id], references: [cards.id] }),
}))

export const cardBenefitsRelations = relations(cardBenefits, ({ one }) => ({
  card: one(cards, { fields: [cardBenefits.card_id], references: [cards.id] }),
}))

export const benefitChangelogRelations = relations(benefitChangelog, ({ one }) => ({
  card: one(cards, { fields: [benefitChangelog.card_id], references: [cards.id] }),
}))

export const transferPartnersRelations = relations(transferPartners, ({ one }) => ({
  card: one(cards, { fields: [transferPartners.card_id], references: [cards.id] }),
}))

export const cardRestrictionsRelations = relations(cardRestrictions, ({ one }) => ({
  blockerCard: one(cards, {
    fields: [cardRestrictions.blocker_card_id],
    references: [cards.id],
    relationName: 'blocker',
  }),
  blockedCard: one(cards, {
    fields: [cardRestrictions.blocked_card_id],
    references: [cards.id],
    relationName: 'blocked',
  }),
}))

export type Card = typeof cards.$inferSelect
export type CardSegment = 'secured' | 'starter' | 'mid' | 'premium' | 'super_premium' | 'co_branded'
export type CardCategoryRate = typeof cardCategoryRates.$inferSelect
export type CardAccelerator = typeof cardAccelerators.$inferSelect
export type CardAcceleratorInsert = typeof cardAccelerators.$inferInsert
export type CardBenefit = typeof cardBenefits.$inferSelect
export type BenefitChangelog = typeof benefitChangelog.$inferSelect
export type TransferPartner = typeof transferPartners.$inferSelect
export type ProgramValuation = typeof programValuations.$inferSelect
export type CardRestriction = typeof cardRestrictions.$inferSelect
export type ScrapedCardStaging = typeof scrapedCardStaging.$inferSelect
export type ScrapedCardStagingInsert = typeof scrapedCardStaging.$inferInsert
