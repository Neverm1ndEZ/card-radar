/** Staging table read/write — the idempotency + audit layer. */

import { eq } from 'drizzle-orm'
import { scrapedCardStaging, type ScrapedCardStaging } from '../../../db/schema'
import type { CatalogDb } from './promote'
import type { ExtractionResult, FetchedPage } from './types'
import { slugify } from './util'

const EXCERPT_MAX = 4000

export async function getStaging(
  db: CatalogDb,
  url: string
): Promise<ScrapedCardStaging | undefined> {
  return db.query.scrapedCardStaging.findFirst({
    where: eq(scrapedCardStaging.source_url, url),
  })
}

/** Bump last_seen_at without re-extracting (used when content hash is unchanged). */
export async function touchStaging(db: CatalogDb, url: string): Promise<void> {
  await db
    .update(scrapedCardStaging)
    .set({ last_seen_at: new Date() })
    .where(eq(scrapedCardStaging.source_url, url))
}

export async function upsertStaging(
  db: CatalogDb,
  args: { issuer: string; page: FetchedPage; ex: ExtractionResult }
): Promise<void> {
  const { issuer, page, ex } = args
  const name = ex.card.name ?? page.url
  const values = {
    issuer,
    card_name: name,
    slug: slugify(issuer, name),
    source_url: page.url,
    network: ex.card.network ?? null,
    content_hash: page.contentHash,
    raw_excerpt: page.rawText.slice(0, EXCERPT_MAX),
    extracted: ex.card as unknown as Record<string, unknown>,
    extraction_model: ex.model,
    confidence: String(ex.confidence),
    field_confidence: ex.fieldConfidence,
    scraped_at: new Date(),
    last_seen_at: new Date(),
  }
  await db
    .insert(scrapedCardStaging)
    .values(values)
    .onConflictDoUpdate({ target: scrapedCardStaging.source_url, set: values })
}

export async function markPromotion(
  db: CatalogDb,
  url: string,
  result: { promoted: boolean; cardId?: string; reason?: string }
): Promise<void> {
  await db
    .update(scrapedCardStaging)
    .set({
      promoted: result.promoted,
      promoted_card_id: result.cardId ?? null,
      promote_skipped_reason: result.reason ?? null,
    })
    .where(eq(scrapedCardStaging.source_url, url))
}
