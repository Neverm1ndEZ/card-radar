/**
 * Existing-card optimizer — for a card the user ALREADY holds, show how to get the
 * most out of it: which categories earn best, where they're leaving money on the
 * table (spends stuck at base rate), untapped portal/accelerated routes (SmartBuy etc.),
 * and monthly caps they're bumping into.
 *
 * This is the counterpart to services/recommendation.ts: that picks a NEW card; this
 * coaches the card you have. It deliberately mirrors the engine's valuation primitives
 * (CPP resolution, the legacy-rate clamp, shared cap_group pooling) so the rupee figures
 * here agree with what the recommender shows. Realistic/blended lens (no preference).
 */
import { db } from '@/db'
import {
  CATEGORY_FALLBACK_CHAIN,
  CATEGORY_LABELS,
  type SpendCategory,
  type SpendProfile,
} from '@/lib/validators'
import { rewardClass } from '@/services/cardCategory'
import { ISSUER_CPP, CLASS_CPP_FALLBACK, CURATED_CPP_BY_SLUG } from '@/db/curated-rewards'

// Mirror of the engine constants (services/recommendation.ts). Keep in sync.
const MAX_LEGACY_VALUE_BACK = 6 // ₹ per ₹100 ceiling for untrusted scraped (NULL-kind) rows
const MAX_REWARD_RATE = 40
const TRAVEL_CURRENCY = new Set(['Air India Miles', 'Club Vistara Points'])
const NO_BASE_FALLBACK = new Set<SpendCategory>(['rent', 'upi'])

type RateKind = 'cashback_pct' | 'value_back_pct' | 'points_per_100' | null

export type CategoryAdvice = {
  category: SpendCategory
  label: string
  monthly_spend: number
  rate_label: string
  effective_pct: number // realized value-back % on this category
  is_accelerated: boolean // earns above the card's base rate
  earns_base_only: boolean // no category bonus — just the base rate
  monthly_reward: number
  annual_reward: number
  cap_monthly: number | null
  capped: boolean
  lost_monthly_reward: number // reward forfeited above the cap
}

export type AcceleratorAdvice = {
  label: string
  channel: string | null
  applies_to: string[]
  effective_rate_pct: number | null
  multiplier: number | null
  monthly_cap: number | null
  condition_note: string | null
  matched_spend_monthly: number // user's monthly spend that this channel could cover
  untapped: boolean // user has relevant spend and the channel beats their default rate
}

export type CardOptimization = {
  card: {
    slug: string
    name: string
    issuer: string
    network: string
    reward_currency: string
    base_earn_rate: string
    annual_fee: number
    image_url: string | null
    apply_url: string | null
  }
  annual_spend: number
  annual_rewards: number
  effective_rate_pct: number
  net_annual_value: number
  base_effective_pct: number
  categories: CategoryAdvice[]
  best_categories: string[]
  underperforming: CategoryAdvice[]
  accelerators: AcceleratorAdvice[]
  cap_warnings: CategoryAdvice[]
  tips: string[]
}

type CardRow = {
  id: string
  slug: string
  name: string
  issuer: string
  network: string
  reward_currency: string
  base_earn_rate: string
  annual_fee: number
  annual_fee_waiver_spend: number | null
  is_lifetime_free: boolean | null
  image_url: string | null
  apply_url: string | null
  categoryRates: {
    category: string
    earn_rate: string
    earn_cap_monthly: number | null
    rate_kind: string | null
    cap_group: string | null
  }[]
  accelerators: {
    label: string
    channel: string | null
    applies_to: string[] | null
    multiplier: string | null
    effective_rate_pct: string | null
    monthly_cap: number | null
    condition_note: string | null
    is_active: boolean | null
  }[]
  transferPartners: { is_active: boolean | null }[]
}

function anchorCpp(card: CardRow): number {
  const override = CURATED_CPP_BY_SLUG[card.slug]
  if (override != null) return override
  const cls = rewardClass(card.reward_currency) ?? 'points'
  if (cls === 'cashback') return 1.0
  return ISSUER_CPP[card.issuer]?.[cls] ?? CLASS_CPP_FALLBACK[cls]
}

function canTransfer(card: CardRow): boolean {
  if (TRAVEL_CURRENCY.has(card.reward_currency)) return true
  return card.transferPartners.some((t) => t.is_active !== false)
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const pct = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)}%`

export async function optimizeExistingCard(
  slug: string,
  monthlySpends: Partial<SpendProfile>
): Promise<CardOptimization | null> {
  const card = (await db.query.cards.findFirst({
    where: (c, { eq }) => eq(c.slug, slug),
    with: { categoryRates: true, accelerators: true, transferPartners: true },
  })) as unknown as CardRow | undefined
  if (!card) return null

  const cpp = anchorCpp(card)
  const mult = canTransfer(card) ? 1.0 : 0.85 // blended/realistic lens (no preference)
  const isCash = rewardClass(card.reward_currency) === 'cashback'
  const base = Math.min(Math.max(parseFloat(card.base_earn_rate) || 0, 0), MAX_REWARD_RATE)

  // ₹ value earned per ₹100 of spend for a given (rate, kind) — mirrors the engine.
  const valuePer100 = (rate: number, kind: RateKind): number => {
    const r = Math.min(Math.max(rate, 0), MAX_REWARD_RATE)
    let v: number
    if (kind === 'cashback_pct' || kind === 'value_back_pct') v = r
    else if (kind === 'points_per_100') v = r * cpp * mult
    else v = isCash ? r : r * cpp * mult // legacy / base fallback
    if (kind == null) v = Math.min(v, MAX_LEGACY_VALUE_BACK) // untrusted rows bounded
    return v
  }
  const baseEff = valuePer100(base, null)

  const rateMap = new Map(card.categoryRates.map((r) => [r.category, r]))
  const resolve = (category: SpendCategory) => {
    const chain = CATEGORY_FALLBACK_CHAIN[category] ?? [category]
    for (const c of chain) {
      const r = rateMap.get(c)
      if (r) return { matched: true as const, ...r }
    }
    if (NO_BASE_FALLBACK.has(category)) return null // earns nothing without an explicit rate
    return { matched: false as const, category, earn_rate: card.base_earn_rate, earn_cap_monthly: null, rate_kind: null, cap_group: null }
  }

  const fmtRate = (rate: number, kind: RateKind, matched: boolean): string => {
    if (!matched) return `base ${pct(baseEff)}`
    if (kind === 'cashback_pct') return `${pct(rate)} back`
    if (kind === 'value_back_pct') return `~${pct(rate)} value`
    if (kind === 'points_per_100') return `${rate} pts/₹100`
    return isCash ? `${pct(rate)} back` : `${rate} pts/₹100`
  }

  // 1) Per-category raw earnings (pre-cap).
  type Raw = CategoryAdvice & { group: string | null; raw_monthly: number }
  const raws: Raw[] = []
  for (const [cat, spendRaw] of Object.entries(monthlySpends)) {
    const monthly_spend = spendRaw ?? 0
    if (monthly_spend <= 0) continue
    const category = cat as SpendCategory
    const rr = resolve(category)
    if (!rr) continue
    const rate = parseFloat(rr.earn_rate) || 0
    const kind = (rr.rate_kind as RateKind) ?? null
    const per100 = valuePer100(rate, kind)
    if (per100 <= 0) continue
    const raw_monthly = (monthly_spend / 100) * per100
    raws.push({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      monthly_spend,
      rate_label: fmtRate(rate, kind, rr.matched),
      effective_pct: Math.round(per100 * 100) / 100,
      is_accelerated: rr.matched && per100 > baseEff + 0.01,
      earns_base_only: !rr.matched || per100 <= baseEff + 0.01,
      monthly_reward: 0,
      annual_reward: 0,
      cap_monthly: rr.earn_cap_monthly ?? null,
      capped: false,
      lost_monthly_reward: 0,
      group: rr.cap_group ?? null,
      raw_monthly,
    })
  }

  // 2) Apply caps (shared cap_group pools + per-row caps), mirroring the engine.
  const groups = new Map<string, { sum: number; cap: number; rows: Raw[] }>()
  for (const a of raws) {
    if (a.group) {
      const g = groups.get(a.group) ?? { sum: 0, cap: a.cap_monthly ?? Infinity, rows: [] }
      g.sum += a.raw_monthly
      g.cap = Math.min(g.cap, a.cap_monthly ?? Infinity)
      g.rows.push(a)
      groups.set(a.group, g)
    } else {
      const capped = a.cap_monthly != null && a.raw_monthly > a.cap_monthly
      const final = capped ? a.cap_monthly! : a.raw_monthly
      a.monthly_reward = final
      a.lost_monthly_reward = a.raw_monthly - final
      a.capped = capped
    }
  }
  for (const g of groups.values()) {
    const scale = g.sum > 0 ? Math.min(g.sum, g.cap) / g.sum : 0
    for (const a of g.rows) {
      a.monthly_reward = a.raw_monthly * scale
      a.lost_monthly_reward = a.raw_monthly - a.monthly_reward
      a.capped = scale < 1
    }
  }
  for (const a of raws) {
    a.monthly_reward = Math.round(a.monthly_reward)
    a.annual_reward = Math.round(a.monthly_reward * 12)
    a.lost_monthly_reward = Math.round(a.lost_monthly_reward)
  }

  const categories: CategoryAdvice[] = raws
    .map(({ group, raw_monthly, ...rest }) => rest)
    .sort((a, b) => b.annual_reward - a.annual_reward)

  const annual_spend = Object.values(monthlySpends).reduce((s, v) => s + (v ?? 0), 0) * 12
  const annual_rewards = categories.reduce((s, c) => s + c.annual_reward, 0)
  const willWaive = card.annual_fee_waiver_spend != null && annual_spend >= card.annual_fee_waiver_spend
  const net_fee = card.is_lifetime_free || willWaive ? 0 : card.annual_fee

  // 3) Accelerators relevant to the user's spend. For each, find the user's matched
  // monthly spend AND what they currently earn on those categories — an accelerator is
  // only "untapped" if it beats their CURRENT per-category rate (a curated category rate
  // may already bake in the portal value, in which case it's not extra money missed).
  const matchAppliesTo = (cat: string, appliesTo: string[]): boolean => {
    const chain = CATEGORY_FALLBACK_CHAIN[cat as SpendCategory] ?? [cat]
    return appliesTo.includes(cat) || chain.some((c) => appliesTo.includes(c))
  }
  const channelMatch = (appliesTo: string[]): { spend: number; currentEff: number } => {
    let spend = 0
    let currentEff = 0
    for (const r of raws) {
      if (!matchAppliesTo(r.category, appliesTo)) continue
      spend += r.monthly_spend
      currentEff = Math.max(currentEff, r.effective_pct)
    }
    return { spend, currentEff }
  }
  const accelerators: AcceleratorAdvice[] = card.accelerators
    .filter((a) => a.is_active !== false)
    .map((a) => {
      const applies_to = a.applies_to ?? []
      const eff = a.effective_rate_pct != null ? parseFloat(a.effective_rate_pct) : null
      const { spend, currentEff } = channelMatch(applies_to)
      return {
        label: a.label,
        channel: a.channel,
        applies_to,
        effective_rate_pct: eff,
        multiplier: a.multiplier != null ? parseFloat(a.multiplier) : null,
        monthly_cap: a.monthly_cap,
        condition_note: a.condition_note,
        matched_spend_monthly: spend,
        // Untapped only if it beats what they already earn on those categories.
        untapped: spend > 0 && (eff ?? 0) > currentEff + 0.5,
        _currentEff: currentEff,
      } as AcceleratorAdvice & { _currentEff: number }
    })
    .sort((a, b) => b.matched_spend_monthly - a.matched_spend_monthly)

  const cap_warnings = categories.filter((c) => c.capped && c.lost_monthly_reward > 0)
  const underperforming = categories
    .filter((c) => c.earns_base_only && c.monthly_spend >= 2000)
    .sort((a, b) => b.monthly_spend - a.monthly_spend)
  const best_categories = categories.filter((c) => c.annual_reward > 0).slice(0, 3).map((c) => c.label)

  // 4) Human tips, highest-leverage first.
  const tips: string[] = []
  for (const a of accelerators.filter((x) => x.untapped).slice(0, 2)) {
    const cur = (a as AcceleratorAdvice & { _currentEff: number })._currentEff
    const where = a.channel ? `via ${a.channel}` : `(${a.label})`
    const caveat = a.condition_note ? ` (${a.condition_note})` : ''
    tips.push(
      `Route your ${inr(a.matched_spend_monthly)}/mo on ${a.applies_to.join('/')} ${where} for ${a.effective_rate_pct != null ? `~${pct(a.effective_rate_pct)}` : 'a higher rate'} — above the ${pct(cur)} you currently get there${caveat}.`
    )
  }
  for (const c of cap_warnings.slice(0, 2)) {
    tips.push(
      `You're hitting the ${inr(c.cap_monthly ?? 0)}/mo cap on ${c.label} — about ${inr(c.lost_monthly_reward)}/mo of rewards is lost beyond it. Put extra ${c.label.toLowerCase()} spend on another card.`
    )
  }
  for (const c of underperforming.slice(0, 2)) {
    tips.push(
      `Your ${inr(c.monthly_spend)}/mo on ${c.label} only earns the base ${pct(baseEff)} here — a card that accelerates ${c.label.toLowerCase()} would pay more.`
    )
  }
  if (net_fee > 0 && annual_rewards - net_fee < net_fee) {
    tips.push(
      `At this spend the card nets ${inr(annual_rewards - net_fee)}/yr against its ${inr(card.annual_fee)} fee — make sure the perks justify keeping it.`
    )
  }
  if (tips.length === 0 && best_categories.length) {
    tips.push(`You're already earning well — ${best_categories[0]} is this card's strongest category for your spends.`)
  }

  return {
    card: {
      slug: card.slug,
      name: card.name,
      issuer: card.issuer,
      network: card.network,
      reward_currency: card.reward_currency,
      base_earn_rate: card.base_earn_rate,
      annual_fee: card.annual_fee,
      image_url: card.image_url,
      apply_url: card.apply_url,
    },
    annual_spend,
    annual_rewards,
    effective_rate_pct: annual_spend > 0 ? Math.round((annual_rewards / annual_spend) * 1000) / 10 : 0,
    net_annual_value: annual_rewards - net_fee,
    base_effective_pct: Math.round(baseEff * 100) / 100,
    categories,
    best_categories,
    underperforming,
    accelerators: accelerators.map(({ _currentEff, ...a }: AcceleratorAdvice & { _currentEff?: number }) => a),
    cap_warnings,
    tips,
  }
}
