import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { benefitChangelog, type Card } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { evaluateCard } from '@/services/cardEvaluator'
import { CATEGORY_LABELS, type SpendCategory } from '@/lib/validators'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'

export const dynamic = 'force-dynamic'

const SEGMENT_LABELS: Record<string, string> = {
  secured: 'secured', starter: 'starter', mid: 'mid-tier',
  premium: 'premium', super_premium: 'super premium', co_branded: 'co-branded',
}
const TIER_LABEL: Record<string, string> = {
  excellent: 'excellent shape', good: 'solid', average: 'some devaluations', poor: 'heavily nerfed', avoid: 'avoid',
}
const TIER_PILL: Record<string, string> = {
  excellent: 'upgrade', good: 'upgrade', average: 'warn', poor: 'devalue', avoid: 'devalue',
}

function rupee(n: number) { return '₹ ' + n.toLocaleString('en-IN') }
function catLabel(cat: string) { return CATEGORY_LABELS[cat as SpendCategory] ?? cat }
function negativeChange(type: string) {
  return ['earning_rate_cut', 'partner_removed', 'milestone_removed', 'fee_increase', 'lounge_cutback', 'benefit_removed'].includes(type)
}

function whoFor(card: Card): string {
  if (card.fd_backed || card.no_cibil_required) return 'For building a credit history from scratch — issued against an FD, no CIBIL needed.'
  switch (card.card_segment) {
    case 'starter': return 'A sensible first card for new-to-credit users and modest monthly spends.'
    case 'super_premium': return 'For high spenders who maximise premium travel, lounges and lifestyle perks — and can justify the fee.'
    case 'premium': return 'For frequent travellers and higher spenders who’ll use lounges and transferable points.'
    case 'co_branded': return 'Best if you’re loyal to this brand — it pays off on that ecosystem, less so elsewhere.'
    case 'mid': return card.card_type === 'cashback'
      ? 'Everyday value for online-heavy spenders who want straightforward cashback.'
      : 'A solid daily-driver for steady spenders who want rewards without a premium fee.'
    default: return 'A general-purpose card — check the earn rates against your own spending.'
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const card = await db.query.cards.findFirst({ where: (c, { eq }) => eq(c.slug, slug) })
  if (!card) return { title: 'Card not found · CardRadar' }
  return { title: `${card.name} — fees, rewards & devaluations · CardRadar` }
}

export default async function CardDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const card = await db.query.cards.findFirst({
    where: (c, { eq }) => eq(c.slug, slug),
    with: { categoryRates: true, benefits: true, transferPartners: true, accelerators: true },
  })
  if (!card) notFound()

  const [evaluation, changelog] = await Promise.all([
    evaluateCard(slug),
    db.select().from(benefitChangelog)
      .where(and(eq(benefitChangelog.card_id, card.id), eq(benefitChangelog.is_published, true)))
      .orderBy(desc(benefitChangelog.created_at)).limit(12),
  ])

  const baseRate = parseFloat(card.base_earn_rate)
  // Rates expressed as a % (cashback / stated value-back) read as "X%"; raw point rates
  // read as "X /₹100". Default by reward class when rate_kind is absent (legacy rows).
  const isCashLike = /cash/i.test(card.reward_currency)
  const fmtRate = (rate: number, kind: string | null) => {
    const pct = kind === 'cashback_pct' || kind === 'value_back_pct' || (kind == null && isCashLike)
    return pct ? `${rate}%` : `${rate} / ₹100`
  }
  const baseKind = isCashLike ? 'cashback_pct' : null
  const bonusRates = [...card.categoryRates]
    .map((r) => ({
      category: r.category,
      rate: parseFloat(r.earn_rate),
      cap: r.earn_cap_monthly,
      capGroup: r.cap_group,
      kind: r.rate_kind,
      notes: r.notes,
    }))
    .filter((r) => Math.abs(r.rate - baseRate) > 0.001 || r.kind === 'value_back_pct')
    .sort((a, b) => b.rate - a.rate)
  const accelerators = card.accelerators.filter((a) => a.is_active !== false)
  const activeBenefits = card.benefits.filter((b) => b.is_active !== false)
  const activePartners = card.transferPartners.filter((t) => t.is_active !== false)
  const removedPartners = card.transferPartners.filter((t) => t.is_active === false)
  const bestFor = (evaluation?.best_for?.length ? evaluation.best_for : bonusRates.slice(0, 3).map((r) => r.category)).map(catLabel)
  const headsUp = evaluation?.avoid_if ?? []
  const feeDisplay = card.is_lifetime_free ? 'lifetime free' : card.annual_fee === 0 ? 'no annual fee' : `${rupee(card.annual_fee)}/yr`

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        active="cards"
        rightSlot={<Link href="/cards" className="text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">← all cards</Link>}
      />

      <div className="mx-auto w-full max-w-5xl px-5 py-8">
        <div className="mono mb-4 text-xs text-[var(--ink-faint)]">
          cards / {card.card_segment ?? 'mid'} / {card.slug}
        </div>

        {/* Hero */}
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="wf-box p-6">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">{card.issuer}</span>
              <span className="wf-pill text-[11px]">{card.network}</span>
              {card.card_segment && <span className="wf-pill text-[11px]">{SEGMENT_LABELS[card.card_segment] ?? card.card_segment}</span>}
              {card.invite_only && <span className="wf-pill warn text-[11px]">invite-only</span>}
            </div>
            <h1 className="hand text-3xl font-bold leading-tight">{card.name}</h1>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">{whoFor(card)}</p>

            {evaluation && (
              <div className="mt-4 flex items-center gap-3">
                <span className={`wf-pill ${TIER_PILL[evaluation.value_tier] ?? ''} text-[11px]`}>{TIER_LABEL[evaluation.value_tier] ?? evaluation.value_tier}</span>
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-tint)]">
                    <div className="h-full rounded-full" style={{ width: `${evaluation.health_score}%`, background: evaluation.health_score >= 70 ? 'var(--accent-3)' : evaluation.health_score >= 50 ? 'var(--warn)' : 'var(--accent)' }} />
                  </div>
                  <span className="mono text-xs text-[var(--ink-faint)]">health {evaluation.health_score}/100</span>
                </div>
              </div>
            )}

            {card.is_active === false && (
              <div className="wf-box warn mt-4 px-3 py-2 text-xs" style={{ background: '#f6e7c8', borderColor: 'var(--warn)', color: 'var(--warn)' }}>
                not currently open for new applications.
              </div>
            )}
          </div>

          {/* Sidebar facts */}
          <div className="wf-box tint flex flex-col gap-2 p-4">
            <Fact label="annual fee" value={feeDisplay} />
            <Fact label="joining fee" value={card.joining_fee === 0 ? 'none' : rupee(card.joining_fee)} />
            {card.annual_fee_waiver_spend ? <Fact label="fee waiver at" value={`${rupee(card.annual_fee_waiver_spend)}/yr`} /> : null}
            <Fact label="base earn rate" value={`${baseRate} / ₹100`} />
            <Fact label="rewards in" value={card.reward_currency} />
            {card.forex_markup != null && <Fact label="forex markup" value={`${parseFloat(card.forex_markup)}%`} />}
            {card.joining_bonus_value ? <Fact label="welcome benefit" value={rupee(card.joining_bonus_value)} /> : null}
            {card.min_income_salary ? <Fact label="min. income" value={`${rupee(card.min_income_salary)}/yr`} /> : null}
            <div className="mt-2 flex flex-col gap-2">
              {card.apply_url && card.is_active !== false && (
                <a href={card.apply_url} target="_blank" rel="noopener noreferrer" className="wf-btn solid justify-center text-xs">apply on {card.issuer} →</a>
              )}
              <Link href="/find-my-card" className="wf-btn justify-center text-xs">value it for my spends</Link>
            </div>
          </div>
        </div>

        {/* Best for / Heads up */}
        {(bestFor.length > 0 || headsUp.length > 0) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="wf-box p-5">
              <h2 className="hand text-base font-bold sev-green">✓ best for</h2>
              {bestFor.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {bestFor.map((c, i) => <span key={i} className="wf-pill upgrade text-[11px] capitalize">{c}</span>)}
                </div>
              ) : <p className="mt-2 text-xs text-[var(--ink-faint)]">flat earner — no standout category.</p>}
            </div>
            <div className="wf-box p-5">
              <h2 className="hand text-base font-bold sev-amber">⚠ heads up</h2>
              {headsUp.length > 0 ? (
                <ul className="mt-3 space-y-1.5">{headsUp.map((h, i) => <li key={i} className="text-xs text-[var(--ink-soft)]">• {h}</li>)}</ul>
              ) : <p className="mt-2 text-xs text-[var(--ink-faint)]">no major caveats we’re tracking.</p>}
            </div>
          </div>
        )}

        {/* Main two-column */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-4">
            {/* Earn rates */}
            <Section title="earn rates">
              {bonusRates.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="rule-b text-left">
                      <th className="mono pb-2 text-[11px] font-normal text-[var(--ink-soft)]">category</th>
                      <th className="mono pb-2 text-right text-[11px] font-normal text-[var(--ink-soft)]">rate</th>
                      <th className="mono pb-2 text-right text-[11px] font-normal text-[var(--ink-soft)]">cap/mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="dashed-b"><td className="py-2 text-[var(--ink-soft)]">base · everything else</td><td className="mono py-2 text-right">{fmtRate(baseRate, baseKind)}</td><td className="mono py-2 text-right text-[var(--ink-faint)]">—</td></tr>
                    {bonusRates.map((r) => (
                      <tr key={r.category} className="dashed-b">
                        <td className="py-2">
                          {catLabel(r.category)}
                          {r.capGroup ? <sup className="ml-0.5 text-[10px] text-[var(--ink-faint)]">†</sup> : null}
                        </td>
                        <td className="mono py-2 text-right font-semibold sev-green">{fmtRate(r.rate, r.kind)}</td>
                        <td className="mono py-2 text-right text-[var(--ink-faint)]">{r.cap ? rupee(r.cap) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">flat <b className="text-[var(--ink)]">{fmtRate(baseRate, baseKind)}</b> on all spends — no category bonuses.</p>
              )}
              {bonusRates.some((r) => r.capGroup) && (
                <p className="mt-3 text-[11px] text-[var(--ink-faint)]">† these categories share a single combined monthly cap.</p>
              )}
            </Section>

            {/* Accelerated & portal rewards (pillar 2) */}
            {accelerators.length > 0 && (
              <Section title="accelerated & portal rewards">
                <p className="mb-3 text-xs text-[var(--ink-soft)]">
                  Beyond the base {fmtRate(baseRate, baseKind)}, this card unlocks higher value through bank portals and partner offers:
                </p>
                <div className="flex flex-col gap-2">
                  {accelerators.map((a) => {
                    const eff = a.effective_rate_pct != null ? parseFloat(a.effective_rate_pct) : null
                    const mult = a.multiplier != null ? parseFloat(a.multiplier) : null
                    return (
                      <div key={a.id} className="wf-box tint p-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-[var(--ink)]">{a.label}</span>
                          {eff != null ? (
                            <span className="mono shrink-0 text-sm font-semibold sev-green">≈{eff}%</span>
                          ) : mult != null ? (
                            <span className="mono shrink-0 text-sm font-semibold sev-green">{mult}×</span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {a.channel && <span className="wf-pill info text-[10px]">{a.channel}</span>}
                          {(a.applies_to ?? []).map((c) => (
                            <span key={c} className="wf-pill text-[10px] capitalize">{catLabel(c)}</span>
                          ))}
                        </div>
                        {a.monthly_cap ? <p className="mt-1.5 text-[11px] sev-amber">capped ~{rupee(a.monthly_cap)} reward/mo</p> : null}
                        {a.condition_note ? <p className="mt-0.5 text-[11px] text-[var(--ink-soft)]">{a.condition_note}</p> : null}
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* Benefits */}
            {activeBenefits.length > 0 && (
              <Section title="benefits & perks">
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeBenefits.map((b) => (
                    <div key={b.id} className="wf-box tint p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--ink)]">★ {b.title}</span>
                        {b.monetary_value ? <span className="mono shrink-0 text-[11px] sev-green">~{rupee(b.monetary_value)}/yr</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">{b.description}</p>
                      {b.spend_threshold ? <p className="mt-0.5 text-[11px] sev-amber">unlocks at {rupee(b.spend_threshold)}/yr</p> : null}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Recent changes */}
            {changelog.length > 0 && (
              <Section title="recent changes · radar">
                <div className="flex flex-col gap-2.5">
                  {changelog.map((c) => (
                    <div key={c.id} className="flex items-start gap-2.5 text-sm">
                      <span className="mono w-16 shrink-0 text-[11px] text-[var(--ink-faint)]">{c.effective_date ?? c.created_at?.toISOString().slice(0, 10)}</span>
                      <span className={negativeChange(c.change_type) ? 'sev-red' : 'sev-green'}>{negativeChange(c.change_type) ? '▼' : '▲'}</span>
                      <span className="text-[var(--ink)]">{c.summary}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* Side column */}
          <div className="flex flex-col gap-4">
            {(activePartners.length > 0 || removedPartners.length > 0) && (
              <Section title="transfer partners">
                <div className="flex flex-col gap-1.5">
                  {activePartners.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span>{t.program_name}</span><span className="mono text-[var(--ink-soft)]">{parseFloat(t.transfer_ratio)}:1</span>
                    </div>
                  ))}
                </div>
                {removedPartners.length > 0 && (
                  <div className="mt-3">
                    <div className="mono mb-1.5 text-[11px] sev-red">removed</div>
                    <div className="flex flex-col gap-1">
                      {removedPartners.map((t) => <span key={t.id} className="text-sm text-[var(--ink-faint)] line-through">{t.program_name}</span>)}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {(card.fd_backed || card.no_cibil_required || card.invite_only || card.is_lifetime_free) && (
              <Section title="eligibility">
                <ul className="space-y-1.5 text-sm text-[var(--ink-soft)]">
                  {card.fd_backed && <li>· FD-backed{card.min_fd_amount ? ` · min FD ${rupee(card.min_fd_amount)}` : ''}</li>}
                  {card.no_cibil_required && <li>· no CIBIL history required</li>}
                  {card.invite_only && <li>· invite-only — needs an existing relationship</li>}
                  {card.is_lifetime_free && <li>· lifetime free</li>}
                </ul>
              </Section>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-[var(--ink-faint)]">
          <Link href="/find-my-card" className="underline">run your spend profile</Link> to see this card&apos;s value for you.
        </p>
      </div>

      <SiteFooter />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-[var(--ink-faint)]">{label}</span>
      <span className="text-sm font-medium text-[var(--ink)]">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="wf-box p-5">
      <h2 className="hand mb-3 text-base font-bold">{title}</h2>
      {children}
    </div>
  )
}
