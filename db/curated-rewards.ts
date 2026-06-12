/**
 * CURATED REWARD OVERRIDE LAYER (added 2026-06-06).
 *
 * The catalog scraper gives broad coverage (~302 cards) but is unreliable on exactly
 * the things that decide a recommendation: accelerated category rates, monthly CAPS
 * (usually shared across categories, buried in fine print), portal multipliers
 * (SmartBuy/Gyftr live on a different page), and CPP. Those errors concentrate in the
 * ~30 flagship cards that almost every recommendation surfaces.
 *
 * This file is the hand-verified source of truth for those cards. It is applied AFTER
 * the scraper promotes (scripts/db/apply-curated.ts), is keyed by the *scraped* slug,
 * and owns ONLY the reward fields (base rate, category rates, accelerators, CPP) for
 * the cards it lists. Everything else (fees, eligibility, benefits, the other ~270
 * cards) stays scraper-driven.
 *
 * Slugs verified against the live DB on 2026-06-06.
 */

import type { SpendCategory } from '../lib/validators'

// ── CPP: ₹ value of one reward unit ──────────────────────────────────────────
// Reward-program value is hopelessly ambiguous from the currency string alone
// ("Reward Points" = HDFC 0.30 / ICICI 0.25 / SBI 0.25). So the engine resolves CPP
// by (issuer, reward-class) with an optional per-card override below. Cash-like
// currencies are always ₹1 and handled in the engine. Classes: 'points' | 'travel'.
export const ISSUER_CPP: Record<string, Partial<Record<'points' | 'travel', number>>> = {
  HDFC: { points: 0.50, travel: 0.50 },
  Axis: { points: 0.20, travel: 0.80 }, // EDGE points weak; EDGE Miles strong via partners
  ICICI: { points: 0.25, travel: 0.50 },
  SBI: { points: 0.25, travel: 0.50 },
  Amex: { points: 0.50, travel: 0.50 },
  HSBC: { points: 0.25, travel: 0.50 },
  Kotak: { points: 0.25, travel: 0.50 },
  'IDFC FIRST': { points: 0.25, travel: 0.50 },
  IndusInd: { points: 0.25, travel: 0.50 },
  RBL: { points: 0.25, travel: 0.50 },
  'Bank of Baroda': { points: 0.25 },
  'Federal Bank': { points: 0.20 },
  AU: { points: 0.25 },
  Canara: { points: 0.25 },
  'Standard Chartered': { points: 0.25 },
  YES: { points: 0.25, travel: 0.50 },
}

// Conservative fallback CPP by class when the issuer isn't in the table above.
export const CLASS_CPP_FALLBACK: Record<'cashback' | 'travel' | 'points', number> = {
  cashback: 1.0,
  travel: 0.50,
  points: 0.25,
}

export type RateKind = 'cashback_pct' | 'value_back_pct' | 'points_per_100'

export type CuratedRate = {
  category: SpendCategory
  rate: number
  kind: RateKind
  /** ₹ monthly reward ceiling for THIS row (ignored if cap_group is set). */
  cap?: number
  /** Rows sharing a cap_group share ONE monthly ₹ ceiling (set `cap` on each row to that pool). */
  cap_group?: string
  min_txn?: number
  note?: string
}

export type CuratedAccelerator = {
  label: string
  channel?: string
  applies_to: SpendCategory[]
  multiplier?: number
  effective_rate_pct?: number
  monthly_cap?: number
  condition_note?: string
}

export type CuratedCard = {
  slug: string
  /** Override base_earn_rate on the cards row (per ₹100; for points cards this is points/₹100). */
  base?: number
  /** Per-card CPP override (₹ per reward unit). Used to value base + points_per_100 rates. */
  cpp?: number
  rates?: CuratedRate[]
  accelerators?: CuratedAccelerator[]
}

// Convenience: the set of online categories SBI Cashback (and similar "5% online" cards)
// reward at the accelerated rate. Grocery/DMart-offline and fuel/rent/wallet are excluded.
const ONLINE_CATS: SpendCategory[] = [
  'amazon', 'flipkart', 'myntra', 'nykaa', 'ajio', 'zomato', 'swiggy',
  'instamart', 'blinkit', 'zepto', 'shopping', 'apparel', 'subscriptions',
]

export const CURATED_CARDS: CuratedCard[] = [
  // ─────────────────────────── CASHBACK FIXES ────────────────────────────────
  {
    // FIX: scraper grabbed the 1% OFFLINE line and missed the headline 5% online.
    // Real: 5% on all online spends, ₹5,000/mo combined cap; 1% offline (base).
    slug: 'sbi-cashback',
    base: 1, // offline
    rates: ONLINE_CATS.map((c) => ({
      category: c,
      rate: 5,
      kind: 'cashback_pct' as const,
      cap: 5000,
      cap_group: 'sbi_cb_online',
      note: '5% on online spends (₹5,000/mo combined cap); 1% offline.',
    })),
  },
  {
    // FIX: 10% on dining + groceries + food delivery is ONE shared ₹1,000/mo cap,
    // not ₹1,000 per category. 1.5% on everything else (base).
    slug: 'hsbc-live',
    base: 1.5,
    rates: ['dining', 'grocery', 'swiggy', 'zomato', 'blinkit', 'zepto', 'instamart', 'bigbasket'].map(
      (c) => ({
        category: c as SpendCategory,
        rate: 10,
        kind: 'cashback_pct' as const,
        cap: 1000,
        cap_group: 'hsbc_live_10',
        note: '10% on dining, food delivery & groceries — single ₹1,000/mo combined cap.',
      })
    ),
  },
  {
    // FIX: missing cap → uncapped 10% dominated. Apply a single ₹400/mo combined cap.
    slug: 'hsbc-rupay-cashback',
    base: 1,
    rates: ['dining', 'grocery', 'swiggy', 'zomato'].map((c) => ({
      category: c as SpendCategory,
      rate: 10,
      kind: 'cashback_pct' as const,
      cap: 400,
      cap_group: 'hsbc_rupay_cb',
      note: '10% on dining/food-delivery/grocery — single ₹400/mo combined cap.',
    })),
  },
  {
    // HDFC Millennia: 5% CashPoints on Amazon/Flipkart/Myntra/Swiggy/Zomato/Cult etc.,
    // 1,000 CashPoints/mo combined cap (CashPoints = ₹1). 1% base.
    slug: 'hdfc-millennia',
    base: 1,
    cpp: 1.0,
    rates: ['amazon', 'flipkart', 'myntra', 'swiggy', 'zomato', 'nykaa', 'ajio'].map((c) => ({
      category: c as SpendCategory,
      rate: 5,
      kind: 'cashback_pct' as const,
      cap: 1000,
      cap_group: 'millennia_5',
      note: '5% on 10 partner merchants — 1,000 CashPoints/mo combined cap.',
    })),
  },
  {
    // HDFC Swiggy: 10% on Swiggy app (food, Instamart, Dineout), 5% on other online,
    // 1% offline. 10% capped ~₹1,500/mo for the BLCK tier.
    slug: 'hdfc-swiggy-blck',
    base: 1,
    cpp: 1.0,
    rates: [
      { category: 'swiggy', rate: 10, kind: 'cashback_pct', cap: 1500, cap_group: 'swiggy_blck_10' },
      { category: 'instamart', rate: 10, kind: 'cashback_pct', cap: 1500, cap_group: 'swiggy_blck_10' },
      { category: 'shopping', rate: 5, kind: 'cashback_pct' },
      { category: 'dining', rate: 5, kind: 'cashback_pct' },
    ],
  },
  {
    // Axis ACE: 5% bills/recharges via Google Pay (₹500/mo cap), 4% Swiggy/Zomato/Ola,
    // 1.5% base.
    slug: 'axis-ace',
    base: 1.5,
    rates: [
      { category: 'utilities', rate: 5, kind: 'cashback_pct', cap: 500, cap_group: 'ace_gpay', note: '5% on bills/recharges via Google Pay (₹500/mo cap).' },
      { category: 'insurance', rate: 5, kind: 'cashback_pct', cap: 500, cap_group: 'ace_gpay' },
      { category: 'swiggy', rate: 4, kind: 'cashback_pct' },
      { category: 'zomato', rate: 4, kind: 'cashback_pct' },
    ],
  },
  {
    // Flipkart Axis: 5% Flipkart/Myntra/Cleartrip, 4% preferred (Swiggy/PVR/Uber/cult),
    // 1.5% base. No hard monthly cap on the accelerated tiers.
    slug: 'axis-flipkart',
    base: 1.5,
    rates: [
      { category: 'flipkart', rate: 5, kind: 'cashback_pct' },
      { category: 'myntra', rate: 5, kind: 'cashback_pct' },
      { category: 'swiggy', rate: 4, kind: 'cashback_pct' },
    ],
  },
  {
    // Amazon Pay ICICI: 5% on Amazon (Prime), 2% on partner merchants, 1% rest.
    // Amazon Pay balance = ₹1. No annual fee, no cap.
    slug: 'icici-amazon-pay',
    base: 1,
    cpp: 1.0,
    rates: [
      { category: 'amazon', rate: 5, kind: 'cashback_pct', note: '5% for Prime members on Amazon.in.' },
    ],
  },
  {
    // IDFC FIRST Hello/Wealth-style: keep scraped 3% online cap ₹1,000 but pin currency=cash.
    slug: 'idfc-first-hello-cashback',
    base: 1,
    cpp: 1.0,
    rates: [
      { category: 'shopping', rate: 3, kind: 'cashback_pct', cap: 1000, cap_group: 'idfc_hello_online' },
      { category: 'amazon', rate: 3, kind: 'cashback_pct', cap: 1000, cap_group: 'idfc_hello_online' },
      { category: 'flipkart', rate: 3, kind: 'cashback_pct', cap: 1000, cap_group: 'idfc_hello_online' },
    ],
  },

  // ─────────────────── POINTS / PORTAL (PILLAR 2) ────────────────────────────
  {
    // HDFC Infinia: 3.33 RP/₹100 base (5 RP/₹150). At SmartBuy redemption ~₹1/RP →
    // 3.33% base; SmartBuy 10X on flights & hotels → ~33% (capped ~15k RP/mo).
    slug: 'hdfc-infinia',
    base: 3.33,
    cpp: 1.0,
    rates: [
      { category: 'travel', rate: 33.3, kind: 'value_back_pct', cap: 15000, note: 'SmartBuy 10X on flights & hotels (≈33% value-back), ~15k RP/mo cap. Reverts to 3.33% beyond cap.' },
    ],
    accelerators: [
      { label: 'SmartBuy 10X — Flights & Hotels', channel: 'SmartBuy', applies_to: ['travel'], multiplier: 10, effective_rate_pct: 33.3, monthly_cap: 15000, condition_note: 'Book via HDFC SmartBuy; ~15,000 RP/mo cap on the 10X bonus.' },
      { label: '2X on weekend dining', channel: 'Swiggy Dineout', applies_to: ['dining'], effective_rate_pct: 6.66 },
    ],
  },
  {
    // HDFC Diners Club Black: same 3.33 RP/₹100 base, SmartBuy 10X, 2X weekend dining,
    // plus strong unlimited-lounge / golf perks (handled by benefits).
    slug: 'hdfc-diners-club-black-metal',
    base: 3.33,
    cpp: 1.0,
    rates: [
      { category: 'travel', rate: 33.3, kind: 'value_back_pct', cap: 15000, note: 'SmartBuy 10X on flights & hotels (≈33%).' },
    ],
    accelerators: [
      { label: 'SmartBuy 10X — Flights & Hotels', channel: 'SmartBuy', applies_to: ['travel'], multiplier: 10, effective_rate_pct: 33.3, monthly_cap: 15000 },
      { label: '2X weekend dining', applies_to: ['dining'], effective_rate_pct: 6.66 },
    ],
  },
  {
    // HDFC Regalia Gold: ~2.67 RP/₹100 base (4 RP/₹150), 5X on Myntra/Marks&Spencer/
    // Nykaa/Reliance Digital, SmartBuy accelerated travel. CPP ~₹0.50 blended.
    slug: 'hdfc-regalia-gold',
    base: 2.67,
    cpp: 0.5,
    rates: [
      { category: 'myntra', rate: 6.67, kind: 'value_back_pct' },
      { category: 'nykaa', rate: 6.67, kind: 'value_back_pct' },
      { category: 'apparel', rate: 6.67, kind: 'value_back_pct' },
    ],
    accelerators: [
      { label: '5X on Myntra, Nykaa, Marks & Spencer, Reliance Digital', applies_to: ['myntra', 'nykaa', 'apparel'], multiplier: 5, effective_rate_pct: 6.67 },
      { label: 'SmartBuy accelerated flights & hotels', channel: 'SmartBuy', applies_to: ['travel'], effective_rate_pct: 6.67 },
    ],
  },
  {
    // ICICI Emeralde Private Metal: 6 RP/₹200 = 3 RP/₹100 base; ₹1/RP on iShop flights/
    // hotels & for many redemptions → CPP ~0.50. Strong on most spends incl. utilities/insurance.
    slug: 'icici-emeralde-private-metal',
    base: 3,
    cpp: 0.5,
    accelerators: [
      { label: 'iShop accelerated rewards', channel: 'ICICI iShop', applies_to: ['travel', 'shopping'], effective_rate_pct: 6 },
    ],
  },
  {
    // ICICI Sapphiro: 2 RP/₹100 base; 6X on international, 4X on retail/dining for the tier.
    slug: 'icici-sapphiro',
    base: 2,
    cpp: 0.4,
    rates: [
      { category: 'international', rate: 4, kind: 'value_back_pct' },
    ],
  },
  {
    // Axis Atlas: 2 EDGE Miles/₹100 base, 5 EM/₹100 on travel (Travel EDGE). EDGE Miles
    // ~₹0.80 via partners. NOTE: closed to new applications + lost Accor/Marriott/Qatar
    // (see reference-data changelog) — is_active handled separately.
    slug: 'axis-atlas',
    base: 2,
    cpp: 0.8,
    rates: [
      { category: 'travel', rate: 5, kind: 'points_per_100', note: '5 EDGE Miles/₹100 on direct travel (airlines/hotels/Travel EDGE).' },
      { category: 'international', rate: 5, kind: 'points_per_100' },
    ],
    accelerators: [
      { label: '5 EDGE Miles/₹100 on travel', channel: 'Travel EDGE', applies_to: ['travel', 'international'], effective_rate_pct: 4 },
    ],
  },
  {
    // Axis Magnus: legacy super-premium. EDGE points weak (~₹0.20); milestone removed
    // (2023). Travel via Travel EDGE.
    slug: 'axis-magnus',
    base: 1.2,
    cpp: 0.2,
    rates: [
      { category: 'travel', rate: 6, kind: 'points_per_100' },
    ],
  },
  {
    // Axis Reserve: 7.5 EDGE points/₹100 base but weak CPP; strong perks-led card.
    slug: 'axis-reserve',
    base: 7.5,
    cpp: 0.2,
  },
  {
    // Amex Gold Charge: 2 MR/₹100 base; 18,000 MR Gold Collection milestone; MR ≈ ₹0.50.
    slug: 'amex-gold',
    base: 2,
    cpp: 0.5,
  },
  {
    // Amex Membership Rewards (MRCC): 1 MR/₹50 ≈ 2 MR/₹100 on most; 1,000-point milestones.
    slug: 'amex-membership-rewards',
    base: 2,
    cpp: 0.5,
  },
  {
    // Amex Platinum Reserve: 2 MR/₹100; strong dining/lounge perks.
    slug: 'amex-platinum-reserve',
    base: 2,
    cpp: 0.5,
  },
  {
    // Tata Neu Infinity SBI: 5% NeuCoins on Tata Neu / Tata brands, 1.5% other UPI.
    // NeuCoin = ₹1.
    slug: 'sbi-tata-neu-infinity',
    base: 1.5,
    cpp: 1.0,
    rates: [
      { category: 'shopping', rate: 5, kind: 'value_back_pct', note: '5% NeuCoins on Tata Neu & partner brands.' },
    ],
  },
  {
    // Tata Neu Plus HDFC: 2% NeuCoins on Tata Neu, 1% other. NeuCoin = ₹1.
    slug: 'hdfc-tata-neu-plus',
    base: 1,
    cpp: 1.0,
    rates: [
      { category: 'shopping', rate: 2, kind: 'value_back_pct' },
    ],
  },
  {
    // SBI Air India Signature: 4 RP/₹100 base, accelerated on Air India bookings.
    slug: 'sbi-air-india-signature',
    base: 4,
    cpp: 0.5,
  },
  {
    // SBI Prime: 2 RP/₹100 base, 10X on dining/groceries/movies/departmental.
    slug: 'sbi-prime',
    base: 2,
    cpp: 0.25,
    rates: [
      { category: 'dining', rate: 5, kind: 'value_back_pct' },
      { category: 'movies', rate: 5, kind: 'value_back_pct' },
      { category: 'grocery', rate: 5, kind: 'value_back_pct' },
    ],
  },
  {
    // SBI BPCL Octane: fuel hero — 25 RP/₹100 (≈7.25%) at BPCL, 10X on dining/groceries/
    // departmental/movies.
    slug: 'sbi-bpcl-octane',
    base: 1,
    cpp: 0.25,
    rates: [
      { category: 'fuel', rate: 7.25, kind: 'value_back_pct', cap: 2500, note: '25 RP/₹100 (~7.25%) at BPCL outlets, capped ~₹2,500/mo.' },
    ],
    accelerators: [
      { label: '7.25% value-back at BPCL fuel', applies_to: ['fuel'], effective_rate_pct: 7.25, monthly_cap: 2500 },
    ],
  },
  {
    // SBI SimplyCLICK: 10X on online partners (Amazon/BookMyShow/Cleartrip etc.), 5X other online.
    slug: 'sbi-simplyclick',
    base: 0.25,
    cpp: 0.25,
    rates: [
      { category: 'amazon', rate: 2.5, kind: 'value_back_pct' },
      { category: 'shopping', rate: 1.25, kind: 'value_back_pct' },
    ],
  },
  {
    // Axis Cashback: 5% on online spends, capped ₹1,000/mo; 1% offline.
    slug: 'axis-cashback',
    base: 1,
    rates: ['amazon', 'flipkart', 'myntra', 'shopping', 'swiggy', 'zomato'].map((c) => ({
      category: c as SpendCategory,
      rate: 5,
      kind: 'cashback_pct' as const,
      cap: 1000,
      cap_group: 'axis_cb_online',
    })),
  },
  {
    // IndianOil Kotak / Axis-style fuel: keep fuel hero rate. (Kotak IOC 5%.)
    slug: 'kotak-indianoil',
    base: 0.5,
    cpp: 1.0,
    rates: [
      { category: 'fuel', rate: 5, kind: 'value_back_pct', cap: 2500, note: '5% value-back at IndianOil outlets.' },
    ],
  },
  {
    // HDFC Diners Club Privilege: 2x on Swiggy/Zomato/etc; mid-tier.
    slug: 'hdfc-diners-club-privilege',
    base: 2,
    cpp: 0.5,
    rates: [
      { category: 'swiggy', rate: 5, kind: 'value_back_pct' },
      { category: 'zomato', rate: 5, kind: 'value_back_pct' },
    ],
  },
  {
    // Axis Horizon: travel card, 5 EDGE Miles/₹100 on direct airline/Axis Travel.
    slug: 'axis-horizon',
    base: 2,
    cpp: 0.8,
    rates: [
      { category: 'travel', rate: 5, kind: 'points_per_100' },
      { category: 'international', rate: 5, kind: 'points_per_100' },
    ],
  },
  {
    // SBI SimplySAVE: 10X on dining/movies/groceries/department stores.
    slug: 'sbi-simplysave',
    base: 0.25,
    cpp: 0.25,
    rates: [
      { category: 'dining', rate: 2.5, kind: 'value_back_pct' },
      { category: 'movies', rate: 2.5, kind: 'value_back_pct' },
      { category: 'grocery', rate: 2.5, kind: 'value_back_pct' },
    ],
  },
]

export const CURATED_SLUGS = new Set(CURATED_CARDS.map((c) => c.slug))

// Per-card CPP overrides, consumed by the recommendation engine to value base rate
// and any points_per_100 rates. (CPP isn't a DB column — it's valuation config.)
export const CURATED_CPP_BY_SLUG: Record<string, number> = Object.fromEntries(
  CURATED_CARDS.filter((c) => c.cpp != null).map((c) => [c.slug, c.cpp as number])
)

// Maps the old reference-data seed slugs to the live scraped slugs.
export const SEED_SLUG_REMAP: Record<string, string> = {
  'hdfc-infinia-metal': 'hdfc-infinia',
  'amex-platinum-charge': 'amex-platinum-reserve',
}
