import { z } from 'zod'

// ─── Spend Categories ─────────────────────────────────────────────────────────
// Macro categories (card DB uses these for earn rates)
// Micro/platform categories (user enters these; engine resolves via fallback chain)

export const SPEND_CATEGORIES = [
  // Macro
  'grocery',
  'dining',
  'fuel',
  'travel',
  'movies',
  'shopping',
  'utilities',
  'international',
  'rent',
  'upi',
  // Platforms that map to grocery
  'amazon',    // amazon.in (also shopping, but many cards have specific amazon rate)
  'flipkart',  // also shopping
  'blinkit',
  'zepto',
  'instamart',
  'bigbasket',
  'dmart',
  // Platforms that map to shopping
  'myntra',
  'nykaa',
  // Platforms that map to dining
  'zomato',
  'swiggy',
  // Platforms that map to apparel/shopping
  'ajio',
  // Standalone categories
  'education',
  'insurance',
  'subscriptions', // OTT / SaaS recurring (Netflix, Spotify, etc.)
  'apparel',       // clothing/fashion macro (Myntra, Nykaa Fashion, Ajio)
] as const

export type SpendCategory = (typeof SPEND_CATEGORIES)[number]

// ─── Category Fallback Chain ──────────────────────────────────────────────────
// For each spend category, the engine tries each category in order until
// it finds an earn rate on the card. Falls back to base_earn_rate if none match.
export const CATEGORY_FALLBACK_CHAIN: Record<SpendCategory, SpendCategory[]> = {
  blinkit: ['blinkit', 'grocery'],
  zepto: ['zepto', 'grocery'],
  instamart: ['instamart', 'swiggy', 'grocery'], // HDFC Swiggy BLCK earns on instamart via swiggy rate
  bigbasket: ['bigbasket', 'grocery'],
  dmart: ['dmart', 'grocery'],
  myntra: ['myntra', 'apparel', 'shopping'],
  nykaa: ['nykaa', 'apparel', 'shopping'],
  ajio: ['ajio', 'apparel', 'shopping'],
  amazon: ['amazon', 'shopping'],
  flipkart: ['flipkart', 'shopping'],
  zomato: ['zomato', 'dining'],
  swiggy: ['swiggy', 'dining'],
  insurance: ['insurance', 'utilities'],
  education: ['education'],
  subscriptions: ['subscriptions'],
  apparel: ['apparel', 'shopping'],
  grocery: ['grocery'],
  shopping: ['shopping'],
  dining: ['dining'],
  travel: ['travel'],
  movies: ['movies'],
  utilities: ['utilities'],
  international: ['international'],
  rent: ['rent'],
  upi: ['upi'],
  fuel: ['fuel'],
}

// ─── UI Category Groups (hierarchical) ───────────────────────────────────────
export type CategoryGroup = {
  id: string
  label: string
  icon: string
  categories: SpendCategory[]
  macroCategory: SpendCategory  // when user sets a section-level amount, maps here
}

// Parent categories the quiz asks about, each with the specific platforms a user
// can optionally attribute spend to (engine resolves platform→macro via the chain).
export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: 'grocery',
    label: 'Groceries',
    icon: '🛒',
    macroCategory: 'grocery',
    categories: ['blinkit', 'zepto', 'instamart', 'bigbasket', 'dmart', 'grocery'],
  },
  {
    id: 'dining',
    label: 'Dining & Food Delivery',
    icon: '🍽️',
    macroCategory: 'dining',
    categories: ['zomato', 'swiggy', 'dining'],
  },
  {
    id: 'online_shopping',
    label: 'Online Shopping',
    icon: '🛍️',
    macroCategory: 'shopping',
    categories: ['amazon', 'flipkart', 'shopping'],
  },
  {
    id: 'apparel',
    label: 'Apparel & Fashion',
    icon: '👗',
    macroCategory: 'apparel',
    categories: ['myntra', 'nykaa', 'ajio', 'apparel'],
  },
  {
    id: 'travel',
    label: 'Travel & Forex',
    icon: '✈️',
    macroCategory: 'travel',
    categories: ['travel', 'international'],
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    icon: '🎬',
    macroCategory: 'movies',
    categories: ['movies'],
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: '📺',
    macroCategory: 'subscriptions',
    categories: ['subscriptions'],
  },
  {
    id: 'fuel',
    label: 'Fuel',
    icon: '⛽',
    macroCategory: 'fuel',
    categories: ['fuel'],
  },
  {
    id: 'rent',
    label: 'Rent',
    icon: '🏠',
    macroCategory: 'rent',
    categories: ['rent'],
  },
  {
    id: 'bills',
    label: 'Bills & Utilities',
    icon: '⚡',
    macroCategory: 'utilities',
    categories: ['utilities', 'upi', 'education', 'insurance'],
  },
]

// ─── Zod Schemas ──────────────────────────────────────────────────────────────
export const SpendProfileSchema = z.object({
  grocery: z.number().min(0).default(0),
  dining: z.number().min(0).default(0),
  fuel: z.number().min(0).default(0),
  travel: z.number().min(0).default(0),
  movies: z.number().min(0).default(0),
  shopping: z.number().min(0).default(0),
  utilities: z.number().min(0).default(0),
  international: z.number().min(0).default(0),
  rent: z.number().min(0).default(0),
  amazon: z.number().min(0).default(0),
  flipkart: z.number().min(0).default(0),
  upi: z.number().min(0).default(0),
  blinkit: z.number().min(0).default(0),
  zepto: z.number().min(0).default(0),
  instamart: z.number().min(0).default(0),
  bigbasket: z.number().min(0).default(0),
  dmart: z.number().min(0).default(0),
  myntra: z.number().min(0).default(0),
  nykaa: z.number().min(0).default(0),
  zomato: z.number().min(0).default(0),
  swiggy: z.number().min(0).default(0),
  ajio: z.number().min(0).default(0),
  education: z.number().min(0).default(0),
  insurance: z.number().min(0).default(0),
  subscriptions: z.number().min(0).default(0),
  apparel: z.number().min(0).default(0),
})

export type SpendProfile = z.infer<typeof SpendProfileSchema>

// ─── CIBIL bands ──────────────────────────────────────────────────────────────
// Asked as bands (users rarely know the exact number). `floor` = the conservative
// lower bound used for eligibility (a card needing 760 is hidden from a 730–769 user).
export const CIBIL_BANDS = ['no_cibil', 'below_680', '680_729', '730_769', '770_799', '800_plus'] as const
export type CibilBand = (typeof CIBIL_BANDS)[number]
export const CIBIL_BAND_META: Record<CibilBand, { label: string; hint: string; floor: number }> = {
  no_cibil:  { label: 'No score yet',  hint: 'New to credit — no CIBIL history', floor: 0 },
  below_680: { label: 'Below 680',     hint: 'Needs work — limited approvals',   floor: 600 },
  '680_729': { label: '680–729',       hint: 'Building — most entry cards',       floor: 680 },
  '730_769': { label: '730–769',       hint: 'Good — most cards',                 floor: 730 },
  '770_799': { label: '770–799',       hint: 'Very good — premium cards',         floor: 770 },
  '800_plus':{ label: '800+',          hint: 'Excellent — everything, incl. invite-only', floor: 800 },
}

// ─── Card-type preference (what kind of card the user wants) ─────────────────────
// Mirrors the card categorization taxonomy (services/cardCategory) + an all-rounder.
export const CARD_PREFERENCES = ['cashback', 'travel', 'points', 'fuel', 'premium', 'super_premium', 'charge_card', 'all_rounder'] as const
export type CardPreference = (typeof CARD_PREFERENCES)[number]
export const CARD_PREFERENCE_META: Record<CardPreference, { label: string; blurb: string }> = {
  cashback:      { label: 'Cashback',      blurb: 'Flat money back, nothing to manage' },
  travel:        { label: 'Travel & Miles', blurb: 'Lounges + miles you transfer to airlines/hotels' },
  points:        { label: 'Reward Points', blurb: 'Flexible points across redemption options' },
  fuel:          { label: 'Fuel',          blurb: 'Fuel surcharge waiver + accelerated fuel rewards' },
  premium:       { label: 'Premium',       blurb: 'Lifestyle perks, lounges, higher rewards' },
  super_premium: { label: 'Super Premium', blurb: 'Top-tier metal cards, concierge, the works' },
  charge_card:   { label: 'Charge Card',   blurb: 'No preset limit, pay-in-full each cycle (e.g. Amex)' },
  all_rounder:   { label: 'All-rounder',   blurb: 'Just show me the best overall for my spends' },
}

export const RecommendRequestSchema = z.object({
  monthly_spends: SpendProfileSchema,
  // Exact annual income (₹). UI captures monthly net salary and stores ×12.
  annual_income: z.number().min(0).optional(),
  credit_score_band: z.enum(CIBIL_BANDS).optional(),
  reward_preference: z.enum(CARD_PREFERENCES).optional(),
  existing_card_slugs: z.array(z.string()).default([]),
  exclude_invite_only: z.boolean().default(false),
})

export type RecommendRequest = z.infer<typeof RecommendRequestSchema>
export type RewardPreference = NonNullable<RecommendRequest['reward_preference']>

export const CategoryBreakdownSchema = z.record(z.string(), z.number())

export const RecommendationResultSchema = z.object({
  card: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    issuer: z.string(),
    network: z.string(),
    card_type: z.string(),
    card_segment: z.string().nullable(),
    annual_fee: z.number(),
    joining_fee: z.number(),
    annual_fee_waiver_spend: z.number().nullable(),
    reward_currency: z.string(),
    base_earn_rate: z.string(),
    forex_markup: z.string().nullable(),
    invite_only: z.boolean().nullable(),
    is_lifetime_free: z.boolean().nullable(),
    is_active: z.boolean().nullable(),
    fd_backed: z.boolean().nullable(),
    no_cibil_required: z.boolean().nullable(),
    joining_bonus_value: z.number().nullable(),
    joining_bonus_description: z.string().nullable(),
    image_url: z.string().nullable(),
    apply_url: z.string().nullable(),
  }),
  // POV value: rewards (realized under the user's preference) + perk value − net fee.
  annual_value: z.number(),
  first_year_value: z.number(),
  // Short label describing how value is realized for this user, e.g. "as cashback", "as transferable miles".
  value_basis: z.string(),
  // Why this card surfaced for this user/section, e.g. "Best match: miles + lounges".
  match_reason: z.string(),
  breakdown: z.object({
    rewards_earned: z.number(), // realized reward rupees under the lens
    benefit_value: z.number(),  // preference-weighted value of perks (lounge/golf/etc.)
    net_fee: z.number(),
    by_category: CategoryBreakdownSchema,
  }),
  rank: z.number(),
  warnings: z.array(z.string()),
  why_this_card: z.string(),
  card_health_score: z.number().nullable(),
  recent_changes: z.array(z.string()),
  perk_highlights: z.array(z.string()),
})

export type RecommendationResult = z.infer<typeof RecommendationResultSchema>

export const RecommendSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  items: z.array(RecommendationResultSchema),
})

export type RecommendSection = z.infer<typeof RecommendSectionSchema>

export const RecommendResponseSchema = z.object({
  computed_at: z.string(),
  total_monthly_spend: z.number(),
  preference: z.string().nullable(),
  top_pick: RecommendationResultSchema.nullable(),
  sections: z.array(RecommendSectionSchema),
  // Full list ranked by value under the user's preference (for "show all").
  all_results: z.array(RecommendationResultSchema),
})

export type RecommendResponse = z.infer<typeof RecommendResponseSchema>

// ─── Labels & Icons ───────────────────────────────────────────────────────────
export const CATEGORY_LABELS: Record<SpendCategory, string> = {
  grocery: 'Grocery (all)',
  dining: 'Restaurant Dining',
  fuel: 'Fuel',
  travel: 'Flights & Hotels',
  movies: 'Movies & Entertainment',
  shopping: 'Other Online Shopping',
  utilities: 'Utilities & Bills',
  international: 'International Spends',
  rent: 'Rent',
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  upi: 'UPI Payments',
  blinkit: 'Blinkit',
  zepto: 'Zepto',
  instamart: 'Swiggy Instamart',
  bigbasket: 'BigBasket',
  dmart: 'DMart Ready',
  myntra: 'Myntra',
  nykaa: 'Nykaa',
  zomato: 'Zomato',
  swiggy: 'Swiggy (food)',
  ajio: 'AJIO',
  education: 'Education / Fees',
  insurance: 'Insurance Premiums',
  subscriptions: 'Subscriptions (OTT/SaaS)',
  apparel: 'Apparel & Fashion',
}

export const CATEGORY_ICONS: Record<SpendCategory, string> = {
  grocery: '🛒',
  dining: '🍽️',
  fuel: '⛽',
  travel: '✈️',
  movies: '🎬',
  shopping: '🛍️',
  utilities: '⚡',
  international: '🌍',
  rent: '🏠',
  amazon: '📦',
  flipkart: '🏷️',
  upi: '📲',
  blinkit: '⚡',
  zepto: '🟡',
  instamart: '🧡',
  bigbasket: '🍃',
  dmart: '🏪',
  myntra: '👗',
  nykaa: '💄',
  zomato: '🔴',
  swiggy: '🟠',
  ajio: '🧵',
  education: '🎓',
  insurance: '🛡️',
  subscriptions: '📺',
  apparel: '👗',
}
