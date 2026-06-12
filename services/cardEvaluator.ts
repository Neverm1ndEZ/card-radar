/**
 * Card Evaluator — standalone card quality analysis.
 *
 * Used to answer: "Is this card still good?" independent of a spend profile.
 * Considers: joining fee ROI, ongoing NAV at median spend, recent devaluations,
 * transfer partner quality, and eligibility-to-value ratio.
 */

import { db } from '@/db'
import { cards, benefitChangelog, transferPartners, programValuations } from '@/db/schema'
import { eq, desc, and } from 'drizzle-orm'

export type CardEvaluation = {
  card_slug: string
  card_name: string
  issuer: string
  health_score: number          // 0–100
  value_tier: 'excellent' | 'good' | 'average' | 'poor' | 'avoid'
  joining_fee_roi: number | null // months to break even on joining fee at median spend
  annual_fee_roi: number | null  // months to break even on annual fee
  best_for: string[]             // e.g. ['grocery', 'travel', 'education']
  avoid_if: string[]             // e.g. ['education (no transfer partners)', 'international']
  recent_changes: Array<{
    date: string
    change_type: string
    summary: string
    impact: 'negative' | 'positive' | 'neutral'
  }>
  transfer_partners: Array<{
    program_name: string
    program_type: string
    transfer_ratio: number
    is_active: boolean
  }>
  verdict: string                // one-line human summary
}

const CHANGE_IMPACT: Record<string, 'negative' | 'positive' | 'neutral'> = {
  earning_rate_cut:      'negative',
  partner_removed:       'negative',
  milestone_removed:     'negative',
  fee_increase:          'negative',
  lounge_cutback:        'negative',
  benefit_removed:       'negative',
  earning_rate_increase: 'positive',
  partner_added:         'positive',
  fee_reduction:         'positive',
  milestone_added:       'positive',
  status_change:         'neutral',
}

const HEALTH_DELTA: Record<string, number> = {
  earning_rate_cut:      -20,
  partner_removed:       -15,
  milestone_removed:     -12,
  fee_increase:          -10,
  lounge_cutback:        -10,
  benefit_removed:        -8,
  earning_rate_increase: +10,
  partner_added:         +10,
  fee_reduction:         +10,
  milestone_added:        +8,
}

function healthToTier(score: number): CardEvaluation['value_tier'] {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'average'
  if (score >= 30) return 'poor'
  return 'avoid'
}

export async function evaluateCard(slug: string): Promise<CardEvaluation | null> {
  const card = await db.query.cards.findFirst({
    where: (c, { eq }) => eq(c.slug, slug),
    with: { categoryRates: true, transferPartners: true },
  })
  if (!card) return null

  const changelog = await db
    .select()
    .from(benefitChangelog)
    .where(
      and(
        eq(benefitChangelog.card_id, card.id),
        eq(benefitChangelog.is_published, true)
      )
    )
    .orderBy(desc(benefitChangelog.created_at))
    .limit(20)

  // Compute health score
  let health = 100
  for (const entry of changelog) {
    health += HEALTH_DELTA[entry.change_type] ?? -5
  }
  health = Math.max(0, Math.min(100, health))

  // Recent changes (last 6 months worth shown)
  const recent_changes = changelog.slice(0, 8).map((c) => ({
    date: c.effective_date ?? c.created_at?.toISOString().slice(0, 10) ?? 'unknown',
    change_type: c.change_type,
    summary: c.summary,
    impact: CHANGE_IMPACT[c.change_type] ?? 'neutral',
  }))

  // Best categories (top 3 earn rates above base)
  const rates = card.categoryRates
  const baseRate = parseFloat(card.base_earn_rate)
  const best_for = rates
    .filter((r) => parseFloat(r.earn_rate) > baseRate * 1.5)
    .sort((a, b) => parseFloat(b.earn_rate) - parseFloat(a.earn_rate))
    .slice(0, 3)
    .map((r) => r.category)

  // Avoid-if: categories with 0 earn rate or explicitly excluded
  const avoid_if: string[] = []
  if (!card.is_active) avoid_if.push('card not open for new applications')
  if (card.network === 'Diners') avoid_if.push('offline/small merchant use (Diners acceptance issues)')

  // Check if education was a previously good category but transfer partners removed
  const partnerRemovals = changelog.filter((c) => c.change_type === 'partner_removed')
  if (partnerRemovals.length >= 2) {
    avoid_if.push('education/high-value spends (multiple transfer partners removed)')
  }

  // Transfer partners
  const transfer_partners = card.transferPartners.map((tp) => ({
    program_name: tp.program_name,
    program_type: tp.program_type,
    transfer_ratio: parseFloat(tp.transfer_ratio),
    is_active: tp.is_active ?? true,
  }))

  // Joining fee ROI — estimate months to break even at ₹30k/month median spend
  const MEDIAN_MONTHLY = 30000
  const cpp = 0.30 // conservative avg CPP
  const baseEarnRate = parseFloat(card.base_earn_rate)
  const monthlyValue = (MEDIAN_MONTHLY / 100) * baseEarnRate * cpp
  const joiningFeeROI = card.joining_fee > 0 && monthlyValue > 0
    ? Math.round(card.joining_fee / monthlyValue)
    : null
  const annualFeeROI = card.annual_fee > 0 && monthlyValue > 0
    ? Math.round(card.annual_fee / monthlyValue)
    : null

  // Generate verdict
  const tier = healthToTier(health)
  let verdict: string
  if (!card.is_active) {
    verdict = `${card.name} is not currently open for new applications.`
  } else if (tier === 'excellent') {
    verdict = `${card.name} is in excellent shape — strong rewards, no major devaluations.`
  } else if (tier === 'good') {
    verdict = `${card.name} is a solid card. Minor changes but core value intact.`
  } else if (tier === 'average') {
    verdict = `${card.name} has seen some devaluations. Still usable but check your spend categories.`
  } else if (tier === 'poor') {
    verdict = `${card.name} has been hit with significant devaluations. Consider alternatives.`
  } else {
    verdict = `${card.name} has been heavily nerfed. Unless you have a specific use case, there are better options.`
  }

  return {
    card_slug: card.slug,
    card_name: card.name,
    issuer: card.issuer,
    health_score: health,
    value_tier: tier,
    joining_fee_roi: joiningFeeROI,
    annual_fee_roi: annualFeeROI,
    best_for,
    avoid_if,
    recent_changes,
    transfer_partners,
    verdict,
  }
}

// Batch evaluate all active cards for the /radar feed
export async function evaluateAllCards(): Promise<CardEvaluation[]> {
  const allCards = await db.query.cards.findMany({
    where: (c, { eq }) => eq(c.is_active, true),
  })
  const evals = await Promise.all(allCards.map((c) => evaluateCard(c.slug)))
  return evals.filter(Boolean) as CardEvaluation[]
}
