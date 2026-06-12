/**
 * Shared types for the catalog scraper pipeline (discovery → fetch → extract →
 * promote). Kept separate from ../types.ts, which serves the devaluation monitor.
 */

import type { ScrapedCard } from './schema'

export type BankConfig = {
  issuer: string            // canonical issuer key stored on cards.issuer (e.g. 'HDFC')
  displayName: string
  // Listing/landing pages that link out to individual card detail pages.
  listingUrls: string[]
  // Optional sitemap.xml to mine for card URLs the listing pages don't link.
  sitemapUrl?: string
  // A discovered URL is treated as a card detail page only if it matches this.
  cardUrlPattern: RegExp
  // URLs matching any of these are dropped even if they match cardUrlPattern
  // (compare/apply/eligibility hubs, listing pages themselves, etc.).
  blocklist?: RegExp[]
  // Selectors clicked after load to expand accordions/tabs so fees & rewards
  // render into the DOM before we read text.
  expandSelectors?: string[]
  defaultNetwork?: string
  // Short aliases accepted by --bank=<x> in addition to issuer/displayName.
  aliases?: string[]
  // Aggregator sources (e.g. cardinsider) host many issuers' cards. When set, the
  // canonical issuer is derived per-URL from the path rather than from `issuer`.
  // Returns null for URLs that aren't card pages (category/blog hubs) → dropped.
  resolveIssuer?: (url: string) => string | null
}

export type DiscoveredUrl = {
  url: string
  issuer: string
}

export type FetchedPage = {
  url: string
  finalUrl: string
  rawText: string
  contentHash: string
  ok: boolean
  error?: string
}

export type ExtractionResult = {
  card: ScrapedCard
  confidence: number
  fieldConfidence: Record<string, number>
  model: string
  // Fields that were nulled out because their value wasn't found in the page text.
  droppedUngrounded: string[]
}

export type PipelineStats = {
  discovered: number
  fetched: number
  skippedUnchanged: number
  extracted: number
  promoted: number
  stagedNotPromoted: number
  failed: number
  errors: string[]
  quotaExceeded?: boolean // set when the LLM quota is hit — aborts the run
}
