import { redis } from "@/lib/redis"
import type { GeoRunResult } from "@/lib/geo"

export async function GET() {
  const [latestDate] = await redis.zrange("geo:dates", 0, 0, { rev: true })
  if (!latestDate) return Response.json(null)
  const data = await redis.get<GeoRunResult>(`geo:run:${latestDate}`)
  return Response.json(data ?? null)
}
