/** Small shared helpers for the catalog pipeline. */

import { createHash } from 'node:crypto'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** Normalize a URL for dedup: absolute, no fragment, no query, no trailing slash. */
export function normalizeUrl(href: string, base?: string): string | null {
  try {
    const u = new URL(href, base)
    u.hash = ''
    u.search = ''
    if (u.protocol === 'http:') u.protocol = 'https:' // dedupe http/https of same page
    let s = u.toString()
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1)
    return s
  } catch {
    return null
  }
}

/** Stable slug from issuer + card name, e.g. 'HDFC' + 'Infinia Metal' -> 'hdfc-infinia-metal'. */
export function slugify(...parts: string[]): string {
  return parts
    .join(' ')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

// Issuer/brand and generic words that don't distinguish one card from another.
// Stripping them lets "HDFC Bank Millennia Credit Card" (seed) and "Millennia
// Credit Card" (scraped) collapse to the same core, so we update instead of dup.
const STRIP_WORDS = new Set([
  'the', 'bank', 'credit', 'card', 'cards', 'co', 'branded', 'cobranded', 'edition', 'metal',
  'hdfc', 'axis', 'icici', 'sbi', 'sbicard', 'amex', 'american', 'express',
  'hsbc', 'kotak', 'mahindra', 'idfc', 'first', 'standard', 'chartered',
  'au', 'small', 'finance', 'federal', 'unity', 'sfb', 'yes', 'rbl', 'indusind',
])

/** Distinguishing core of a card name, used to match scraped cards to existing rows. */
export function cardCoreName(name: string): string {
  const core = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STRIP_WORDS.has(w))
    .join(' ')
    .trim()
  return core || name.toLowerCase().trim()
}

/**
 * Does `value`'s numeric content appear in `text`? Tolerant of Indian comma
 * grouping (12,500) and a trailing ".0". Used to ground extracted numbers.
 */
export function numberAppearsIn(value: number, text: string): boolean {
  if (!Number.isFinite(value)) return false
  const digits = String(value % 1 === 0 ? value : value).replace(/\.0$/, '')
  const plain = String(Math.round(value))
  const haystack = text.replace(/,/g, '')
  return haystack.includes(digits) || haystack.includes(plain)
}

// ── Deterministic reward-rate parsing ───────────────────────────────────────
// LLMs are unreliable at the "X points per ₹Y -> per-₹100" arithmetic, but they
// reliably quote the literal phrase. We recompute the rate ourselves from that
// grounded text. All results are "value-back per ₹100" (cashback % for cashback
// cards; points-per-₹100 for points cards).

// The reward-unit keyword (points/miles/etc.). A program name may sit between the
// number and the unit ("1 Membership Rewards Point per ₹50"), so allow up to two
// optional qualifier words in between (e.g. "Membership Rewards", "EDGE").
const POINTS_UNIT = String.raw`(?:reward\s*points?|points?|rp\b|cash\s*points?|cashpoints?|edge\s*miles?|miles?)`
const POINTS_QUALIFIER = String.raw`(?:[a-z]+\s+){0,2}`

function pctOf(t: string): number | null {
  const m = t.match(/(\d+(?:\.\d+)?)\s*%\s*(?:value[\s-]*back|cash[\s-]*back|cashback|back|rewards?|reward)/i)
  return m ? parseFloat(m[1]) : null
}
function pointsPerAmount(t: string): number | null {
  const m = t.match(
    new RegExp(
      String.raw`(\d+(?:\.\d+)?)\s*${POINTS_QUALIFIER}${POINTS_UNIT}\s*(?:per|for\s+every|on\s+every|for|\/)\s*(?:₹|rs\.?|inr|rupees?)\s*(\d+(?:\.\d+)?)`,
      'i'
    )
  )
  if (!m) return null
  const pts = parseFloat(m[1])
  const amt = parseFloat(m[2])
  return amt > 0 ? (pts / amt) * 100 : null
}
function rupeePerRupee(t: string): number | null {
  const m = t.match(
    /(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(?:cash\s*back|cashback)?\s*(?:per|for\s+every|on)\s*(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/i
  )
  if (!m) return null
  const a = parseFloat(m[1])
  const b = parseFloat(m[2])
  return b > 0 ? (a / b) * 100 : null
}

/** Per-₹100 reward from a single grounded phrase (a category's source_quote). */
export function parseRewardRate(text: string | null | undefined): number | null {
  if (!text) return null
  const t = text.replace(/,/g, '')
  const r = pctOf(t) ?? pointsPerAmount(t) ?? rupeePerRupee(t)
  return r == null ? null : Math.round(r * 100) / 100
}

/**
 * Per-₹100 BASE/general rate from a (possibly multi-rate) reward description.
 * Only overrides when unambiguous: prefers a clause anchored to "other/general
 * spends", else a description that states exactly one rate. Otherwise null (keep
 * the model's value) — avoids grabbing a bonus-category rate as the base.
 */
export function parseBaseRate(desc: string | null | undefined): number | null {
  if (!desc) return null
  const t = desc.replace(/,/g, '')
  const anchor = t.match(/([^.;]*\b(?:all\s+other|other|general|every\s+other|rest\s+of)\s+spends?[^.;]*)/i)
  if (anchor) {
    const r = parseRewardRate(anchor[1])
    if (r != null) return r
  }
  const rateTokens = t.match(
    new RegExp(
      String.raw`\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*${POINTS_QUALIFIER}${POINTS_UNIT}\s*(?:per|for\s+every|for|\/)\s*(?:₹|rs\.?|inr)`,
      'gi'
    )
  )
  if (rateTokens && rateTokens.length === 1) return parseRewardRate(t)
  return null
}

/** Run async tasks with a bounded concurrency pool. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}
