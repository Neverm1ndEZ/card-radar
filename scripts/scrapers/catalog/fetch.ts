/**
 * Fetch + clean a single card page.
 *
 * Renders with Playwright, clicks the bank's expand selectors so collapsed
 * Fees/Rewards sections enter the DOM, then extracts main-content innerText with
 * nav/footer/script/cookie chrome stripped. `contentHash` over the cleaned text
 * lets the orchestrator skip re-extraction (and the LLM call) when nothing changed.
 */

import type { BrowserContext } from 'playwright'
import type { BankConfig, FetchedPage } from './types'
import { sha256 } from './util'

// Hard cap on text handed to the LLM. Card pages are well under this once chrome
// is stripped; the cap protects against runaway pages. Hash is over the full text.
const MAX_TEXT = 18000

// Cookie/consent "accept" buttons — dismiss before reading or SPA card content
// never renders and we capture only the banner (seen on sc.com / OneTrust sites).
const COOKIE_ACCEPT = [
  '#onetrust-accept-btn-handler',
  '#truste-consent-button',
  'button[aria-label*="accept" i]',
  'button:has-text("Accept All")',
  'button:has-text("I Accept")',
  'button:has-text("Allow All")',
]

// Extract cleaned main-content text. Retries once if a click-induced navigation
// destroyed the execution context mid-read.
async function readBodyText(page: import('playwright').Page): Promise<string> {
  const extract = () =>
    page.evaluate(() => {
      const drop = [
        'script', 'style', 'noscript', 'svg', 'iframe',
        'header', 'footer', 'nav',
        // Apply-now modals/forms dominate bank card pages with junk text.
        'form', 'input', 'select', 'textarea', 'button',
        '[role="dialog"]', '[class*="modal"]', '[id*="modal"]',
        '[class*="popup"]', '[class*="overlay"]', '[class*="dialog"]',
        '[class*="cookie"]', '[id*="cookie"]',
        '[id*="onetrust"]', '[class*="onetrust"]', '[id*="consent"]', '[class*="consent"]',
        '[class*="privacy-preference"]', '[aria-label*="cookie" i]',
        '[class*="header"]', '[class*="footer"]', '[class*="nav"]',
        '[class*="menu"]', '[role="navigation"]', '[aria-hidden="true"]',
      ]
      const root = document.body.cloneNode(true) as HTMLElement
      for (const sel of drop) root.querySelectorAll(sel).forEach((el) => el.remove())
      // Line-based normalization: trim each line and DROP empty ones. ICICI-style
      // DOMs emit thousands of whitespace-only lines that otherwise eat the budget
      // and bury the real content.
      return (root.innerText || '')
        .split('\n')
        .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
        .filter((l) => l.length > 0)
        .join('\n')
        .trim()
    })

  try {
    return await extract()
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(800)
    return await extract().catch(() => '')
  }
}

export async function fetchCardPage(
  url: string,
  bank: BankConfig,
  context: BrowserContext
): Promise<FetchedPage> {
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })

    // Dismiss cookie/consent overlays so SPA card content can render.
    for (const sel of COOKIE_ACCEPT) {
      const h = await page.$(sel).catch(() => null)
      if (h) await h.click({ timeout: 1500 }).catch(() => {})
    }
    // Let client-rendered content settle (networkidle, with a hard fallback).
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1500)

    // Expand accordions/tabs so fees & rewards render. Best-effort, bounded.
    // A click can navigate (some "accordions" are links) — guard each one and let
    // the read step re-settle if so.
    for (const sel of bank.expandSelectors ?? []) {
      try {
        const handles = await page.$$(sel)
        for (const h of handles.slice(0, 25)) {
          await h.click({ timeout: 800, force: true, noWaitAfter: true }).catch(() => {})
        }
      } catch {
        /* ignore — selector may not exist on this page */
      }
    }
    await page.waitForTimeout(800)

    const rawTextFull = await readBodyText(page)
    const cleaned = rawTextFull.slice(0, MAX_TEXT)
    return {
      url,
      finalUrl: page.url(),
      rawText: cleaned,
      contentHash: sha256(rawTextFull),
      ok: cleaned.length > 200, // too-short pages are usually errors/redirects
    }
  } catch (err) {
    return {
      url,
      finalUrl: url,
      rawText: '',
      contentHash: '',
      ok: false,
      error: String(err).slice(0, 200),
    }
  } finally {
    await page.close()
  }
}
