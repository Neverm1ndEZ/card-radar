'use client'

import Link from 'next/link'
import type { RecommendationResult } from '@/lib/validators'

interface Props {
  result: RecommendationResult
  rank: number
}

const TYPE_LABELS: Record<string, string> = {
  cashback: 'cashback', travel: 'travel', premium: 'premium',
  lifestyle: 'lifestyle', fuel: 'fuel', 'co-branded': 'co-branded',
}

function inr(n: number) {
  return '₹ ' + Math.abs(Math.round(n)).toLocaleString('en-IN')
}

export function CardResult({ result, rank }: Props) {
  const { card, annual_value, value_basis, breakdown, warnings, why_this_card, perk_highlights } = result
  const positive = annual_value > 0
  const feeDisplay = card.is_lifetime_free ? 'lifetime free' : card.annual_fee === 0 ? 'no fee' : `${inr(card.annual_fee)}/yr fee`

  const topCategories = Object.entries(breakdown.by_category)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)

  return (
    <div className="wf-box p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="hand text-2xl leading-none text-[var(--ink-faint)]">{rank}</span>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="mono text-[11px] uppercase tracking-wide text-[var(--ink-faint)]">{card.issuer}</span>
              <span className="wf-pill text-[10px]">{card.network}</span>
              <span className="wf-pill text-[10px]">{TYPE_LABELS[card.card_type] ?? card.card_type}</span>
            </div>
            <h3 className="font-semibold leading-snug text-[var(--ink)]">{card.name}</h3>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{why_this_card}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`mono text-2xl font-bold ${positive ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)]'}`}>
            {positive ? '+ ' : '– '}{inr(annual_value)}
          </div>
          <div className="text-[11px] text-[var(--ink-faint)]">{value_basis}</div>
        </div>
      </div>

      <div className="dashed-b my-3" />

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Stat label="fee" value={feeDisplay} />
        <Stat label="rewards" value={`+ ${inr(breakdown.rewards_earned)}`} accentGreen />
        {breakdown.benefit_value > 0 && <Stat label="perk value" value={`+ ${inr(breakdown.benefit_value)}`} accentGreen />}
        {breakdown.net_fee > 0 && <Stat label="fee paid" value={`– ${inr(breakdown.net_fee)}`} accentRed />}
      </div>

      {(topCategories.length > 0 || perk_highlights.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topCategories.map(([cat, val]) => (
            <span key={cat} className="wf-pill text-[11px]">
              <span className="capitalize">{cat}</span>
              <span className="mono text-[var(--ink-soft)]">{inr(val)}/yr</span>
            </span>
          ))}
          {perk_highlights.map((p, i) => (
            <span key={i} className="wf-pill info text-[11px]">★ {p}</span>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {warnings.map((w, i) => (
            <span key={i} className="wf-pill warn text-[11px]">⚠ {w}</span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        {card.apply_url && (
          <a href={card.apply_url} target="_blank" rel="noopener noreferrer" className="wf-btn solid text-xs">
            apply →
          </a>
        )}
        <Link href={`/cards/${card.slug}`} className="wf-btn text-xs">view details</Link>
      </div>
    </div>
  )
}

function Stat({ label, value, accentGreen, accentRed }: { label: string; value: string; accentGreen?: boolean; accentRed?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-[var(--ink-faint)]">{label}</span>
      <span className={`mono font-medium ${accentGreen ? 'sev-green' : accentRed ? 'sev-red' : 'text-[var(--ink)]'}`}>{value}</span>
    </div>
  )
}
