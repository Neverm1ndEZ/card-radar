/**
 * The extraction contract.
 *
 * `ScrapedCardSchema` is what the LLM must return for a single card page, and what
 * we Zod-validate before anything touches the DB. Everything is nullable: the model
 * is instructed to emit `null` for anything not literally on the page rather than
 * guess. `GEMINI_RESPONSE_SCHEMA` is the same shape expressed in Gemini's
 * responseSchema dialect (a subset of OpenAPI) so the model is constrained at
 * generation time — keep the two in sync.
 */

import { z } from 'zod'
import { SPEND_CATEGORIES } from '../../../lib/validators'

// Canonical enums mirrored from the `cards` table / product spec.
export const NETWORKS = ['Visa', 'Mastercard', 'Amex', 'Diners', 'RuPay'] as const
export const CARD_TYPES = ['cashback', 'travel', 'premium', 'lifestyle', 'fuel', 'co-branded'] as const
export const BENEFIT_TYPES = [
  'lounge', 'golf', 'dining', 'movie', 'insurance', 'concierge',
  'welcome_bonus', 'milestone', 'fuel_waiver', 'hotel', 'other',
] as const

// LLMs occasionally emit numbers as strings ("₹1,000", "1.5%", "12,500 + GST").
// Coerce anything numeric-ish to a number; null out non-numeric text. This keeps
// one stray format from failing the whole extraction.
const looseNum = z.preprocess((v) => {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.\-]/g, '')
    if (!/[0-9]/.test(cleaned)) return null
    const n = parseFloat(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}, z.number().nullable())

// Same defensiveness for strings: coerce scalars, send arrays/objects to null,
// collapse empties to null.
const looseStr = z.preprocess((v) => {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return null
}, z.string().nullable())

// Tolerant enum: map the value to the known set (case-insensitive) or null. Lite
// models don't always honor responseSchema enums, and one stray value (e.g. a
// network of "Visa Signature") shouldn't fail the whole card.
function looseEnum<T extends string>(allowed: readonly T[]) {
  const canon = new Map(allowed.map((a) => [a.toLowerCase(), a]))
  return z.preprocess((v) => {
    if (typeof v !== 'string') return null
    return canon.get(v.trim().toLowerCase()) ?? null
  }, z.string().nullable())
}

// Tolerant boolean: accept true/false, 1/0, yes/no, "true"/"false"; else null.
const looseBool = z.preprocess((v) => {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    if (['true', 'yes', '1', 'y'].includes(t)) return true
    if (['false', 'no', '0', 'n', ''].includes(t)) return false
  }
  return null
}, z.boolean().nullable())

// Coerce a non-array (null, object) to [] so a malformed list can't fail the card.
const looseArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(item))

const nullableNum = looseNum
const nullableStr = looseStr
const nullableBool = looseBool

export const CategoryRateSchema = z.object({
  category: looseEnum(SPEND_CATEGORIES), // null -> rate dropped during grounding
  // Reward earned per ₹100 of spend in this category. For points cards this is
  // points-per-₹100; for cashback cards it's the % cashback (numerically equal).
  earn_rate: looseNum,
  cap_monthly: nullableNum, // ₹ cap on monthly reward in this category, if any
  notes: nullableStr,
  // The literal sentence on the page this rate came from — used for grounding.
  source_quote: nullableStr,
})

export const BenefitSchema = z.object({
  type: looseEnum(BENEFIT_TYPES), // null -> 'other' when written
  // Tolerant: incomplete benefits (missing title/description) are filtered before
  // they reach the DB rather than failing the whole card's extraction.
  title: looseStr,
  description: looseStr,
  monetary_value: nullableNum, // INR value if stated/derivable from the page
  spend_threshold: nullableNum, // ₹ spend that unlocks the perk, if gated
  quantity_per_year: nullableNum,
})

export const ScrapedCardSchema = z.object({
  // Safety veto: the model sets this true if the page is NOT a credit-card detail
  // page (debit card, loan, landing/listing page, 404). Such rows are never promoted.
  not_a_credit_card: looseBool, // null/unparseable -> treated as a card downstream

  name: nullableStr,
  network: looseEnum(NETWORKS),
  card_type: looseEnum(CARD_TYPES),

  // Fees — literal ₹ amounts; must appear verbatim on the page (grounded).
  annual_fee: nullableNum,
  joining_fee: nullableNum,
  annual_fee_waiver_spend: nullableNum,
  is_lifetime_free: nullableBool,
  forex_markup: nullableNum,

  // Rewards.
  reward_currency: nullableStr,
  reward_rate_description: nullableStr, // literal e.g. "5 Reward Points per ₹150"
  base_earn_rate: nullableNum,          // normalized to per-₹100 (may be derived)
  category_rates: looseArray(CategoryRateSchema),

  // Eligibility — literal numbers; grounded.
  min_income_salary: nullableNum, // annual ₹
  credit_score_required: nullableNum,
  age_min: nullableNum,
  age_max: nullableNum,
  invite_only: nullableBool,

  // Benefits & welcome bonus.
  benefits: looseArray(BenefitSchema),
  welcome_bonus_value: nullableNum, // INR
  welcome_bonus_description: nullableStr,
})

export type ScrapedCard = z.infer<typeof ScrapedCardSchema>
export type CategoryRate = z.infer<typeof CategoryRateSchema>
export type Benefit = z.infer<typeof BenefitSchema>

// Top-level literal-money/eligibility fields whose value MUST appear verbatim in
// the page text. The grounding check nulls any that don't and docks confidence.
export const GROUNDED_NUMERIC_FIELDS = [
  'annual_fee',
  'joining_fee',
  'annual_fee_waiver_spend',
  'min_income_salary',
  'welcome_bonus_value',
  'credit_score_required',
] as const

// Fields required for a row to be eligible for auto-promotion into `cards`.
// `network` is deliberately NOT here: bank pages often omit the scheme in text and
// we refuse to guess it, so we let it default to 'Unknown' rather than withhold an
// otherwise-accurate card (network isn't used in NAV scoring).
export const REQUIRED_FOR_PROMOTION = [
  'name',
  'annual_fee',
  'joining_fee',
  'reward_currency',
  'base_earn_rate',
] as const

// ── Gemini responseSchema (OpenAPI subset). Keep in sync with ScrapedCardSchema. ──
// Gemini's STRING+enum, NUMBER, BOOLEAN, ARRAY, OBJECT with `nullable` and
// `required`. No additionalProperties / oneOf.
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    not_a_credit_card: { type: 'BOOLEAN' },
    name: { type: 'STRING', nullable: true },
    network: { type: 'STRING', enum: [...NETWORKS], nullable: true },
    card_type: { type: 'STRING', enum: [...CARD_TYPES], nullable: true },
    annual_fee: { type: 'NUMBER', nullable: true },
    joining_fee: { type: 'NUMBER', nullable: true },
    annual_fee_waiver_spend: { type: 'NUMBER', nullable: true },
    is_lifetime_free: { type: 'BOOLEAN', nullable: true },
    forex_markup: { type: 'NUMBER', nullable: true },
    reward_currency: { type: 'STRING', nullable: true },
    reward_rate_description: { type: 'STRING', nullable: true },
    base_earn_rate: { type: 'NUMBER', nullable: true },
    category_rates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING', enum: [...SPEND_CATEGORIES] },
          earn_rate: { type: 'NUMBER' },
          cap_monthly: { type: 'NUMBER', nullable: true },
          notes: { type: 'STRING', nullable: true },
          source_quote: { type: 'STRING', nullable: true },
        },
        required: ['category', 'earn_rate'],
      },
    },
    min_income_salary: { type: 'NUMBER', nullable: true },
    credit_score_required: { type: 'NUMBER', nullable: true },
    age_min: { type: 'NUMBER', nullable: true },
    age_max: { type: 'NUMBER', nullable: true },
    invite_only: { type: 'BOOLEAN', nullable: true },
    benefits: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: [...BENEFIT_TYPES] },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          monetary_value: { type: 'NUMBER', nullable: true },
          spend_threshold: { type: 'NUMBER', nullable: true },
          quantity_per_year: { type: 'NUMBER', nullable: true },
        },
        required: ['type', 'title', 'description'],
      },
    },
    welcome_bonus_value: { type: 'NUMBER', nullable: true },
    welcome_bonus_description: { type: 'STRING', nullable: true },
  },
  required: ['not_a_credit_card', 'name', 'category_rates', 'benefits'],
} as const
