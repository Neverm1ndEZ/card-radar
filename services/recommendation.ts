import { db } from '@/db'
import { cardRestrictions, benefitChangelog } from '@/db/schema'
import { eq, gte, and } from 'drizzle-orm'
import type {
  RecommendRequest,
  RecommendResponse,
  RecommendationResult,
  RecommendSection,
  CardPreference,
  SpendCategory,
} from '@/lib/validators'
import { CATEGORY_FALLBACK_CHAIN, CIBIL_BAND_META, CARD_PREFERENCE_META } from '@/lib/validators'
import { classifyCard, rewardClass, type CardCategory } from '@/services/cardCategory'
import { ISSUER_CPP, CLASS_CPP_FALLBACK, CURATED_CPP_BY_SLUG } from '@/db/curated-rewards'

// ─────────────────────────────────────────────────────────────────────────────
// VALUATION MODEL — value is computed from the USER'S point of view, not a single
// global "rating". The same card is worth different amounts to different people.
//
// Lever 1 — Realization multiplier: a point's DB CPP is its *blended/realistic*
//   value. A travel optimizer extracts MORE from transferable points; a cashback
//   user redeems them sub-optimally; cash-like rewards never change.
// Lever 2 — Perk weighting: lounges/golf/concierge are worth a lot to a premium
//   or travel user, near-zero to someone who just wants money back.
//
// All constants below are deliberately explicit and tunable.
// ─────────────────────────────────────────────────────────────────────────────

// Internal valuation lens (how the user realizes value). The user picks a CARD TYPE
// (CardPreference); we map it to the lens that best models that buyer's behavior.
type Pref = 'cashback' | 'travel_miles' | 'points_flexibility' | 'premium_perks' | 'none'

const PREF_LENS: Record<CardPreference, Pref> = {
  cashback: 'cashback',
  travel: 'travel_miles',
  points: 'points_flexibility',
  fuel: 'cashback', // fuel savings are cash-like
  premium: 'premium_perks',
  super_premium: 'premium_perks',
  charge_card: 'premium_perks',
  all_rounder: 'none',
}
const lensFor = (pref: CardPreference | undefined): Pref => (pref ? PREF_LENS[pref] : 'none')

// Co-branded airline/hotel currencies that ARE travel value without needing a transfer step.
const TRAVEL_CURRENCY = new Set(['Air India Miles', 'Club Vistara Points'])

// ₹-per-reward-unit (CPP). Currency strings alone are ambiguous ("Reward Points" =
// HDFC 0.30 / ICICI 0.25 / SBI 0.25), so we resolve by (issuer, reward-class) with an
// optional hand-verified per-card override. Cashback is always ₹1.
function resolveAnchorCpp(card: CardRow): number {
  const override = CURATED_CPP_BY_SLUG[card.slug]
  if (override != null) return override
  const cls = rewardClass(card.reward_currency) ?? 'points'
  if (cls === 'cashback') return 1.0
  return ISSUER_CPP[card.issuer]?.[cls] ?? CLASS_CPP_FALLBACK[cls]
}

// Multiplier applied to the anchor CPP for POINTS currencies, by preference.
// `canTransfer` = card has live transfer partners (or is itself a travel currency),
// i.e. the user can actually reach the high-value redemptions.
function realizationMult(currency: string, pref: Pref, canTransfer: boolean): number {
  if (rewardClass(currency) === 'cashback') return 1.0 // ₹1 is ₹1 to everyone
  switch (pref) {
    case 'cashback':           return 0.75 // redeems as statement credit / vouchers
    case 'travel_miles':       return canTransfer ? 1.4 : 0.8
    case 'points_flexibility': return canTransfer ? 1.3 : 0.85
    case 'premium_perks':      return canTransfer ? 1.1 : 0.95
    default:                   return canTransfer ? 1.0 : 0.85 // 'none' = blended realistic
  }
}

// How much a perk of a given type is worth to a user with this preference (0–1).
const BENEFIT_WEIGHTS: Record<Pref, Record<string, number>> = {
  cashback:           { lounge: 0.25, golf: 0.1, dining: 0.4, movie: 0.4, insurance: 0.3, concierge: 0.1, milestone: 0.5, fuel_waiver: 0.5, hotel: 0.2 },
  travel_miles:       { lounge: 1.0,  golf: 0.4, dining: 0.4, movie: 0.3, insurance: 0.5, concierge: 0.5, milestone: 0.8, fuel_waiver: 0.2, hotel: 1.0 },
  points_flexibility: { lounge: 0.9,  golf: 0.4, dining: 0.4, movie: 0.3, insurance: 0.5, concierge: 0.5, milestone: 0.7, fuel_waiver: 0.2, hotel: 0.9 },
  premium_perks:      { lounge: 1.0,  golf: 1.0, dining: 0.9, movie: 0.7, insurance: 0.7, concierge: 1.0, milestone: 0.8, fuel_waiver: 0.3, hotel: 1.0 },
  none:               { lounge: 0.6,  golf: 0.6, dining: 0.6, movie: 0.6, insurance: 0.6, concierge: 0.6, milestone: 0.6, fuel_waiver: 0.6, hotel: 0.6 },
}

function benefitWeight(pref: Pref, benefitType: string): number {
  if (benefitType === 'welcome_bonus') return 0 // counted via first-year joining bonus instead
  return BENEFIT_WEIGHTS[pref][benefitType] ?? 0.4
}

const VALUE_BASIS: Record<Pref, string> = {
  cashback: 'net cashback value',
  travel_miles: 'value as transferable miles',
  points_flexibility: 'value as flexible points',
  premium_perks: 'net value incl. perks',
  none: 'net annual value',
}

type BenefitRow = {
  benefit_type: string
  title: string
  monetary_value: number | null
  spend_threshold: number | null
  is_active: boolean | null
}

type CardRow = {
  id: string
  slug: string
  name: string
  issuer: string
  network: string
  card_type: string
  card_segment: string | null
  annual_fee: number
  joining_fee: number
  annual_fee_waiver_spend: number | null
  reward_currency: string
  base_earn_rate: string
  forex_markup: string | null
  min_income_salary: number | null
  credit_score_required: number | null
  invite_only: boolean | null
  is_lifetime_free: boolean | null
  is_active: boolean | null
  fd_backed: boolean | null
  no_cibil_required: boolean | null
  joining_bonus_value: number | null
  joining_bonus_description: string | null
  image_url: string | null
  apply_url: string | null
  categoryRates: {
    category: string
    earn_rate: string
    earn_cap_monthly: number | null
    rate_kind: string | null
    cap_group: string | null
  }[]
  benefits: BenefitRow[]
  transferPartners: { is_active: boolean | null }[]
}

// Categories most cards do NOT reward (or actively exclude). For these we do not fall
// back to the base rate — a card earns on them only if it has an explicit rate.
const NO_BASE_FALLBACK = new Set<SpendCategory>(['rent', 'upi'])

// `kind` disambiguates what `rate` means (see schema card_category_rates.rate_kind).
// null = legacy: treat as cashback_pct for cash-like currencies, else points_per_100.
type RateKind = 'cashback_pct' | 'value_back_pct' | 'points_per_100' | null
type RateRow = { rate: number; cap: number | null; kind: RateKind; capGroup: string | null }

function rateMapOf(card: CardRow): Record<string, RateRow> {
  const m: Record<string, RateRow> = {}
  for (const r of card.categoryRates) {
    m[r.category] = {
      rate: parseFloat(r.earn_rate),
      cap: r.earn_cap_monthly ?? null,
      kind: (r.rate_kind as RateKind) ?? null,
      capGroup: r.cap_group ?? null,
    }
  }
  return m
}

// Resolve the earn rate (+ cap/kind/group) for a spend category via the fallback chain.
function resolveRate(rateMap: Record<string, RateRow>, base: number, category: SpendCategory): RateRow {
  const chain = CATEGORY_FALLBACK_CHAIN[category] ?? [category]
  for (const c of chain) {
    if (rateMap[c]) return rateMap[c]
  }
  if (NO_BASE_FALLBACK.has(category)) return { rate: 0, cap: null, kind: null, capGroup: null }
  return { rate: base, cap: null, kind: null, capGroup: null }
}

function annualTotal(monthlySpends: Record<string, number>): number {
  return Object.values(monthlySpends).reduce((s, v) => s + v, 0) * 12
}

function willWaive(card: CardRow, monthlySpends: Record<string, number>): boolean {
  if (!card.annual_fee_waiver_spend) return false
  return annualTotal(monthlySpends) >= card.annual_fee_waiver_spend
}

function netFee(card: CardRow, monthlySpends: Record<string, number>): number {
  return card.is_lifetime_free || willWaive(card, monthlySpends) ? 0 : card.annual_fee
}

function canTransfer(card: CardRow): boolean {
  if (TRAVEL_CURRENCY.has(card.reward_currency)) return true
  return card.transferPartners.some((t) => t.is_active !== false)
}

// ── The valuation, computed under a given preference lens ────────────────────
type LensValue = {
  annual_value: number
  first_year_value: number
  rewards_earned: number
  benefit_value: number
  net_fee: number
  by_category: Record<string, number>
}

// Sanity bounds — scraped data has outliers (a welcome bonus "20,000 pts" parsed as
// a per-₹100 rate; insurance "coverage" amounts of ₹crores stored as monetary_value).
// These clamp such garbage so it can't dominate the ranking.
const MAX_REWARD_RATE = 40 // value-back per ₹100; real accelerated rates top out ~33% (Infinia SmartBuy)

function safeRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) return 0
  return Math.min(rate, MAX_REWARD_RATE)
}

// Realistic ANNUAL ₹ value of a perk, by type. We deliberately IGNORE the scraped
// benefit.monetary_value — it's unreliable (often an insurance COVERAGE amount of
// ₹lakhs/crores, or a per-visit figure, or null). A curated per-type value keeps
// perk value bounded and sane. insurance = 0 (coverage isn't cash you pocket).
const PERK_VALUE: Record<string, number> = {
  lounge: 3000, golf: 2000, dining: 1000, movie: 800, concierge: 500,
  hotel: 2500, milestone: 1500, fuel_waiver: 600, insurance: 0, welcome_bonus: 0, other: 0,
}

function valueUnderLens(card: CardRow, request: RecommendRequest, anchorCpp: number, pref: Pref): LensValue {
  const rateMap = rateMapOf(card)
  const base = safeRate(parseFloat(card.base_earn_rate))
  const mult = realizationMult(card.reward_currency, pref, canTransfer(card))
  const isCash = rewardClass(card.reward_currency) === 'cashback'

  // ₹ value earned per ₹100 of spend, given the rate and its kind. Cashback/value-back
  // rates are already net ₹ (no CPP, no realization haircut); raw point rates get both.
  const valuePer100 = (rate: number, kind: RateKind): number => {
    const r = safeRate(rate)
    if (kind === 'cashback_pct' || kind === 'value_back_pct') return r
    if (kind === 'points_per_100') return r * anchorCpp * mult
    return isCash ? r : r * anchorCpp * mult // legacy/base fallback
  }

  // 1) Raw monthly reward (₹) per spend category, tagged with any cap / cap_group.
  type Acc = { category: string; monthly: number; cap: number | null; group: string | null }
  const accs: Acc[] = []
  for (const [category, monthly] of Object.entries(request.monthly_spends)) {
    if (monthly <= 0) continue
    const rr = resolveRate(rateMap, base, category as SpendCategory)
    const m = (monthly / 100) * valuePer100(rr.rate, rr.kind)
    if (m > 0) accs.push({ category, monthly: m, cap: rr.cap, group: rr.capGroup })
  }

  // 2) Apply caps (₹/month ceilings) then annualise. Rows sharing a cap_group draw from
  //    ONE pool; ungrouped rows cap individually. Capped pools are distributed back to
  //    categories proportionally so the by_category breakdown stays faithful.
  const by_category: Record<string, number> = {}
  let rewards = 0
  const groups = new Map<string, { sum: number; cap: number; rows: Acc[] }>()
  for (const a of accs) {
    if (a.group) {
      const g = groups.get(a.group) ?? { sum: 0, cap: a.cap ?? Infinity, rows: [] }
      g.sum += a.monthly
      g.cap = Math.min(g.cap, a.cap ?? Infinity)
      g.rows.push(a)
      groups.set(a.group, g)
    } else {
      const annual = (a.cap != null ? Math.min(a.monthly, a.cap) : a.monthly) * 12
      by_category[a.category] = Math.round(annual)
      rewards += annual
    }
  }
  for (const g of groups.values()) {
    const scale = g.sum > 0 ? Math.min(g.sum, g.cap) / g.sum : 0
    for (const a of g.rows) {
      const annual = a.monthly * scale * 12
      by_category[a.category] = Math.round(annual)
      rewards += annual
    }
  }
  rewards = Math.round(rewards)

  // Perk value: each perk TYPE counted once (cards often list several of a kind),
  // valued by the curated per-type table × preference weight, gated by spend thresholds.
  const total = annualTotal(request.monthly_spends)
  let benefit_value = 0
  const countedTypes = new Set<string>()
  for (const b of card.benefits) {
    if (b.is_active === false) continue
    if (b.spend_threshold && total < b.spend_threshold) continue // perk locked behind spend
    if (countedTypes.has(b.benefit_type)) continue
    countedTypes.add(b.benefit_type)
    benefit_value += (PERK_VALUE[b.benefit_type] ?? 500) * benefitWeight(pref, b.benefit_type)
  }
  benefit_value = Math.round(benefit_value)

  const net_fee = netFee(card, request.monthly_spends)
  const annual_value = rewards + benefit_value - net_fee
  const joiningBonusNet = (card.joining_bonus_value ?? 0) - (net_fee === 0 ? 0 : card.joining_fee)
  const first_year_value = annual_value + Math.max(0, joiningBonusNet)

  return { annual_value, first_year_value, rewards_earned: rewards, benefit_value, net_fee, by_category }
}

// ── Card health from published changelog ─────────────────────────────────────
const HEALTH_DELTA: Record<string, number> = {
  earning_rate_cut: -20, partner_removed: -15, milestone_removed: -12,
  fee_increase: -10, lounge_cutback: -10, benefit_removed: -8,
  earning_rate_increase: 10, partner_added: 10, fee_reduction: 10, milestone_added: 8,
}

function healthScore(changes: { change_type: string; summary: string }[]): { score: number; recent: string[] } {
  if (changes.length === 0) return { score: 100, recent: [] }
  let score = 100
  const recent: string[] = []
  for (const c of changes.slice(0, 10)) {
    score += HEALTH_DELTA[c.change_type] ?? -5
    recent.push(c.summary)
  }
  return { score: Math.max(0, Math.min(100, score)), recent }
}

function perkHighlights(card: CardRow): string[] {
  const PRIORITY = ['lounge', 'golf', 'hotel', 'concierge', 'insurance', 'milestone', 'dining']
  return card.benefits
    .filter((b) => b.is_active !== false && PRIORITY.includes(b.benefit_type))
    .sort((a, b) => PRIORITY.indexOf(a.benefit_type) - PRIORITY.indexOf(b.benefit_type))
    .slice(0, 3)
    .map((b) => b.title)
}

// Eligibility floor by card segment. Per-card min_income_salary / credit_score_required
// columns are sparse in the data, so we anchor on segment (always populated) and RAISE
// the bar with any explicit per-card requirement. This is what stops a super-premium /
// invite-only card from being recommended to a low-income or poor-credit user.
const SEGMENT_FLOOR: Record<string, { income: number; credit: number }> = {
  secured:       { income: 0,        credit: 0 },
  starter:       { income: 0,        credit: 0 },
  co_branded:    { income: 300_000,  credit: 650 },
  mid:           { income: 300_000,  credit: 650 },
  premium:       { income: 600_000,  credit: 720 },
  super_premium: { income: 1_500_000, credit: 760 },
}

// Conservative CIBIL score for eligibility = the band's lower bound, so a card whose
// floor sits inside the user's band is hidden (errs toward "won't qualify").
function userCibilScore(request: RecommendRequest): number {
  return CIBIL_BAND_META[request.credit_score_band ?? '730_769']?.floor ?? 730
}

function eligible(card: CardRow, request: RecommendRequest): boolean {
  // Never recommend a discontinued / closed-to-new-applications card.
  if (card.is_active === false) return false
  if (request.exclude_invite_only && card.invite_only) return false

  // No-CIBIL users: only cards that can actually be issued without a credit history.
  if (request.credit_score_band === 'no_cibil') {
    return !!(card.fd_backed || card.no_cibil_required)
  }

  const userScore = userCibilScore(request)
  const userIncome = request.annual_income ?? 0 // exact ₹/yr (UI sends monthly ×12)

  const floor = SEGMENT_FLOOR[card.card_segment ?? 'mid'] ?? SEGMENT_FLOOR.mid
  // Lifetime-free cards have little/no income bar in practice — don't gate them on the
  // segment income floor (still respect any explicit per-card minimum and the credit bar).
  const reqIncome = card.is_lifetime_free
    ? (card.min_income_salary ?? 0)
    : Math.max(floor.income, card.min_income_salary ?? 0)
  const reqCredit = Math.max(floor.credit, card.credit_score_required ?? 0)

  // Hard exclude: exact salary / CIBIL below the card's requirement.
  if (userIncome < reqIncome) return false
  if (userScore < reqCredit) return false

  // Invite-only cards realistically require a top-tier (800+) profile.
  if (card.invite_only && userScore < CIBIL_BAND_META['800_plus'].floor) return false

  return true
}

function buildWarnings(card: CardRow, request: RecommendRequest, blocked: boolean, health: number | null): string[] {
  const w: string[] = []
  if (card.invite_only) w.push(`Invite-only — usually needs an existing relationship with ${card.issuer}.`)
  if (card.network === 'Diners') w.push('Diners Club has limited acceptance at smaller merchants.')
  if (blocked) w.push('May not be eligible — check issuer restrictions against your existing cards.')
  if (card.is_active === false) w.push('Not currently open for new applications.')
  if (card.annual_fee_waiver_spend && !willWaive(card, request.monthly_spends)) {
    const gap = Math.round((card.annual_fee_waiver_spend - annualTotal(request.monthly_spends)) / 1000)
    if (gap > 0) w.push(`₹${gap}k more annual spend needed to waive the ₹${card.annual_fee.toLocaleString('en-IN')} fee.`)
  }
  if (health !== null && health < 60) w.push('Hit by significant devaluations recently — check the changelog.')
  return w
}

function topCategory(byCategory: Record<string, number>): string | null {
  const entry = Object.entries(byCategory).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a)[0]
  return entry ? entry[0] : null
}

function whyCard(card: CardRow, v: LensValue): string {
  const top = topCategory(v.by_category)
  if (v.annual_value <= 0) {
    if (card.fd_backed) return 'Builds your CIBIL at near-zero cost — apply against an FD to get started.'
    return `Fee (₹${card.annual_fee.toLocaleString('en-IN')}) likely outweighs rewards at your current spend.`
  }
  const val = `₹${Math.round(v.annual_value).toLocaleString('en-IN')}/yr`
  const fy = v.first_year_value > v.annual_value
    ? ` (₹${Math.round(v.first_year_value).toLocaleString('en-IN')} in year 1 with welcome bonus)`
    : ''
  if (card.is_lifetime_free) return `${val}${fy} — zero annual fee${top ? `, strongest on ${top}` : ''}.`
  if (card.card_type === 'cashback') return `${val}${fy}${top ? ` — earns best on ${top}` : ' — flat cashback'}.`
  if (card.card_type === 'travel' || card.card_type === 'co-branded') return `${val}${fy} — strong on ${top ?? 'travel'} with transferable value.`
  if (v.benefit_value > 0) return `${val}${fy} — rewards plus lounge/perk value.`
  return `${val}${fy} on ${card.reward_currency}.`
}

function matchReason(card: CardRow, lens: Pref, v: LensValue): string {
  const top = topCategory(v.by_category)
  switch (lens) {
    case 'cashback':
      return top ? `Best cashback on ${top}` : 'Flat, no-fuss cashback'
    case 'travel_miles':
      return canTransfer(card) ? `Miles transfer to airline & hotel partners` : `Airline miles on ${top ?? 'travel'}`
    case 'points_flexibility':
      return 'Flexible points, multiple redemption paths'
    case 'premium_perks': {
      const perks = perkHighlights(card)
      return perks.length ? perks.slice(0, 2).join(' · ') : 'Premium lifestyle perks'
    }
    default: {
      const bits: string[] = []
      if (top) bits.push(`great on ${top}`)
      if (v.benefit_value > 0) bits.push('lounge/perks')
      if (canTransfer(card)) bits.push('transferable points')
      return bits.length ? `Best match: ${bits.slice(0, 2).join(' + ')}` : 'Strong all-rounder'
    }
  }
}

// ── Assemble a result for a card under a specific lens ───────────────────────
function buildResult(
  card: CardRow,
  request: RecommendRequest,
  anchorCpp: number,
  lens: Pref,
  blocked: boolean,
  changes: { change_type: string; summary: string }[]
): RecommendationResult & { _value: number } {
  const v = valueUnderLens(card, request, anchorCpp, lens)
  const { score, recent } = healthScore(changes)
  const health = changes.length > 0 ? score : null

  return {
    _value: v.annual_value,
    card: {
      id: card.id, slug: card.slug, name: card.name, issuer: card.issuer, network: card.network,
      card_type: card.card_type, card_segment: card.card_segment, annual_fee: card.annual_fee,
      joining_fee: card.joining_fee, annual_fee_waiver_spend: card.annual_fee_waiver_spend,
      reward_currency: card.reward_currency, base_earn_rate: card.base_earn_rate,
      forex_markup: card.forex_markup, invite_only: card.invite_only,
      is_lifetime_free: card.is_lifetime_free, is_active: card.is_active,
      fd_backed: card.fd_backed, no_cibil_required: card.no_cibil_required,
      joining_bonus_value: card.joining_bonus_value, joining_bonus_description: card.joining_bonus_description,
      image_url: card.image_url, apply_url: card.apply_url,
    },
    annual_value: v.annual_value,
    first_year_value: v.first_year_value,
    value_basis: VALUE_BASIS[lens],
    match_reason: matchReason(card, lens, v),
    breakdown: {
      rewards_earned: v.rewards_earned,
      benefit_value: v.benefit_value,
      net_fee: v.net_fee,
      by_category: v.by_category,
    },
    rank: 0,
    warnings: buildWarnings(card, request, blocked, health),
    why_this_card: whyCard(card, v),
    card_health_score: health,
    recent_changes: recent,
    perk_highlights: perkHighlights(card),
  }
}

export function hashRequest(request: RecommendRequest): string {
  const str = JSON.stringify(request)
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

// Category membership via the shared classifier (services/cardCategory).
function cardCategories(card: CardRow): CardCategory[] {
  return classifyCard({
    name: card.name, issuer: card.issuer, reward_currency: card.reward_currency,
    card_segment: card.card_segment, card_type: card.card_type, invite_only: card.invite_only,
    category_rates: card.categoryRates,
  })
}
function hasCategory(card: CardRow, cat: CardCategory): boolean {
  return cardCategories(card).includes(cat)
}

export async function getRecommendations(request: RecommendRequest): Promise<RecommendResponse> {
  const rawCards = (await db.query.cards.findMany({
    with: { categoryRates: true, benefits: true, transferPartners: true },
  })) as unknown as CardRow[]

  const restrictions = await db.select().from(cardRestrictions).where(eq(cardRestrictions.is_active, true))

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const recentChangelog = await db
    .select()
    .from(benefitChangelog)
    .where(and(eq(benefitChangelog.is_published, true), gte(benefitChangelog.created_at, sixMonthsAgo)))

  const changelogByCard = new Map<string, { change_type: string; summary: string }[]>()
  for (const e of recentChangelog) {
    if (!changelogByCard.has(e.card_id)) changelogByCard.set(e.card_id, [])
    changelogByCard.get(e.card_id)!.push({ change_type: e.change_type, summary: e.summary })
  }

  const existingIds = rawCards.filter((c) => request.existing_card_slugs.includes(c.slug)).map((c) => c.id)
  const blockedIds = new Set<string>()
  for (const r of restrictions) if (existingIds.includes(r.blocker_card_id)) blockedIds.add(r.blocked_card_id)

  const cardPref: CardPreference | undefined = request.reward_preference
  const userPref: Pref = lensFor(cardPref)
  const eligibleCards = rawCards.filter((c) => eligible(c, request))

  const anchorOf = (c: CardRow) => resolveAnchorCpp(c)
  const changesOf = (c: CardRow) => changelogByCard.get(c.id) ?? []
  const build = (c: CardRow, lens: Pref) => buildResult(c, request, anchorOf(c), lens, blockedIds.has(c.id), changesOf(c))

  const total_monthly_spend = Object.values(request.monthly_spends).reduce((s, v) => s + v, 0)

  // ── No-CIBIL path: a focused "start here" list, not a value contest ────────
  if (request.credit_score_band === 'no_cibil') {
    const items = eligibleCards
      .map((c) => build(c, userPref))
      .sort((a, b) => {
        const fd = (b.card.fd_backed ? 1 : 0) - (a.card.fd_backed ? 1 : 0)
        return fd !== 0 ? fd : b._value - a._value
      })
      .map((r, i) => ({ ...r, rank: i + 1 }))
    return {
      computed_at: new Date().toISOString(),
      total_monthly_spend,
      preference: request.reward_preference ?? null,
      top_pick: items[0] ?? null,
      sections: items.length
        ? [{ id: 'build_credit', title: 'Build your credit', subtitle: 'FD-backed and no-CIBIL cards — the safe way to start a credit history.', items: items.slice(0, 8) }]
        : [],
      all_results: items,
    }
  }

  // ── Best OVERALL for the user (across all eligible cards, under their lens) ──
  const userRanked = eligibleCards
    .map((c) => build(c, userPref))
    .sort((a, b) => b._value - a._value)

  const top_pick = userRanked[0] ? { ...userRanked[0], rank: 1 } : null
  const topId = top_pick?.card.id
  const all_results = userRanked.map((r, i) => ({ ...r, rank: i + 1 }))

  const topN = (cands: CardRow[], lens: Pref, n: number, excludeId?: string) =>
    cands
      .filter((c) => c.id !== excludeId)
      .map((c) => build(c, lens))
      .filter((r) => r._value > 0)
      .sort((a, b) => b._value - a._value)
      .slice(0, n)
      .map((r, i) => ({ ...r, rank: i + 1 }))

  const sections: RecommendSection[] = []

  // 1) Respect the user's choice: best card(s) OF THE PICKED TYPE for their spends.
  if (cardPref && cardPref !== 'all_rounder') {
    const ofType = topN(eligibleCards.filter((c) => hasCategory(c, cardPref as CardCategory)), userPref, 4)
    if (ofType.length) {
      sections.push({
        id: `pick_${cardPref}`,
        title: `Best ${CARD_PREFERENCE_META[cardPref].label} card for you`,
        subtitle: CARD_PREFERENCE_META[cardPref].blurb,
        items: ofType,
      })
    }
  }

  // 2) Best overall (may differ from the picked type) — so they never miss the winner.
  const overall = topN(eligibleCards, userPref, 4, undefined)
  if (overall.length) {
    sections.push({
      id: 'overall',
      title: 'Best overall for your spends',
      subtitle: 'Top value across every card type you qualify for.',
      items: overall,
    })
  }

  // 3) Explore by type — the remaining card-type buckets for browsing.
  const BUCKETS: { cat: CardCategory; title: string; subtitle: string }[] = [
    { cat: 'cashback', title: 'Cashback', subtitle: 'Money back, nothing to manage.' },
    { cat: 'travel', title: 'Travel & miles', subtitle: 'Lounges + transferable airline/hotel value.' },
    { cat: 'fuel', title: 'Fuel', subtitle: 'Surcharge waiver + accelerated fuel rewards.' },
    { cat: 'premium', title: 'Premium perks', subtitle: 'Lounges, concierge and lifestyle benefits.' },
  ]
  for (const b of BUCKETS) {
    if (b.cat === cardPref) continue // already shown as the picked section
    const items = topN(eligibleCards.filter((c) => hasCategory(c, b.cat)), b.cat === 'cashback' ? 'cashback' : b.cat === 'travel' ? 'travel_miles' : b.cat === 'premium' ? 'premium_perks' : 'none', 4)
    if (items.length) sections.push({ id: `explore_${b.cat}`, title: b.title, subtitle: b.subtitle, items })
  }

  return {
    computed_at: new Date().toISOString(),
    total_monthly_spend,
    preference: request.reward_preference ?? null,
    top_pick,
    sections,
    all_results,
  }
}
