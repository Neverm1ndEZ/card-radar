'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuizStore } from '@/stores/quiz'
import { CardResult } from '@/components/cards/CardResult'
import { NAVBreakdownChart } from '@/components/cards/NAVBreakdownChart'
import { SiteHeader } from '@/components/site/SiteHeader'
import { CARD_PREFERENCE_META, type CardPreference, type RecommendResponse, type RecommendationResult } from '@/lib/validators'

function inr(n: number) {
  return '₹ ' + Math.round(n).toLocaleString('en-IN')
}

export default function Results() {
  const router = useRouter()
  const store = useQuizStore()
  const [data, setData] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    useQuizStore.persist.rehydrate()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const request = store.toRequest()
    const total = Object.values(request.monthly_spends).reduce((s, v) => s + v, 0)
    if (total === 0) {
      router.replace('/find-my-card')
      return
    }
    async function fetchResults() {
      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        })
        if (!res.ok) throw new Error('failed')
        setData(await res.json())
      } catch {
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const totalMonthly = data?.total_monthly_spend ?? 0
  const catCount = Object.values(store.monthly_spends).filter((v) => v > 0).length
  const pref = data?.preference as CardPreference | null | undefined
  const prefText = pref ? CARD_PREFERENCE_META[pref]?.label : null
  // Best overall (top_pick) + best of the picked type (from the pick_* section).
  const bestOverall = data?.top_pick ?? null
  const pickSection = data?.sections.find((s) => s.id.startsWith('pick_'))
  const bestOfType = pickSection?.items[0] ?? null
  // Show the type hero only when it's a different card than the overall winner.
  const showTypeHero = !!bestOfType && bestOfType.card.id !== bestOverall?.card.id
  // Below the heroes, show only the "explore by type" buckets (heroes cover pick/overall).
  const exploreSections = data?.sections.filter((s) => s.id.startsWith('explore_')) ?? []

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        active="find"
        rightSlot={
          <Link href="/find-my-card" className="text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
            ← edit profile
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-5xl px-5 py-8">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-(--paper-tint) border-t-accent" />
            <p className="text-sm text-[var(--ink-soft)]">matching cards to how you actually spend…</p>
          </div>
        )}

        {error && (
          <div className="py-24 text-center">
            <p className="mb-4 text-[var(--ink-soft)]">{error}</p>
            <Link href="/find-my-card" className="wf-btn">go back and try again</Link>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary */}
            <div className="mb-6">
              <h1 className="hand text-3xl font-bold">your matches</h1>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                profile · <span className="mono">{inr(totalMonthly)}</span>/mo across {catCount}{' '}
                {catCount === 1 ? 'category' : 'categories'}
                {prefText ? <> · you asked for <b className="text-[var(--ink)]">{prefText}</b></> : <> · ranked by best overall value</>}
              </p>
            </div>

            {/* Headline picks: best of the type you chose + best overall for your spends */}
            {bestOverall && (
              <div className="mb-8 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                <div className="grid gap-4">
                  {showTypeHero && bestOfType && (
                    <HeroPick
                      result={bestOfType}
                      tag={`★ best ${prefText ?? 'match'} for you`}
                      note="respects the card type you picked"
                    />
                  )}
                  <HeroPick
                    result={bestOverall}
                    tag={showTypeHero ? '✦ best overall for your spends' : '★ your match · rank 1'}
                    note={showTypeHero ? 'highest total value across all card types' : undefined}
                  />
                </div>
                <NAVBreakdownChart results={data.all_results} />
              </div>
            )}

            {/* Explore by card type */}
            <div className="space-y-8">
              {exploreSections.map((section) => (
                <section key={section.id}>
                  <div className="mb-3">
                    <h3 className="hand text-xl font-bold">{section.title}</h3>
                    <p className="text-xs text-[var(--ink-soft)]">{section.subtitle}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {section.items.map((r) => <CardResult key={section.id + r.card.id} result={r} rank={r.rank} />)}
                  </div>
                </section>
              ))}
            </div>

            {/* Show all */}
            {data.all_results.length > 0 && (
              <div className="mt-10">
                <button onClick={() => setShowAll((v) => !v)} className="wf-btn w-full justify-center">
                  {showAll ? 'hide full list' : `show all ${data.all_results.length} eligible cards, ranked`}
                </button>
                {showAll && (
                  <div className="mt-4 space-y-3">
                    {data.all_results.map((r) => <CardResult key={'all' + r.card.id} result={r} rank={r.rank} />)}
                  </div>
                )}
              </div>
            )}

            <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-[var(--ink-faint)]">
              value is modelled from your point of view — points valued by how you&apos;d realistically redeem them,
              perks weighted by what you said matters. affiliate links are disclosed and never influence rankings.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function HeroPick({ result, tag, note }: { result: RecommendationResult; tag: string; note?: string }) {
  return (
    <div className="wf-box p-5">
      <span className="wf-pill solid self-start text-[11px]">{tag}</span>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="hand text-2xl font-bold leading-tight">{result.card.name}</h2>
          <p className="mt-0.5 text-sm text-[var(--ink-soft)]">{result.match_reason}</p>
          {note && <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">{note}</p>}
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-3xl font-bold">+ {inr(result.annual_value)}</div>
          <div className="text-[11px] text-[var(--ink-faint)]">{result.value_basis}/yr</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="rewards" v={`+ ${inr(result.breakdown.rewards_earned)}`} />
        <Stat label="perk value" v={result.breakdown.benefit_value > 0 ? `+ ${inr(result.breakdown.benefit_value)}` : '—'} />
        <Stat label="annual fee" v={result.breakdown.net_fee > 0 ? `– ${inr(result.breakdown.net_fee)}` : '₹ 0'} sev={result.breakdown.net_fee > 0 ? 'red' : undefined} />
        <Stat label="year 1" v={`+ ${inr(result.first_year_value)}`} />
      </div>

      {result.perk_highlights.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {result.perk_highlights.map((p, i) => <span key={i} className="wf-pill info text-[11px]">★ {p}</span>)}
        </div>
      )}

      <div className="mt-4 flex gap-3">
        {result.card.apply_url && (
          <a href={result.card.apply_url} target="_blank" rel="noopener noreferrer" className="wf-btn solid text-xs">apply →</a>
        )}
        <Link href={`/cards/${result.card.slug}`} className="wf-btn text-xs">see full detail</Link>
      </div>
    </div>
  )
}

function Stat({ label, v, sev }: { label: string; v: string; sev?: 'red' }) {
  return (
    <div className="wf-box tint p-2.5">
      <div className="text-[11px] text-[var(--ink-faint)]">{label}</div>
      <div className={`mono text-[15px] font-bold ${sev === 'red' ? 'sev-red' : 'text-[var(--ink)]'}`}>{v}</div>
    </div>
  )
}
