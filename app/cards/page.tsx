import Link from 'next/link'
import { db } from '@/db'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'All credit cards · CardRadar',
  description: 'Browse every credit card CardRadar tracks — fees, rewards, perks and devaluations.',
}

const SEGMENT_ORDER: { key: string; label: string }[] = [
  { key: 'super_premium', label: 'super premium' },
  { key: 'premium', label: 'premium' },
  { key: 'mid', label: 'mid-tier' },
  { key: 'co_branded', label: 'co-branded' },
  { key: 'starter', label: 'starter' },
  { key: 'secured', label: 'secured / no-CIBIL' },
]

export default async function CardsIndex() {
  const allCards = await db.query.cards.findMany({ orderBy: (c, { desc }) => [desc(c.annual_fee)] })

  const bySegment = new Map<string, typeof allCards>()
  for (const c of allCards) {
    const key = c.card_segment ?? 'mid'
    if (!bySegment.has(key)) bySegment.set(key, [])
    bySegment.get(key)!.push(c)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active="cards" />

      <div className="mx-auto w-full max-w-6xl px-5 py-8">
        <div className="mb-6">
          <h1 className="hand text-3xl font-bold">all cards</h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            <span className="mono">{allCards.length}</span> cards tracked across India&apos;s issuers.
          </p>
        </div>

        <div className="space-y-8">
          {SEGMENT_ORDER.filter((s) => bySegment.has(s.key)).map((seg) => (
            <section key={seg.key}>
              <h2 className="mono mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">{seg.label}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bySegment.get(seg.key)!.map((card) => (
                  <Link key={card.id} href={`/cards/${card.slug}`} className="wf-box group p-4 transition-colors hover:bg-[var(--paper-tint)]">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="mono text-[11px] uppercase tracking-wide text-[var(--ink-faint)]">{card.issuer}</span>
                      <span className="wf-pill text-[10px]">{card.network}</span>
                    </div>
                    <div className="font-semibold leading-snug text-[var(--ink)] group-hover:underline">{card.name}</div>
                    <div className="mono mt-2 text-xs text-[var(--ink-soft)]">
                      {card.is_lifetime_free ? 'lifetime free' : card.annual_fee === 0 ? 'no annual fee' : `₹ ${card.annual_fee.toLocaleString('en-IN')}/yr`}
                      {card.is_active === false && <span className="sev-amber"> · closed to new apps</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
