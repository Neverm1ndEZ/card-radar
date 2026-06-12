/**
 * Card categorization — classify every scraped card into the taxonomy the user
 * picks from in the quiz ("what kind of card") and that the card pages display.
 *
 * Deterministic + free (no LLM): derived from reward_currency, card_segment,
 * issuer/name, and (optionally) the card's category rates. A card is MULTI-TAG —
 * e.g. Axis Atlas = ['travel','premium'], HDFC Infinia = ['points','super_premium'],
 * BPCL SBI Octane = ['fuel','co_branded']. The quiz preference matches on tag
 * membership; "all_rounder" is a preference (no filter), not a card tag.
 */

// The selectable card kinds. `all_rounder` is a quiz preference only (see note).
export const CARD_CATEGORIES = [
  'cashback',
  'travel',
  'points',
  'fuel',
  'premium',
  'super_premium',
  'charge_card',
  'co_branded',
] as const
export type CardCategory = (typeof CARD_CATEGORIES)[number]

// Minimal shape the classifier needs (subset of the cards row + optional rates).
export type ClassifiableCard = {
  name: string
  issuer: string
  reward_currency: string | null
  card_segment: string | null
  card_type?: string | null
  invite_only?: boolean | null
  category_rates?: { category: string; earn_rate: string | number }[]
}

/** Coarse reward orientation from the (messy, mixed-case) reward_currency string. */
export function rewardClass(currency: string | null | undefined): 'cashback' | 'travel' | 'points' | null {
  if (!currency) return null
  const c = currency.toLowerCase()
  if (/cash\s*back|cashback|cash\s*point|amazon pay|edition cash/.test(c)) return 'cashback'
  if (/\bmile|krisflyer|avios|bluchip|club vistara|flying|guest miles|travel credit/.test(c)) return 'travel'
  return 'points' // reward/edge/neu/etc. points
}

const TRAVEL_NAME =
  /vistara|indigo|\b6e\b|air india|akasa|etihad|marriott|accor|\btaj\b|makemytrip|\bmmt\b|easemytrip|ixigo|scapia|yatra|cleartrip|thomas cook|\bniyo\b|intermiles|jetprivilege|miles\b|club vistara|adani one/i
const FUEL_NAME = /bpcl|hpcl|\bioc\b|iocl|indianoil|indian oil|octane|\bfuel\b|energie|power\s*\+|fuel\s*\+/i

/** Returns the full set of category tags for a card. */
export function classifyCard(card: ClassifiableCard): CardCategory[] {
  const tags = new Set<CardCategory>()
  const name = card.name ?? ''
  const seg = card.card_segment ?? ''
  const type = (card.card_type ?? '').toLowerCase()
  const rc = rewardClass(card.reward_currency)

  // ── tier (from segment) ──────────────────────────────────────────────────
  if (seg === 'super_premium' || card.invite_only) tags.add('super_premium')
  if (seg === 'premium') tags.add('premium')

  // ── structure ────────────────────────────────────────────────────────────
  if (seg === 'co_branded' || type === 'co-branded' || type === 'co_branded') tags.add('co_branded')
  // Amex charge cards: Amex card whose name isn't a "... Credit Card".
  if ((card.issuer === 'Amex' || /american express/i.test(name)) && !/credit/i.test(name)) {
    tags.add('charge_card')
  }

  // ── use-case / reward orientation ─────────────────────────────────────────
  const fuelRate = card.category_rates?.find((r) => r.category === 'fuel')
  const fuelIsAccelerated = fuelRate != null && Number(fuelRate.earn_rate) > 1
  if (type === 'fuel' || FUEL_NAME.test(name) || (fuelIsAccelerated && rc !== 'cashback')) {
    tags.add('fuel')
  }
  if (rc === 'cashback' || type === 'cashback') tags.add('cashback')
  if (rc === 'travel' || TRAVEL_NAME.test(name) || type === 'travel') tags.add('travel')

  // Points = reward-points cards that aren't primarily cashback. Always give a
  // card at least one reward-orientation tag so nothing is uncategorized.
  if (rc === 'points' && !tags.has('cashback')) tags.add('points')
  if (![...tags].some((t) => (['cashback', 'travel', 'points', 'fuel'] as string[]).includes(t))) {
    tags.add(rc === 'cashback' ? 'cashback' : rc === 'travel' ? 'travel' : 'points')
  }

  return [...tags]
}

/** Best single label for display, by salience. */
export function primaryCategory(tags: CardCategory[]): CardCategory {
  const order: CardCategory[] = ['fuel', 'travel', 'cashback', 'super_premium', 'premium', 'co_branded', 'points', 'charge_card']
  return order.find((c) => tags.includes(c)) ?? 'points'
}

const LABELS: Record<CardCategory, string> = {
  cashback: 'Cashback',
  travel: 'Travel',
  points: 'Rewards Points',
  fuel: 'Fuel',
  premium: 'Premium',
  super_premium: 'Super Premium',
  charge_card: 'Charge Card',
  co_branded: 'Co-branded',
}
export const categoryLabel = (c: CardCategory): string => LABELS[c]

/** Human one-liner e.g. "Premium travel card (invite-only)". */
export function categoryHeadline(card: ClassifiableCard): string {
  const tags = classifyCard(card)
  const tier = tags.includes('super_premium') ? 'Super-premium' : tags.includes('premium') ? 'Premium' : ''
  const kind =
    tags.includes('fuel') ? 'fuel' :
    tags.includes('travel') ? 'travel' :
    tags.includes('cashback') ? 'cashback' :
    tags.includes('charge_card') ? 'charge' : 'rewards'
  const base = `${tier} ${kind} card`.trim()
  const inviteOnly = card.invite_only ? ' (invite-only)' : ''
  return base.charAt(0).toUpperCase() + base.slice(1) + inviteOnly
}
