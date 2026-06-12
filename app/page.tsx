import Link from 'next/link'
import { SiteHeader } from '@/components/site/SiteHeader'
import { RadarScope } from '@/components/site/RadarScope'

const TICKER = [
  { sev: 'sev-red', glyph: '▼', text: 'Magnus · transfer ratio 1:1 → 5:2' },
  { sev: 'sev-red', glyph: '▼', text: 'Infinia · insurance capped at 10k RP/mo' },
  { sev: 'sev-amber', glyph: '⚠', text: 'Atlas · paused for new applications' },
  { sev: 'sev-green', glyph: '▲', text: 'Mayura · added trip-cancel cover' },
]

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active="home" />

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 py-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-5">
          <span className="wf-pill self-start">
            <span className="sev-red">●</span> 3 devaluations this week
          </span>
          <h1 className="hand text-5xl font-bold leading-[0.95] text-[var(--ink)] sm:text-6xl">
            see what&apos;s<br />changing before<br />it hits your wallet.
          </h1>
          <p className="max-w-md text-[17px] leading-relaxed text-[var(--ink-soft)]">
            India&apos;s credit-card intelligence — track rewards, detect devaluations,
            and find your best card against how you actually spend.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href="/find-my-card" className="wf-btn solid">find my best card →</Link>
            <Link href="/cards" className="wf-btn">browse 70+ cards</Link>
          </div>
          <p className="mono mt-1 text-[12px] text-[var(--ink-faint)]">no signup · no affiliate bias · free</p>
        </div>

        <div className="flex items-center justify-center">
          <RadarScope size={380} />
        </div>
      </section>

      {/* Devaluation ticker */}
      <div className="rule-b border-t-[1.5px] border-t-[var(--rule)] bg-[var(--paper-tint)]">
        <div className="mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-6 py-2.5 text-[13px]">
          <span className="hand shrink-0 text-[15px] font-bold">RADAR ›</span>
          {TICKER.map((t, i) => (
            <span key={i} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <span className={t.sev}>{t.glyph}</span> {t.text}
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="hand mb-1 text-2xl font-bold">how it works</h2>
        <p className="mb-8 text-sm text-[var(--ink-soft)]">two minutes · no account · nothing leaves your browser</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { n: '1', t: 'your spends', d: 'rough monthly amounts by category — groceries, dining, travel, bills.' },
            { n: '2', t: 'your profile', d: 'income band + credit score, so we only show cards you can actually get.' },
            { n: '3', t: 'your matches', d: 'best-for-you picks, grouped by cashback, miles, all-rounders & perks.' },
          ].map((s) => (
            <div key={s.n} className="wf-box p-5">
              <div className="mono flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[var(--rule)] text-sm font-bold">
                {s.n}
              </div>
              <h3 className="hand mt-3 text-lg font-bold">{s.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <h2 className="hand mb-8 text-2xl font-bold">not just another comparison table</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { icon: '◎', t: 'matched to how you spend', d: 'each card scored by real rupee value against your monthly spend — not a generic list.' },
            { icon: '✓', t: 'only cards you’ll get', d: 'filters by income and credit, so a ₹30L super-premium card never shows for a first salary.' },
            { icon: '₹', t: 'points valued how you redeem', d: 'a travel optimiser and a cashback user get different answers — we value points accordingly.' },
            { icon: '∆', t: 'devaluation aware', d: 'cards get quietly nerfed; we track benefit changes and flag the ones that hit your picks.' },
          ].map((f) => (
            <div key={f.t} className="wf-box p-5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{f.icon}</span>
                <h3 className="hand text-lg font-bold">{f.t}</h3>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="wf-box ink flex flex-col items-center gap-4 px-8 py-12 text-center">
          <h2 className="hand text-3xl font-bold">know your cards. own your rewards.</h2>
          <p className="text-sm text-[var(--paper-tint)] opacity-80">takes 2 minutes · no account required</p>
          <Link href="/find-my-card" className="wf-btn mt-1 bg-[var(--paper)] text-[var(--ink)]">
            get my recommendations →
          </Link>
        </div>
      </section>

      <footer className="rule-b border-t-[1.5px] border-t-[var(--rule)] py-6">
        <div className="mx-auto max-w-6xl px-6 text-center text-xs text-[var(--ink-faint)]">
          CardRadar is independent · affiliate links are disclosed and never bias rankings.
        </div>
      </footer>
    </div>
  )
}
