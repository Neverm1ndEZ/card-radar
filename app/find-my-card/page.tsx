'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuizStore } from '@/stores/quiz'
import { SiteHeader } from '@/components/site/SiteHeader'
import type { SpendCategory, SpendProfile, CibilBand, CardPreference } from '@/lib/validators'
import { CIBIL_BANDS, CIBIL_BAND_META, CARD_PREFERENCES, CARD_PREFERENCE_META } from '@/lib/validators'

const STEP_LABELS = ['spends', 'profile', 'preference']
const TOTAL_STEPS = 3

// CIBIL asked as bands (built from the validator metadata, single source of truth).
const CREDIT_BANDS: { value: CibilBand; label: string; sub: string }[] = CIBIL_BANDS.map((b) => ({
  value: b,
  label: CIBIL_BAND_META[b].label,
  sub: CIBIL_BAND_META[b].hint,
}))

const PREF_ICON: Record<CardPreference, string> = {
  cashback: '💵', travel: '✈️', points: '🔄', fuel: '⛽',
  premium: '👑', super_premium: '💎', charge_card: '🧾', all_rounder: '🎯',
}
// Card-type preferences (excluding all_rounder, which is the separate "no preference" button).
const REWARD_PREFS: { value: CardPreference; label: string; sub: string }[] = CARD_PREFERENCES
  .filter((p) => p !== 'all_rounder')
  .map((p) => ({ value: p, label: `${PREF_ICON[p]} ${CARD_PREFERENCE_META[p].label}`, sub: CARD_PREFERENCE_META[p].blurb }))

type PlatformOpt = { key: SpendCategory; label: string }
type SpendField = { macro: SpendCategory; label: string; icon: string; hint?: string; platforms?: PlatformOpt[] }

const SPEND_FIELDS: SpendField[] = [
  {
    macro: 'grocery', label: 'Groceries & supermarkets', icon: '🛒', hint: 'Quick-commerce + supermarkets',
    platforms: [
      { key: 'blinkit', label: 'Blinkit' }, { key: 'zepto', label: 'Zepto' }, { key: 'instamart', label: 'Instamart' },
      { key: 'bigbasket', label: 'BigBasket' }, { key: 'dmart', label: 'DMart' },
    ],
  },
  { macro: 'dining', label: 'Dining & food delivery', icon: '🍽️', platforms: [{ key: 'swiggy', label: 'Swiggy' }, { key: 'zomato', label: 'Zomato' }] },
  { macro: 'shopping', label: 'Online shopping', icon: '🛍️', platforms: [{ key: 'amazon', label: 'Amazon' }, { key: 'flipkart', label: 'Flipkart' }] },
  { macro: 'apparel', label: 'Apparel & fashion', icon: '👗', platforms: [{ key: 'myntra', label: 'Myntra' }, { key: 'nykaa', label: 'Nykaa' }, { key: 'ajio', label: 'AJIO' }] },
  { macro: 'travel', label: 'Travel & hotels', icon: '✈️' },
  { macro: 'international', label: 'International / forex', icon: '🌍', hint: 'Anything billed in foreign currency' },
  { macro: 'fuel', label: 'Fuel', icon: '⛽' },
  { macro: 'movies', label: 'Movies & entertainment', icon: '🎬' },
  { macro: 'subscriptions', label: 'Subscriptions', icon: '📺', hint: 'OTT, music, SaaS — recurring' },
  { macro: 'utilities', label: 'Bills & utilities', icon: '⚡' },
  { macro: 'rent', label: 'Rent', icon: '🏠', hint: 'Most cards earn nothing here' },
  { macro: 'upi', label: 'UPI / wallet loads', icon: '📲', hint: 'Mostly RuPay credit cards' },
  { macro: 'education', label: 'Education / fees', icon: '🎓' },
  { macro: 'insurance', label: 'Insurance premiums', icon: '🛡️' },
]

function CurrencyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState(value > 0 ? String(value) : '')
  useEffect(() => { if (!focused) setRaw(value > 0 ? String(value) : '') }, [value, focused])
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/[^0-9]/g, '')
    setRaw(v)
    onChange(v === '' ? 0 : parseInt(v, 10))
  }
  return (
    <div className="relative flex w-32 items-center">
      <span className="absolute left-3 text-sm text-[var(--ink-faint)] select-none">₹</span>
      <input
        type="text" inputMode="numeric"
        value={focused ? raw : value > 0 ? value.toLocaleString('en-IN') : ''}
        onChange={handleChange}
        onFocus={() => { setFocused(true); setRaw(value > 0 ? String(value) : '') }}
        onBlur={() => setFocused(false)}
        placeholder="0"
        className="mono w-full rounded-lg border-[1.5px] border-[var(--rule)] bg-[var(--paper)] py-2 pl-7 pr-3 text-right text-sm text-[var(--ink)] outline-none focus:bg-white"
      />
    </div>
  )
}

function CategoryRow({ field, spends, onSet }: { field: SpendField; spends: SpendProfile; onSet: (u: Partial<SpendProfile>) => void }) {
  const keys: SpendCategory[] = [field.macro, ...(field.platforms?.map((p) => p.key) ?? [])]
  const activeKey = keys.find((k) => (spends[k] ?? 0) > 0)
  const [platform, setPlatform] = useState<string>(activeKey && activeKey !== field.macro ? activeKey : 'mix')
  const target = (platform === 'mix' ? field.macro : platform) as SpendCategory
  const amount = spends[target] ?? 0
  function zeroAll(): Partial<SpendProfile> { const u: Partial<SpendProfile> = {}; for (const k of keys) u[k] = 0; return u }
  function setAmount(v: number) { onSet({ ...zeroAll(), [target]: v }) }
  function changePlatform(p: string) {
    const carry = amount
    const nt = (p === 'mix' ? field.macro : p) as SpendCategory
    onSet({ ...zeroAll(), [nt]: carry }); setPlatform(p)
  }
  return (
    <div className="wf-box px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="select-none text-lg">{field.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--ink)]">{field.label}</div>
          {field.hint && <div className="text-xs text-[var(--ink-faint)]">{field.hint}</div>}
        </div>
        <CurrencyInput value={amount} onChange={setAmount} />
      </div>
      {field.platforms && amount > 0 && (
        <div className="mt-2.5 flex items-center gap-2 pl-9">
          <span className="text-xs text-[var(--ink-faint)]">mostly</span>
          <select
            value={platform}
            onChange={(e) => changePlatform(e.target.value)}
            className="mono rounded-md border-[1.25px] border-[var(--rule)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink)] outline-none"
          >
            <option value="mix">Mix / not sure</option>
            {field.platforms.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <span className="text-xs text-[var(--ink-faint)]">— only if a card rewards it specifically</span>
        </div>
      )}
    </div>
  )
}

export default function FindMyCard() {
  const router = useRouter()
  const store = useQuizStore()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { useQuizStore.persist.rehydrate(); setHydrated(true) }, [])

  const { step, monthly_spends, annual_income, credit_score_band, reward_preference } = store
  const totalMonthly = Object.values(monthly_spends).reduce((s, v) => s + v, 0)

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--paper-tint)] border-t-[var(--accent)]" />
      </div>
    )
  }

  function handleNext() {
    if (step < TOTAL_STEPS - 1) store.setStep(step + 1)
    else router.push('/results')
  }
  function handleBack() { if (step > 0) store.setStep(step - 1) }
  const canProceed = step === 0 ? totalMonthly > 0 : step === 1 ? annual_income !== undefined : true

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        active="find"
        rightSlot={
          <button onClick={store.reset} className="text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
            start over
          </button>
        }
      />

      <div className="mx-auto grid w-full max-w-4xl flex-1 gap-8 px-5 py-8 md:grid-cols-[200px_1fr]">
        {/* Stepper sidebar */}
        <aside className="hidden flex-col gap-3 md:flex">
          <h2 className="hand text-xl font-bold">find my card</h2>
          <p className="text-xs text-[var(--ink-soft)]">step {step + 1} of {TOTAL_STEPS} · ~ 90 sec</p>
          <div className="mt-2 flex flex-col gap-2.5">
            {STEP_LABELS.map((s, i) => (
              <div key={s} className="flex items-center gap-2.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-[var(--rule)] text-xs ${
                    i < step ? 'bg-[var(--ink)] text-[var(--paper)]' : i === step ? 'bg-[var(--paper)] text-[var(--ink)]' : 'bg-[var(--paper-tint)] text-[var(--ink-faint)]'
                  }`}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`text-sm ${i === step ? 'font-bold text-[var(--ink)]' : 'text-[var(--ink-soft)]'}`}>{s}</span>
              </div>
            ))}
          </div>
          <div className="wf-box tint mt-4 p-3 text-xs text-[var(--ink-soft)]">
            nothing leaves your browser — saved locally until you ask us to.
          </div>
        </aside>

        {/* Step content */}
        <div>
          {step === 0 && (
            <div>
              <h1 className="hand text-3xl font-bold">roughly, what do you spend per month?</h1>
              <p className="mt-1 mb-6 text-sm text-[var(--ink-soft)]">
                estimate by category — month-to-month doesn&apos;t need to be exact. we only ask about a specific app when it changes which card wins.
              </p>
              <div className="mb-5 space-y-2">
                {SPEND_FIELDS.map((f) => <CategoryRow key={f.macro} field={f} spends={monthly_spends} onSet={(u) => store.setMonthlySpends(u)} />)}
              </div>
              {totalMonthly > 0 && (
                <div className="wf-box ink px-4 py-3 text-sm">
                  monthly total · <span className="mono font-bold">{`₹ ${totalMonthly.toLocaleString('en-IN')}`}</span>
                  <span className="text-[var(--paper-tint)] opacity-70"> · ~ ₹ {(totalMonthly * 12).toLocaleString('en-IN')}/yr</span>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              <h1 className="hand text-3xl font-bold">tell us a bit about yourself</h1>
              <p className="mt-1 mb-6 text-sm text-[var(--ink-soft)]">used only to filter out cards you won&apos;t be approved for. nothing stored on our servers.</p>

              <div className="mb-6">
                <div className="mono mb-2 text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">monthly net salary</div>
                <div className="flex items-center gap-3">
                  <div className="relative flex w-44 items-center">
                    <span className="absolute left-3 text-sm text-[var(--ink-faint)] select-none">₹</span>
                    <input
                      type="text" inputMode="numeric"
                      value={annual_income ? Math.round(annual_income / 12).toLocaleString('en-IN') : ''}
                      onChange={(e) => {
                        const m = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10)
                        store.setAnnualIncome(Number.isNaN(m) ? undefined : m * 12)
                      }}
                      placeholder="e.g. 75,000"
                      className="mono w-full rounded-lg border-[1.5px] border-[var(--rule)] bg-[var(--paper)] py-2.5 pl-7 pr-3 text-right text-sm text-[var(--ink)] outline-none focus:bg-white"
                    />
                  </div>
                  <span className="text-xs text-[var(--ink-faint)]">
                    {annual_income ? `≈ ₹${annual_income.toLocaleString('en-IN')}/yr` : 'exact figure → precise eligibility'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--ink-faint)]">We use your exact salary to filter cards you actually qualify for (e.g. some issuers need ₹50k+/month).</p>
              </div>

              <div className="mb-6">
                <div className="mono mb-2 text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">CIBIL / credit score</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CREDIT_BANDS.map((band) => (
                    <button
                      key={band.value}
                      onClick={() => store.setCreditScoreBand(band.value)}
                      className={`wf-box px-3 py-2.5 text-left ${credit_score_band === band.value ? 'ink' : ''}`}
                    >
                      <div className="text-sm font-medium">{band.label}</div>
                      <div className={`mt-0.5 text-xs ${credit_score_band === band.value ? 'text-[var(--paper-tint)] opacity-80' : 'text-[var(--ink-faint)]'}`}>{band.sub}</div>
                    </button>
                  ))}
                </div>
                {credit_score_band === 'no_cibil' && (
                  <div className="wf-box mt-3 px-4 py-3 text-sm" style={{ background: '#f6e7c8', borderColor: 'var(--warn)', color: 'var(--warn)' }}>
                    We&apos;ll show you FD-backed secured cards — the safest way to build CIBIL from scratch.
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="hand text-3xl font-bold">what matters most to you?</h1>
              <p className="mt-1 mb-6 text-sm text-[var(--ink-soft)]">optional — skip and we&apos;ll rank by best overall value. pick one to break ties between cards worth roughly the same.</p>

              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {REWARD_PREFS.map((pref) => (
                  <button
                    key={pref.value}
                    onClick={() => store.setRewardPreference(pref.value)}
                    className={`wf-box p-4 text-left ${reward_preference === pref.value ? 'ink' : ''}`}
                  >
                    <div className="text-sm font-semibold">{pref.label}</div>
                    <div className={`mt-0.5 text-xs ${reward_preference === pref.value ? 'text-[var(--paper-tint)] opacity-80' : 'text-[var(--ink-faint)]'}`}>{pref.sub}</div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => store.setRewardPreference(undefined)}
                className={`wf-box mb-6 w-full p-4 text-left ${reward_preference === undefined ? 'ink' : ''}`}
              >
                <div className="text-sm font-semibold">🎯 No preference — best all-rounder</div>
                <div className={`mt-0.5 text-xs ${reward_preference === undefined ? 'text-[var(--paper-tint)] opacity-80' : 'text-[var(--ink-faint)]'}`}>
                  Rank purely by overall value, like an everyday do-it-all card
                </div>
              </button>

              <label className="wf-box flex cursor-pointer items-center gap-3 p-4">
                <input
                  type="checkbox"
                  checked={store.exclude_invite_only}
                  onChange={(e) => store.setExcludeInviteOnly(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <div>
                  <div className="text-sm font-medium text-[var(--ink)]">Exclude invite-only cards</div>
                  <div className="text-xs text-[var(--ink-faint)]">Hide cards that require an existing banking relationship</div>
                </div>
              </label>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? (
              <button onClick={handleBack} className="wf-btn">← back</button>
            ) : <span />}
            <button onClick={handleNext} disabled={!canProceed} className="wf-btn solid disabled:opacity-40">
              {step === TOTAL_STEPS - 1 ? 'see my cards →' : 'continue →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
