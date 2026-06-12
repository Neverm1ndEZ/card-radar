/**
 * Discovery — find every card-detail URL for a bank with no hardcoded card list.
 *
 * Two sources, unioned and deduped:
 *   1. Listing pages: render, collect every <a href>, keep those matching the
 *      bank's cardUrlPattern (minus blocklist).
 *   2. sitemap.xml (incl. one level of sitemap-index nesting): same filter.
 *
 * Because it's pattern-based, a card the bank launches tomorrow is found on the
 * next run automatically.
 */

import type { BrowserContext } from 'playwright'
import type { BankConfig } from './types'
import { normalizeUrl, sleep, USER_AGENT } from './util'

function keep(bank: BankConfig, url: string): boolean {
  if (!bank.cardUrlPattern.test(url)) return false
  if (bank.blocklist?.some((re) => re.test(url))) return false
  // Aggregator sources: a URL we can't map to an issuer isn't a card page.
  if (bank.resolveIssuer && bank.resolveIssuer(url) == null) return false
  return true
}

async function fromListingPages(bank: BankConfig, context: BrowserContext): Promise<string[]> {
  const found = new Set<string>()
  for (const listingUrl of bank.listingUrls) {
    const page = await context.newPage()
    try {
      await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(2500)
      // Scroll to trigger lazy-loaded card tiles.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
      await page.waitForTimeout(1000)
      const hrefs: string[] = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]')).map((a) => (a as HTMLAnchorElement).href)
      )
      for (const href of hrefs) {
        const norm = normalizeUrl(href, listingUrl)
        if (norm && keep(bank, norm)) found.add(norm)
      }
    } catch (err) {
      console.warn(`    [discover] listing failed: ${listingUrl} — ${String(err).slice(0, 120)}`)
    } finally {
      await page.close()
    }
    await sleep(1500)
  }
  return [...found]
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function extractLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1])
}

async function fromSitemap(bank: BankConfig): Promise<string[]> {
  if (!bank.sitemapUrl) return []
  const root = await fetchText(bank.sitemapUrl)
  if (!root) return []

  const found = new Set<string>()
  const locs = extractLocs(root)
  const isIndex = /<sitemapindex/i.test(root)

  if (isIndex) {
    // Only descend into child sitemaps that look card/personal-related, capped.
    // Match on PATH only — matching the full URL false-positives on hostnames that
    // contain these words (e.g. cardinsider.com makes every child "match").
    const childPath = (u: string) => {
      try {
        return new URL(u).pathname
      } catch {
        return u
      }
    }
    const children = locs
      .filter((u) => /(card|personal|retail|product)/i.test(childPath(u)))
      .slice(0, 10)
    for (const child of children) {
      const xml = await fetchText(child)
      if (!xml) continue
      for (const loc of extractLocs(xml)) {
        const norm = normalizeUrl(loc)
        if (norm && keep(bank, norm)) found.add(norm)
      }
      await sleep(500)
    }
  } else {
    for (const loc of locs) {
      const norm = normalizeUrl(loc)
      if (norm && keep(bank, norm)) found.add(norm)
    }
  }
  return [...found]
}

export async function discoverCardUrls(
  bank: BankConfig,
  context: BrowserContext
): Promise<string[]> {
  const [listing, sitemap] = await Promise.all([
    fromListingPages(bank, context),
    fromSitemap(bank),
  ])
  const all = new Set<string>([...listing, ...sitemap])
  console.log(
    `    [discover] ${bank.issuer}: ${all.size} card URLs ` +
      `(${listing.length} from listing, ${sitemap.length} from sitemap)`
  )
  return [...all]
}
