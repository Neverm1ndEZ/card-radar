/**
 * Extraction — page text → structured card via Gemini, then grounded + scored.
 *
 * Accuracy strategy:
 *  1. Constrain generation with GEMINI_RESPONSE_SCHEMA (JSON mode) + temp 0.
 *  2. Zod-validate the result (rejects anything off-contract).
 *  3. GROUND every money/eligibility number: if its digits don't appear in the
 *     page text, null it out and dock confidence. The model literally cannot make
 *     a fee up and have it survive.
 *  4. Score confidence from required-field coverage and grounding hits.
 */

import {
  ScrapedCardSchema,
  GEMINI_RESPONSE_SCHEMA,
  GROUNDED_NUMERIC_FIELDS,
  REQUIRED_FOR_PROMOTION,
  type ScrapedCard,
} from './schema'
import type { BankConfig, ExtractionResult } from './types'
import { numberAppearsIn, parseBaseRate, parseRewardRate, sleep } from './util'

// gemini-3.1-flash-lite: 15 RPM / 500 RPD on the free tier — enough to finish a
// whole bank in one run (2.5-flash's 20 RPD/day could not). Override via GEMINI_MODEL.
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite'
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`

const SYSTEM_PROMPT = `You are a meticulous data extractor for Indian credit cards.
You are given the visible text of ONE bank credit-card page. Extract ONLY facts
that are literally present in that text into the provided JSON schema.

HARD RULES — accuracy over completeness:
- NEVER invent, infer, estimate, or recall values from outside the text. If a field
  is not clearly stated on this page, return null (or [] for lists).
- All monetary amounts are in INR. Strip "₹" and commas: "₹12,500" -> 12500.
- annual_fee / joining_fee: the renewal and first-year fees respectively. If the
  page only gives one "membership fee", use it for both.
- annual_fee_waiver_spend: the annual spend that waives the fee, if stated.
- min_income_salary: ANNUAL income requirement in INR. If monthly is given, multiply
  by 12 and put the result here (but the monthly figure must be on the page).
- base_earn_rate: reward earned per ₹100 of GENERAL spend, normalized. e.g.
  "5 points per ₹150" -> 3.33; "1.5% cashback" -> 1.5. Put the literal phrase in
  reward_rate_description.
- category_rates: one entry per spend category that has a SPECIAL (non-base) rate.
  earn_rate is the effective VALUE-BACK PERCENT for ₹100 of spend in that category:
    * "5% cashback on Amazon" -> 5
    * If the page states an explicit value-back for a multiplier offer
      ("10X Reward Points (upto 2.5% value back)") use the percent -> 2.5, NOT 10.
    * "NX Reward Points" with no percent given -> earn_rate = N × base_earn_rate
      (the multiplier applies to the base rate; it is NOT N per ₹100).
  ALWAYS fill source_quote with the exact sentence from the page stating this rate.
- If a "Fees & Charges" / "Fees and Charges" section is present, read the joining and
  annual/renewal fees from it. Many cards state these only in that section.
- not_a_credit_card: set TRUE if this page is not a single credit card's detail page
  (e.g. a debit card, loan, a listing/compare page, or an error page). When true,
  every other field may be null.
- Prefer null over a low-confidence guess. A missing value is fine; a wrong one is not.`

function buildUserPrompt(bank: BankConfig, url: string, text: string): string {
  return `Issuer: ${bank.displayName} (${bank.issuer})
Page URL: ${url}

--- BEGIN PAGE TEXT ---
${text}
--- END PAGE TEXT ---

Extract the credit card on this page into the JSON schema. Remember: only what is
literally written above; null for anything else.`
}

async function callGemini(system: string, user: string, key: string): Promise<string> {
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
      maxOutputTokens: 8192,
    },
  }

  let lastErr = ''
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(ENDPOINT(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) return text
      lastErr = 'empty candidate'
    } else {
      const body = await res.text()
      lastErr = `${res.status} ${body.slice(0, 200)}`
      // A 429 citing quota/billing is the daily free-tier cap — retrying is futile
      // and there are hundreds of cards behind this one, so signal a hard stop.
      if (res.status === 429 && /quota|billing/i.test(body)) {
        throw new Error('QUOTA_EXCEEDED: Gemini daily/free-tier quota hit — ' + body.slice(0, 120))
      }
      // Backoff on transient rate-limit / server errors; fail fast otherwise.
      if (res.status !== 429 && res.status < 500) break
    }
    await sleep(2000 * (attempt + 1))
  }
  throw new Error(`Gemini call failed: ${lastErr}`)
}

/** Null out ungrounded numbers and compute the confidence score. */
function groundAndScore(
  card: ScrapedCard,
  pageText: string
): { card: ScrapedCard; confidence: number; fieldConfidence: Record<string, number>; dropped: string[] } {
  const dropped: string[] = []
  const fieldConfidence: Record<string, number> = {}
  const normText = pageText.replace(/\s+/g, ' ').toLowerCase()

  if (card.not_a_credit_card) {
    return { card, confidence: 0, fieldConfidence, dropped }
  }

  // Ground top-level literal numbers.
  for (const f of GROUNDED_NUMERIC_FIELDS) {
    const v = card[f] as number | null
    if (v == null) continue
    if (numberAppearsIn(v, pageText)) {
      fieldConfidence[f] = 1
    } else {
      ;(card as Record<string, unknown>)[f] = null
      dropped.push(f)
    }
  }

  // Ground category rates via their source_quote; drop rates we can't tie to text
  // or whose rate didn't parse to a number.
  card.category_rates = card.category_rates.filter((r) => {
    if (r.category == null || r.earn_rate == null) {
      if (r.category) dropped.push(`category_rate:${r.category}`)
      return false
    }
    const quoteOk = r.source_quote
      ? normText.includes(r.source_quote.replace(/\s+/g, ' ').toLowerCase().slice(0, 60))
      : false
    const numOk = numberAppearsIn(r.earn_rate, pageText)
    if (quoteOk || numOk) return true
    dropped.push(`category_rate:${r.category}`)
    return false
  })

  // Score: penalize missing required fields and each ungrounded drop.
  let score = 1
  for (const f of REQUIRED_FOR_PROMOTION) {
    if (card[f as keyof ScrapedCard] == null) {
      score -= 0.15
      fieldConfidence[f] = fieldConfidence[f] ?? 0
    }
  }
  score -= dropped.length * 0.1
  score = Math.max(0, Math.min(1, score))

  return { card, confidence: Number(score.toFixed(2)), fieldConfidence, dropped }
}

export async function extractCard(
  pageText: string,
  bank: BankConfig,
  url: string
): Promise<ExtractionResult> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')

  const raw = await callGemini(SYSTEM_PROMPT, buildUserPrompt(bank, url, pageText), key)

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}`)
  }

  const result = ScrapedCardSchema.safeParse(parsedJson)
  if (!result.success) {
    throw new Error(`Extraction failed schema validation: ${result.error.message.slice(0, 300)}`)
  }

  const card = result.data

  // Recompute reward rates deterministically from the grounded phrases — the model
  // quotes the text reliably but does the per-₹100 arithmetic poorly.
  const baseFromText = parseBaseRate(card.reward_rate_description)
  if (baseFromText != null) card.base_earn_rate = baseFromText
  for (const r of card.category_rates) {
    const fromQuote = parseRewardRate(r.source_quote)
    if (fromQuote != null) r.earn_rate = fromQuote
  }

  // Many pages describe rewards ("reward points"/"cashback") without naming the
  // currency. When there's clear reward evidence, classify it rather than drop the
  // whole card — points vs cashback is evident from the description.
  if (
    !card.reward_currency &&
    (card.base_earn_rate != null || card.category_rates.length > 0 || card.reward_rate_description)
  ) {
    const txt = `${card.reward_rate_description ?? ''}`.toLowerCase()
    card.reward_currency = /cash\s*back|cashback/.test(txt) ? 'Direct Cashback' : 'Reward Points'
  }

  const { confidence, fieldConfidence, dropped } = groundAndScore(card, pageText)
  return {
    card,
    confidence,
    fieldConfidence,
    model: MODEL,
    droppedUngrounded: dropped,
  }
}
