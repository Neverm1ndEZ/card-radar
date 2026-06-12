import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { Redis } from '@upstash/redis'
import { RecommendRequestSchema } from '@/lib/validators'
import { getRecommendations, hashRequest } from '@/services/recommendation'

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = RecommendRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.issues },
        { status: 400 }
      )
    }

    const request = parsed.data
    // Bump ENGINE_VERSION whenever the recommendation logic changes so stale cached
    // results are invalidated immediately (the hash only covers the request, not the code).
    const ENGINE_VERSION = 'v4'
    const cacheKey = `rec:${ENGINE_VERSION}:${hashRequest(request)}`

    // Try cache first
    if (redis) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT' },
        })
      }
    }

    const response = await getRecommendations(request)

    // Cache for 1 hour
    if (redis) {
      await redis.setex(cacheKey, 3600, response)
    }

    return NextResponse.json(response, {
      headers: { 'X-Cache': 'MISS' },
    })
  } catch (err) {
    console.error('[/api/recommend]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
