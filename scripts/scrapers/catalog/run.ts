/**
 * Catalog scraper orchestrator.
 *
 * Pipeline per bank:  discover → fetch → (skip if content unchanged) → extract →
 * stage → auto-promote (gated). Designed to be run unattended on a cron; new cards
 * are found automatically and good data flows into the live `cards` table without
 * any manual step.
 *
 * Usage:
 *   bun run scripts/scrapers/catalog/run.ts                 # all banks, discover+promote
 *   bun run scripts/scrapers/catalog/run.ts --bank=hdfc --limit=3 --no-promote
 *   bun run scripts/scrapers/catalog/run.ts --force         # ignore content-hash cache
 *   bun run scripts/scrapers/catalog/run.ts --concurrency=1 # gentler on rate limits
 *
 * Env: DATABASE_URL, GEMINI_API_KEY  (optional: GEMINI_MODEL)
 */

import { chromium, type BrowserContext } from 'playwright'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../../../db/schema'
import { BANKS, getBank } from './banks'
import type { BankConfig, PipelineStats } from './types'
import { discoverCardUrls } from './discover'
import { fetchCardPage } from './fetch'
import { extractCard } from './extract'
import { promoteToDb, type CatalogDb } from './promote'
import { getStaging, touchStaging, upsertStaging, markPromotion } from './staging'
import { pool, sleep, USER_AGENT } from './util'
import { backupScrapedCards } from '../../db/backup'
import { applyCuratedLayer } from '../../db/apply-curated'

type Flags = {
  bank?: string; limit?: number; noPromote: boolean; force: boolean
  concurrency: number; urls?: string[]; skipIssuers?: Set<string>
}

function parseFlags(argv: string[]): Flags {
  const get = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  const urls = get('urls')
  const skip = get('skip-issuer')
  return {
    bank: get('bank'),
    limit: get('limit') ? parseInt(get('limit')!, 10) : undefined,
    noPromote: argv.includes('--no-promote'),
    force: argv.includes('--force'),
    concurrency: get('concurrency') ? parseInt(get('concurrency')!, 10) : 2,
    // Explicit URL list — skips discovery and runs exactly these (pilot/targeted re-run).
    urls: urls ? urls.split(',').map((u) => u.trim()).filter(Boolean) : undefined,
    // Drop discovered URLs whose resolved issuer is in this set (hybrid: skip issuers
    // already well-covered by official scrapers). Only meaningful for aggregators.
    skipIssuers: skip ? new Set(skip.split(',').map((s) => s.trim()).filter(Boolean)) : undefined,
  }
}

function emptyStats(): PipelineStats {
  return {
    discovered: 0, fetched: 0, skippedUnchanged: 0, extracted: 0,
    promoted: 0, stagedNotPromoted: 0, failed: 0, errors: [],
  }
}

async function runBank(
  bank: BankConfig,
  db: CatalogDb,
  context: BrowserContext,
  flags: Flags,
  stats: PipelineStats
): Promise<void> {
  console.log(`\n━━━ ${bank.displayName} (${bank.issuer}) ━━━`)

  // Explicit --urls list skips discovery (pilot / targeted re-extract).
  let urls = flags.urls ?? (await discoverCardUrls(bank, context))
  // Hybrid: drop issuers already well-covered by official scrapers.
  if (flags.skipIssuers && bank.resolveIssuer) {
    const before = urls.length
    urls = urls.filter((u) => {
      const iss = bank.resolveIssuer!(u)
      return !iss || !flags.skipIssuers!.has(iss)
    })
    console.log(`    [skip-issuer] dropped ${before - urls.length} URLs (${[...flags.skipIssuers].join(', ')})`)
  }
  stats.discovered += urls.length
  if (flags.limit) urls = urls.slice(0, flags.limit)
  if (urls.length === 0) {
    console.log('    (no card URLs discovered — check cardUrlPattern)')
    return
  }

  await pool(urls, flags.concurrency, async (url) => {
    if (stats.quotaExceeded) return // hard stop already triggered — drain fast
    try {
      // Aggregator sources derive the canonical issuer from the URL; single-issuer
      // banks use their fixed issuer. `extractBank` carries it into the LLM prompt.
      const issuer = bank.resolveIssuer?.(url) ?? bank.issuer
      const extractBank: BankConfig = bank.resolveIssuer
        ? { ...bank, issuer, displayName: issuer }
        : bank

      const page = await fetchCardPage(url, bank, context)
      stats.fetched++
      if (!page.ok) {
        stats.failed++
        stats.errors.push(`fetch ${url}: ${page.error ?? 'too short'}`)
        return
      }

      // Idempotency: unchanged page → skip the LLM entirely.
      const prior = await getStaging(db, url)
      if (!flags.force && prior?.content_hash === page.contentHash) {
        stats.skippedUnchanged++
        await touchStaging(db, url)
        console.log(`    ↻ unchanged: ${url}`)
        return
      }

      const ex = await extractCard(page.rawText, extractBank, url)
      stats.extracted++
      await upsertStaging(db, { issuer, page, ex })

      const label = ex.card.name ?? url
      if (ex.card.not_a_credit_card) {
        console.log(`    ⊘ not a card: ${url}`)
        await markPromotion(db, url, { promoted: false, reason: 'not_a_credit_card' })
        stats.stagedNotPromoted++
        return
      }

      if (flags.noPromote) {
        console.log(`    ◆ staged (conf ${ex.confidence}): ${label}`)
        return
      }

      const result = await promoteToDb(ex, { issuer, sourceUrl: url }, db)
      if (result.promoted) {
        stats.promoted++
        await markPromotion(db, url, { promoted: true, cardId: result.cardId })
        const tag = result.created ? 'NEW' : `updated, ${result.changes} change(s)`
        console.log(`    ✓ promoted [${tag}] (conf ${ex.confidence}): ${label}`)
      } else {
        stats.stagedNotPromoted++
        await markPromotion(db, url, { promoted: false, reason: result.reason })
        console.log(`    ◆ staged, not promoted [${result.reason}]: ${label}`)
      }
    } catch (err) {
      if (String(err).includes('QUOTA_EXCEEDED')) {
        stats.quotaExceeded = true
        console.error(`\n  ⛔ Gemini quota exhausted — aborting run. Remaining cards will be picked up next run.`)
        return
      }
      stats.failed++
      stats.errors.push(`${url}: ${String(err).slice(0, 160)}`)
      console.warn(`    ✗ ${url}: ${String(err).slice(0, 160)}`)
    }
    await sleep(800) // politeness between pages
  })
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  if (!flags.noPromote && !process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set (required for extraction)')
  }

  // --bank accepts a comma-separated list, e.g. --bank=axis,sbi,hdfc
  const targets = flags.bank
    ? flags.bank.split(',').map((b) => getBank(b.trim())).filter((b): b is BankConfig => Boolean(b))
    : BANKS
  if (targets.length === 0) throw new Error(`Unknown bank(s): ${flags.bank}`)

  console.log('🗂️  CardRadar catalog scraper')
  console.log(`   banks: ${targets.map((b) => b.issuer).join(', ')}`)
  console.log(`   promote: ${flags.noPromote ? 'OFF (dry run)' : 'ON'}  concurrency: ${flags.concurrency}${flags.force ? '  force: ON' : ''}`)

  const db = drizzle({ client: neon(process.env.DATABASE_URL), schema })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ userAgent: USER_AGENT })

  const stats = emptyStats()
  try {
    for (const bank of targets) {
      if (stats.quotaExceeded) break
      try {
        await runBank(bank, db, context, flags, stats)
      } catch (err) {
        stats.errors.push(`bank ${bank.issuer}: ${String(err).slice(0, 200)}`)
        console.error(`  ✗ ${bank.issuer} failed: ${String(err).slice(0, 200)}`)
      }
    }
  } finally {
    await browser.close()
  }

  console.log('\n════════ summary ════════')
  console.log(`  discovered:        ${stats.discovered}`)
  console.log(`  fetched:           ${stats.fetched}`)
  console.log(`  skipped(unchanged):${stats.skippedUnchanged}`)
  console.log(`  extracted:         ${stats.extracted}`)
  console.log(`  promoted:          ${stats.promoted}`)
  console.log(`  staged-only:       ${stats.stagedNotPromoted}`)
  console.log(`  failed:            ${stats.failed}`)
  if (stats.errors.length) {
    console.log(`\n  first errors:`)
    for (const e of stats.errors.slice(0, 10)) console.log(`   - ${e}`)
  }

  // Re-apply the curated reward override layer: promote.ts replaces a card's category
  // rates from the scrape, so re-scraped flagships would otherwise lose their
  // hand-verified rates/caps/accelerators. Also (re)seeds CPP + transfer partners.
  // Runs BEFORE backup so the mirror tables capture the curated values.
  if (!flags.noPromote && stats.promoted > 0) {
    try {
      const c = await applyCuratedLayer(db as unknown as Parameters<typeof applyCuratedLayer>[0], (m) => console.warn(m))
      console.log(`  🎯 curated layer: cpp=${c.programValuations}, transfer_partners=${c.transferPartners}, cards=${c.curatedCards}`)
    } catch (err) {
      console.warn(`  ⚠️ curated layer failed: ${String(err).slice(0, 160)}`)
    }
  }

  // Keep the *_backup mirror tables in sync with prod after a live run (skip dry runs).
  if (!flags.noPromote && stats.promoted > 0) {
    try {
      const counts = await backupScrapedCards(db as unknown as Parameters<typeof backupScrapedCards>[0])
      console.log(`  💾 backup refreshed: ${Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(', ')}`)
    } catch (err) {
      console.warn(`  ⚠️ backup refresh failed: ${String(err).slice(0, 160)}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
