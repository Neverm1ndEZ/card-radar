import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

type Db = NeonHttpDatabase<typeof schema>
let _instance: Db | null = null

function getInstance(): Db {
  if (!_instance) {
    _instance = drizzle({ client: neon(process.env.DATABASE_URL!), schema })
  }
  return _instance
}

// Proxy defers neon() call until first use — safe during Next.js build-time module evaluation
export const db = new Proxy({} as Db, {
  get(_, prop: string | symbol) {
    return (getInstance() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
