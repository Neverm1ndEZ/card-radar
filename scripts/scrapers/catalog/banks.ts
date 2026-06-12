/**
 * Bank registry — the ONLY place per-bank knowledge lives.
 *
 * Adding an issuer = one entry here. The pipeline does the rest: it crawls
 * `listingUrls` (+ `sitemapUrl`), keeps hrefs matching `cardUrlPattern`, drops
 * `blocklist` noise, renders each survivor, expands `expandSelectors`, and hands
 * the text to the LLM. No per-bank parsing code anywhere.
 *
 * NOTE: URL patterns are best-effort and meant to be tuned from the `--bank=x
 * --limit=n --no-promote` dry run (the discover step logs exactly what it kept /
 * dropped). Sitemaps are the safety net when a listing page lazy-loads its links.
 */

import type { BankConfig } from './types'

// Accordion/tab triggers common across Indian bank card pages — clicking these
// before reading text surfaces the Fees & Rewards sections that start collapsed.
const COMMON_EXPAND = [
  'button[aria-expanded="false"]',
  '[class*="accordion"] [role="button"]',
  '[class*="tab"] [role="tab"]',
  'summary',
]

export const BANKS: BankConfig[] = [
  {
    issuer: 'HDFC',
    displayName: 'HDFC Bank',
    // Detail pages are flat: /credit-cards/<slug>. Verified via discovery probe.
    listingUrls: ['https://www.hdfc.bank.in/credit-cards'],
    sitemapUrl: 'https://www.hdfc.bank.in/sitemap.xml',
    cardUrlPattern: /\/credit-cards\/[a-z0-9-]+$/i,
    blocklist: [
      /\/credit-cards$/i,
      /\/credit-cards\/(services|block-)/i,
      /business-credit-cards/i,
      /\/(apply|eligibility|fees|compare)\b/i,
    ],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'Axis',
    displayName: 'Axis Bank',
    // Detail pages: /cards/credit-card/<slug>. Verified via probe.
    listingUrls: ['https://www.axis.bank.in/cards/credit-card'],
    sitemapUrl: 'https://www.axis.bank.in/sitemap-english.xml',
    cardUrlPattern: /\/cards\/credit-card\/[a-z0-9-]+$/i,
    blocklist: [/\/cards\/credit-card$/i, /\/blogs\//i, /commercial/i],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'ICICI',
    displayName: 'ICICI Bank',
    // Detail pages: /personal-banking/cards/credit-card/<slug>. Verified via probe.
    listingUrls: ['https://www.icici.bank.in/personal-banking/cards/credit-card'],
    sitemapUrl: 'https://www.icici.bank.in/sitemap',
    cardUrlPattern: /\/personal-banking\/cards\/credit-card\/[a-z0-9-]+$/i,
    blocklist: [/\/cards\/credit-card$/i, /\/(nri-banking|business-banking)\//i, /compare/i],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'SBI',
    displayName: 'SBI Card',
    listingUrls: [
      'https://www.sbicard.com/en/personal/credit-cards.page',
      'https://www.sbicard.com/en/personal/credit-cards/shopping.page',
      'https://www.sbicard.com/en/personal/credit-cards/travel.page',
      'https://www.sbicard.com/en/personal/credit-cards/rewards.page',
    ],
    sitemapUrl: 'https://www.sbicard.com/sitemap.xml',
    cardUrlPattern: /\/credit-cards\/[a-z0-9/-]+\.page$/i,
    // /hi/ = Hindi-language duplicates of the /en/ cards — same card name → same
    // slug → unique-constraint collision on insert. Drop them.
    blocklist: [/\/hi\//i, /credit-cards\.page$/i, /\/(shopping|travel|rewards|fuel|lifestyle|dining)\.page$/i],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'Amex',
    displayName: 'American Express',
    // Amex splits its portfolio: rewards/travel cards under /in/credit-cards/, and
    // the Platinum/Gold CHARGE cards under /in/charge-cards/. Crawl + match both.
    listingUrls: [
      'https://www.americanexpress.com/in/credit-cards/all-cards',
      'https://www.americanexpress.com/in/credit-cards/',
      'https://www.americanexpress.com/in/charge-cards/',
      'https://www.americanexpress.com/in/charge-cards/all-cards',
    ],
    sitemapUrl: 'https://www.americanexpress.com/in/sitemap/personal.page',
    cardUrlPattern: /\/in\/(credit-cards|charge-cards)\/[a-z0-9-]+\/?$/i,
    blocklist: [
      /\/(credit-cards|charge-cards)\/?$/i,
      /\/(credit-cards|charge-cards)\/(all-cards|manage-your-card|card-types|card-selector)\b/i,
      /\/(compare|apply)\b/i,
    ],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'HSBC',
    displayName: 'HSBC India',
    listingUrls: ['https://www.hsbc.co.in/credit-cards/'],
    sitemapUrl: 'https://www.hsbc.co.in/sitemap',
    cardUrlPattern: /\/credit-cards\/products\/[a-z0-9-]+\/?$/i,
    blocklist: [/credit-cards\/?$/i, /\/(apply|compare)\b/i],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'Federal Bank',
    displayName: 'Federal Bank',
    // Flat URLs ending in -credit-card, e.g. /visa-celesta-credit-card. Verified.
    listingUrls: ['https://www.federal.bank.in/credit-cards'],
    sitemapUrl: 'https://www.federal.bank.in/sitemap.xml',
    cardUrlPattern: /federal\.bank\.in\/[a-z0-9-]+-credit-card$/i,
    blocklist: [/credit-card-emi/i, /co-branded/i, /debit/i],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'Unity SFB',
    displayName: 'Unity Small Finance Bank',
    // Detail pages: /personal-banking/cards/credit-card/<slug>. Verified via probe.
    listingUrls: ['https://unity.bank.in/personal-banking/cards/credit-card'],
    sitemapUrl: 'https://unity.bank.in/sitemap.xml',
    cardUrlPattern: /\/cards\/credit-card\/[a-z0-9-]+$/i,
    blocklist: [/\/cards\/credit-card$/i, /debit/i],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'Kotak',
    displayName: 'Kotak Mahindra Bank',
    listingUrls: ['https://www.kotak.bank.in/en/personal-banking/cards/credit-cards.html'],
    sitemapUrl: 'https://www.kotak.bank.in/sitemap-index.xml',
    cardUrlPattern: /\/cards\/credit-cards\/[a-z0-9-]+\.html$/i,
    blocklist: [
      /credit-cards\.html$/i,
      /\/credit-cards\/(credit-card-services|kotak-billpay)/i,
      /\/(apply|compare|fees)\b/i,
    ],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'IDFC FIRST',
    displayName: 'IDFC FIRST Bank',
    listingUrls: ['https://www.idfcfirst.bank.in/credit-card'],
    sitemapUrl: 'https://www.idfcfirstbank.com/sitemap.xml',
    cardUrlPattern: /\/credit-card\/[a-z0-9-]+/i,
    blocklist: [/\/credit-card\/?$/i, /\/(apply|eligibility|compare|fees)\b/i],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'Standard Chartered',
    displayName: 'Standard Chartered',
    aliases: ['sc', 'stanchart'],
    listingUrls: ['https://www.sc.com/in/credit-cards/'],
    sitemapUrl: 'https://www.sc.com/in/sitemap.xml',
    cardUrlPattern: /\/in\/credit-cards\/[a-z0-9-]+\/?$/i,
    blocklist: [
      /\/credit-cards\/?$/i,
      /\/credit-cards\/(loan-on|balance-on|kuch-bhi-on|payment-option|.*-on-emi)/i,
      /\/(apply|compare|all)\b/i,
    ],
    expandSelectors: COMMON_EXPAND,
  },
  {
    issuer: 'AU',
    displayName: 'AU Small Finance Bank',
    listingUrls: ['https://www.au.bank.in/personal-banking/credit-cards'],
    sitemapUrl: 'https://www.au.bank.in/sitemap.xml',
    cardUrlPattern: /\/personal-banking\/credit-cards\/[a-z0-9-]+/i,
    blocklist: [/credit-cards\/?$/i, /\/(apply|eligibility|compare)\b/i],
    expandSelectors: COMMON_EXPAND,
  },
]

// ── cardinsider.com — multi-issuer aggregator ──────────────────────────────
// Server-rendered WordPress site with a clean "at a glance" fee/reward box on
// every card page (~525 cards across ALL issuers). Used in HYBRID mode to fill
// gaps the official *.bank.in SPAs leave (fees not rendered) and to cover issuers
// we don't scrape directly. URL shape: cardinsider.com/<issuer-slug>/<card-slug>/.

// First path segment → canonical issuer. Overlap issuers MUST match the official
// BANKS[].issuer strings exactly, so promote.ts dedups cardinsider cards against
// existing official rows instead of duplicating them.
const CARDINSIDER_ISSUERS: Record<string, string> = {
  // overlap with official scrapers (canonical strings must match above)
  'hdfc-bank': 'HDFC',
  'axis-bank': 'Axis',
  'sbi-card': 'SBI',
  'icici-bank': 'ICICI',
  kotak: 'Kotak',
  'idfc-first-bank': 'IDFC FIRST',
  'standard-chartered': 'Standard Chartered',
  hsbc: 'HSBC',
  'hsbc-bank': 'HSBC',
  'american-express': 'Amex',
  amex: 'Amex',
  'au-small-finance-bank': 'AU',
  'au-bank': 'AU',
  'federal-bank': 'Federal Bank',
  unity: 'Unity SFB',
  'unity-small-finance-bank': 'Unity SFB',
  // issuers cardinsider adds beyond our official set
  'bank-of-baroda': 'Bank of Baroda',
  bobcard: 'Bank of Baroda',
  'punjab-national-bank': 'PNB',
  'indusind-bank': 'IndusInd',
  'rbl-bank': 'RBL',
  'yes-bank': 'YES Bank',
  'idbi-bank': 'IDBI',
  'canara-bank': 'Canara',
  'union-bank': 'Union Bank',
  'indian-bank': 'Indian Bank',
  'bank-of-india': 'Bank of India',
  'idfc-first': 'IDFC FIRST',
}

function cardinsiderIssuer(url: string): string | null {
  const m = url.match(/cardinsider\.com\/([a-z0-9-]+)\/[a-z0-9-]+\/?$/i)
  if (!m) return null
  return CARDINSIDER_ISSUERS[m[1].toLowerCase()] ?? null // unknown 1st segment → not a card page (blog/category/forex/business)
}

const CARDINSIDER: BankConfig = {
  issuer: 'CardInsider', // placeholder; real issuer comes from resolveIssuer per URL
  displayName: 'CardInsider (aggregator)',
  aliases: ['ci', 'cardinsider'],
  listingUrls: [],
  sitemapUrl: 'https://cardinsider.com/sitemap_index.xml',
  cardUrlPattern: /cardinsider\.com\/[a-z0-9-]+\/[a-z0-9-]+\/?$/i,
  blocklist: [/\/wp-content\//i, /\/(blog|web-stories|news|author|category|tag)\//i],
  expandSelectors: [], // server-rendered — nothing to expand
  resolveIssuer: cardinsiderIssuer,
}

BANKS.push(CARDINSIDER)

export function getBank(key: string): BankConfig | undefined {
  const k = key.toLowerCase().trim()
  return BANKS.find(
    (b) =>
      b.issuer.toLowerCase() === k ||
      b.issuer.toLowerCase().replace(/\s+/g, '') === k.replace(/\s+/g, '') ||
      b.aliases?.includes(k) ||
      b.displayName.toLowerCase().includes(k)
  )
}
