import { redis } from "@/lib/redis"
import { runGeo, computeModelSummary } from "@/lib/geo"
import type { GeoScoreSnapshot } from "@/lib/geo"

export const maxDuration = 60

async function runAndStore() {
  const result  = await runGeo()
  const dateStr = new Date().toISOString().slice(0, 10)
  const ts      = Date.now()
  const cutoff  = ts - 100 * 24 * 60 * 60 * 1000

  const snapshot: GeoScoreSnapshot = {
    date: dateStr,
    scores: {
      chatgpt: computeModelSummary("chatgpt", result).score,
      gemini:  computeModelSummary("gemini",  result).score,
      claude:  computeModelSummary("claude",  result).score,
    },
  }

  await Promise.all([
    redis.set(`geo:run:${dateStr}`, result, { ex: 8_640_000 }),
    redis.zadd("geo:dates",  { score: ts, member: dateStr }),
    redis.zadd("geo:scores", { score: ts, member: JSON.stringify(snapshot) }),
    redis.zremrangebyscore("geo:dates",  "-inf", cutoff),
    redis.zremrangebyscore("geo:scores", "-inf", cutoff),
  ])

  return result
}

// Vercel cron calls GET — protected by CRON_SECRET
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const result = await runAndStore()
  return Response.json(result)
}

// Manual trigger via curl — requires same CRON_SECRET
export async function POST(req: Request) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const result = await runAndStore()
  return Response.json(result)
}
