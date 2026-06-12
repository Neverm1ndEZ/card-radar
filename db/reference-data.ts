/**
 * Curated REFERENCE DATA salvaged from the former db/seed.ts (deleted 2026-06-05).
 *
 * The catalog scraper (scripts/scrapers/catalog) now owns cards / category_rates /
 * benefits / changelog. But it does NOT capture the data below, which the
 * recommendation engine + card evaluator read:
 *   - PROGRAM_CPP / program_valuations:  -> ₹ value per point (CPP).
 *     Required to convert points/accelerated multipliers into a % reward rate.
 *   - TRANSFER_PARTNER_SEEDS: airline/hotel transfer partners (miles realization).
 *   - RESTRICTION_SEEDS: card-to-card eligibility restrictions.
 *   - CATEGORY_CAPS: per-card monthly ₹ earn caps per category.
 *   - CHANGELOG_SEEDS: curated historical devaluations (optional / health score).
 *
 * NOTE: slugs here are the OLD seed slugs and may differ from scraped slugs
 * (e.g. 'hdfc-infinia-metal' vs scraped 'hdfc-infinia') — reconcile before insert.
 * This is data only: no DB clear/insert logic (the old seeder's clear-step would
 * have wiped the scraped cards).
 */

const PROGRAM_CPP: Record<string, number> = {
  'HDFC Reward Points': 0.35,
  'EDGE Miles': 0.25,
  'Amex Membership Rewards': 0.50,
  'Direct Cashback': 1.00,
  'Amazon Pay Balance': 1.00,
  'ICICI Reward Points': 0.25,
  'PAYBACK Points': 0.25,
  'SBI Reward Points': 0.25,
  'FIRST Reward Points': 0.25,
  'Air India Miles': 0.45,
  'Yes Rewardz Points': 0.25,
  'SC Reward Points': 0.25,
  'NeuCoins': 1.00,  // 1 NeuCoin = ₹1 on Tata ecosystem
  'Club Vistara Points': 0.40,
  'IndusMoments Points': 0.25,
  'Kotak Reward Points': 0.25,
  'RBL Reward Points': 0.25,
  'Federal Reward Points': 0.25,
  'AU Reward Points': 0.25,
  'Axis EDGE Rewards': 0.20,
}

type TransferPartnerSeed = {
  card_slug: string
  program_name: string
  program_type: string
  transfer_ratio: number
  min_transfer?: number
  transfer_increments?: number
  is_active: boolean
  notes?: string
}

const TRANSFER_PARTNER_SEEDS: TransferPartnerSeed[] = [
  // ── Axis Magnus ─────────────────────────────────────────────────────────
  { card_slug: 'axis-magnus', program_name: 'Singapore Airlines KrisFlyer', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-magnus', program_name: 'Air France/KLM Flying Blue', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-magnus', program_name: 'Etihad Guest', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-magnus', program_name: 'British Airways Avios', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-magnus', program_name: 'Turkish Airlines Miles&Smiles', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-magnus', program_name: 'Air India Flying Returns', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-magnus', program_name: 'IndiGo 6E Rewards', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-magnus', program_name: 'Qatar Airways Privilege Club', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  // ── Axis Atlas ──────────────────────────────────────────────────────────
  { card_slug: 'axis-atlas', program_name: 'Singapore Airlines KrisFlyer', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-atlas', program_name: 'Air France/KLM Flying Blue', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-atlas', program_name: 'Etihad Guest', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-atlas', program_name: 'British Airways Avios', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-atlas', program_name: 'Air India Flying Returns', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'axis-atlas', program_name: 'IndiGo 6E Rewards', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  // REMOVED partners (is_active: false — critical for the Atlas education story)
  { card_slug: 'axis-atlas', program_name: 'Accor Live Limitless (ALL)', program_type: 'hotel', transfer_ratio: 1.0, is_active: false, notes: 'Removed as transfer partner in early 2026. Previously enabled 8%+ return on education/other spends via hotel redemptions.' },
  { card_slug: 'axis-atlas', program_name: 'Marriott Bonvoy', program_type: 'hotel', transfer_ratio: 1.0, is_active: false, notes: 'Removed as transfer partner in early 2026.' },
  { card_slug: 'axis-atlas', program_name: 'Qatar Airways Privilege Club', program_type: 'airline', transfer_ratio: 1.0, is_active: false, notes: 'Removed as transfer partner in early 2026.' },
  // ── HDFC Infinia ─────────────────────────────────────────────────────────
  { card_slug: 'hdfc-infinia-metal', program_name: 'Singapore Airlines KrisFlyer', program_type: 'airline', transfer_ratio: 0.5, is_active: true, notes: '2 HDFC RP = 1 KrisFlyer mile' },
  { card_slug: 'hdfc-infinia-metal', program_name: 'Air France/KLM Flying Blue', program_type: 'airline', transfer_ratio: 0.5, is_active: true },
  { card_slug: 'hdfc-infinia-metal', program_name: 'Etihad Guest', program_type: 'airline', transfer_ratio: 0.5, is_active: true },
  { card_slug: 'hdfc-infinia-metal', program_name: 'British Airways Avios', program_type: 'airline', transfer_ratio: 0.5, is_active: true },
  { card_slug: 'hdfc-infinia-metal', program_name: 'Marriott Bonvoy', program_type: 'hotel', transfer_ratio: 0.5, is_active: true },
  { card_slug: 'hdfc-infinia-metal', program_name: 'Air India Flying Returns', program_type: 'airline', transfer_ratio: 0.5, is_active: true },
  // ── Amex Platinum Charge ─────────────────────────────────────────────────
  { card_slug: 'amex-platinum-charge', program_name: 'Singapore Airlines KrisFlyer', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'amex-platinum-charge', program_name: 'Air France/KLM Flying Blue', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'amex-platinum-charge', program_name: 'Etihad Guest', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'amex-platinum-charge', program_name: 'British Airways Avios', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'amex-platinum-charge', program_name: 'Marriott Bonvoy', program_type: 'hotel', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'amex-platinum-charge', program_name: 'Hilton Honors', program_type: 'hotel', transfer_ratio: 1.0, is_active: true },
  { card_slug: 'amex-platinum-charge', program_name: 'Air India Flying Returns', program_type: 'airline', transfer_ratio: 1.0, is_active: true },
  // ── HDFC Diners Black ────────────────────────────────────────────────────
  { card_slug: 'hdfc-diners-club-black-metal', program_name: 'Singapore Airlines KrisFlyer', program_type: 'airline', transfer_ratio: 0.5, is_active: true },
  { card_slug: 'hdfc-diners-club-black-metal', program_name: 'Club Vistara', program_type: 'airline', transfer_ratio: 0.5, is_active: true },
  { card_slug: 'hdfc-diners-club-black-metal', program_name: 'Air India Flying Returns', program_type: 'airline', transfer_ratio: 0.5, is_active: true },
]

type ChangelogSeed = {
  card_slug: string
  change_type: string
  field_changed: string
  old_value?: unknown
  new_value?: unknown
  effective_date: string
  source_url?: string
  source_type: string
  confidence: number
  summary: string
  is_published: boolean
}

const CHANGELOG_SEEDS: ChangelogSeed[] = [
  {
    card_slug: 'axis-magnus',
    change_type: 'milestone_removed',
    field_changed: 'benefits.milestone_bonus',
    old_value: 'Free 25,000 EDGE Miles on ₹15L quarterly spend',
    new_value: null,
    effective_date: '2023-09-01',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'Magnus 25k quarterly milestone removed (Sep 2023). Annual fee also hiked from ₹10,000 to ₹12,500.',
    is_published: true,
  },
  {
    card_slug: 'axis-magnus',
    change_type: 'fee_increase',
    field_changed: 'annual_fee',
    old_value: 10000,
    new_value: 12500,
    effective_date: '2023-09-01',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'Annual fee increased from ₹10,000 to ₹12,500 with the Sep 2023 devaluation.',
    is_published: true,
  },
  {
    card_slug: 'hdfc-regalia-gold',
    change_type: 'lounge_cutback',
    field_changed: 'benefits.lounge_access',
    old_value: 'Unlimited domestic + international',
    new_value: 'Requires ₹1L spend per quarter to qualify',
    effective_date: '2023-12-01',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'Regalia Gold lounge access now gated behind ₹1L quarterly spend (Dec 2023). Was previously unlimited.',
    is_published: true,
  },
  {
    card_slug: 'hdfc-infinia-metal',
    change_type: 'benefit_removed',
    field_changed: 'benefits.insurance_earn_cap',
    old_value: 'Unlimited RP on insurance',
    new_value: 'Capped at 10,000 RP per month on insurance',
    effective_date: '2026-01-01',
    source_type: 'community',
    confidence: 0.95,
    summary: 'Infinia insurance earn capped at 10k RP/month from Jan 2026. High insurance spenders hit.',
    is_published: true,
  },
  {
    card_slug: 'hdfc-infinia-metal',
    change_type: 'benefit_removed',
    field_changed: 'benefits.redemption_cap',
    old_value: 'Unlimited redemption',
    new_value: 'Capped at 2,00,000 RP per redemption cycle',
    effective_date: '2026-01-15',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'Infinia RP redemption capped at 2 lakh points per cycle (Jan 2026). Affects ultra-high spenders.',
    is_published: true,
  },
  {
    card_slug: 'hdfc-infinia-metal',
    change_type: 'earning_rate_cut',
    field_changed: 'eligibility.annual_spend_threshold',
    old_value: null,
    new_value: '₹18L annual spend or ₹1Cr banking relationship required to retain card',
    effective_date: '2026-02-01',
    source_type: 'community',
    confidence: 0.85,
    summary: 'HDFC may revoke Infinia for customers with <₹18L annual spend or <₹1Cr banking relationship (2026). Significant closure risk.',
    is_published: true,
  },
  {
    card_slug: 'amex-platinum-travel',
    change_type: 'status_change',
    field_changed: 'is_active',
    old_value: true,
    new_value: false,
    effective_date: '2026-01-01',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'Amex Platinum Travel no longer open for new applications as of early 2026.',
    is_published: true,
  },
  // THE ATLAS DEVALUATION — most important for the education spend story
  {
    card_slug: 'axis-atlas',
    change_type: 'partner_removed',
    field_changed: 'transfer_partners.accor',
    old_value: 'Accor Live Limitless (ALL) — 1:1 transfer ratio',
    new_value: null,
    effective_date: '2026-01-15',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'Axis Atlas lost Accor as transfer partner (Jan 2026). Education fee spends on Atlas used to fetch ~8% return via Accor hotel redemptions (5 EDGE Miles/₹100 × 1:1 Accor transfer → optimized hotel value). Return on education spends drops from 8%+ to base 1.25% (5 miles × ₹0.25 CPP).',
    is_published: true,
  },
  {
    card_slug: 'axis-atlas',
    change_type: 'partner_removed',
    field_changed: 'transfer_partners.marriott',
    old_value: 'Marriott Bonvoy — 1:1 transfer ratio',
    new_value: null,
    effective_date: '2026-01-15',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'Axis Atlas lost Marriott Bonvoy as transfer partner (Jan 2026). Premium hotel redemptions via Atlas miles no longer possible.',
    is_published: true,
  },
  {
    card_slug: 'axis-atlas',
    change_type: 'partner_removed',
    field_changed: 'transfer_partners.qatar',
    old_value: 'Qatar Airways Privilege Club — 1:1 transfer ratio',
    new_value: null,
    effective_date: '2026-01-15',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'Axis Atlas lost Qatar Airways as transfer partner (Jan 2026). Sweet spot for QR redemptions on Atlas miles gone.',
    is_published: true,
  },
  {
    card_slug: 'axis-atlas',
    change_type: 'status_change',
    field_changed: 'is_active',
    old_value: true,
    new_value: false,
    effective_date: '2026-02-01',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'Axis Atlas no longer open for new applications as of Feb 2026. Existing cardholders unaffected but the card is effectively discontinued.',
    is_published: true,
  },
  // HDFC Pixel Play restriction (blocker)
  {
    card_slug: 'hdfc-pixel-play',
    change_type: 'status_change',
    field_changed: 'card_restrictions',
    old_value: null,
    new_value: 'Cannot hold alongside HDFC Infinia, Regalia Gold, Millennia, or Diners Black',
    effective_date: '2023-01-01',
    source_type: 'bank_announcement',
    confidence: 1.0,
    summary: 'HDFC Pixel Play blocks application for HDFC Infinia, Regalia Gold, Millennia, and Diners Black. Exclusivity restriction.',
    is_published: true,
  },
]

type RestrictionSeed = {
  blocker_slug: string
  blocked_slug: string
  restriction_type: string
  notes?: string
}

const RESTRICTION_SEEDS: RestrictionSeed[] = [
  { blocker_slug: 'hdfc-pixel-play', blocked_slug: 'hdfc-infinia-metal', restriction_type: 'exclusivity', notes: 'HDFC Pixel Play holders cannot hold Infinia simultaneously' },
  { blocker_slug: 'hdfc-pixel-play', blocked_slug: 'hdfc-regalia-gold', restriction_type: 'exclusivity' },
  { blocker_slug: 'hdfc-pixel-play', blocked_slug: 'hdfc-millennia', restriction_type: 'exclusivity' },
  { blocker_slug: 'hdfc-pixel-play', blocked_slug: 'hdfc-diners-club-black-metal', restriction_type: 'exclusivity' },
]

const CATEGORY_CAPS: Record<string, Partial<Record<string, number>>> = {
  // HSBC Live+ — 10% capped ~₹1,000/month (shared across accelerated categories)
  'hsbc-live-plus': {
    grocery: 1000, dining: 1000, swiggy: 1000, zomato: 1000,
    blinkit: 1000, zepto: 1000, instamart: 1000, bigbasket: 1000, movies: 1000,
  },
  // HDFC Millennia — 5% capped at 1,000 CashPoints/month
  'hdfc-millennia': {
    amazon: 1000, flipkart: 1000, myntra: 1000, zomato: 1000, swiggy: 1000,
    instamart: 1000, blinkit: 1000, shopping: 1000, travel: 1000,
  },
  // HDFC Swiggy BLCK — 10% on Swiggy capped ~₹1,500/month
  'hdfc-swiggy-blck': { swiggy: 1500, instamart: 1500 },
  // SBI Cashback — 5% online capped ₹5,000/month
  'sbi-cashback': {
    amazon: 5000, flipkart: 5000, myntra: 5000, nykaa: 5000, zomato: 5000,
    swiggy: 5000, instamart: 5000, blinkit: 5000, grocery: 5000, shopping: 5000,
    dining: 5000, travel: 5000, movies: 5000, utilities: 5000, education: 5000, fuel: 5000,
  },
  // Axis ACE — 5% (Google Pay bills) capped ₹500/month
  'axis-ace': { utilities: 500, insurance: 500 },
}

export { PROGRAM_CPP, TRANSFER_PARTNER_SEEDS, CHANGELOG_SEEDS, RESTRICTION_SEEDS, CATEGORY_CAPS }
