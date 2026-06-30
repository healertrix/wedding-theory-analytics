import { redis } from "@/lib/redis"
import { computeModelSummary } from "@/lib/geo"
import type { GeoRunResult, GeoScoreSnapshot } from "@/lib/geo"
import { GeoSection } from "./GeoSection"

export async function GeoSectionLoader({ days }: { days: number }) {
  const cutoffTs = Date.now() - days * 24 * 60 * 60 * 1000

  // Fetch score history for range + latest full run in parallel
  const [[latestDate], rawScores] = await Promise.all([
    redis.zrange("geo:dates",  0, 0, { rev: true }) as Promise<string[]>,
    redis.zrange("geo:scores", cutoffTs, "+inf", { byScore: true }) as Promise<GeoScoreSnapshot[]>,
  ])

  const latestRun = latestDate
    ? await redis.get<GeoRunResult>(`geo:run:${latestDate}`)
    : null

  let scoreHistory: GeoScoreSnapshot[] = rawScores ?? []

  // Fallback: geo:scores empty (before first new-format cron run).
  // Compute scores from latestRun if it falls within the selected range.
  if (scoreHistory.length === 0 && latestRun) {
    const runDate    = new Date(latestRun.runAt).toISOString().slice(0, 10)
    const cutoffDate = new Date(cutoffTs).toISOString().slice(0, 10)
    if (runDate >= cutoffDate) {
      scoreHistory = [{
        date: runDate,
        scores: {
          chatgpt: computeModelSummary("chatgpt", latestRun).score,
          gemini:  computeModelSummary("gemini",  latestRun).score,
          claude:  computeModelSummary("claude",  latestRun).score,
        },
      }]
    }
  }

  return (
    <GeoSection
      latestRun={latestRun ?? null}
      scoreHistory={scoreHistory}
      hasAnyData={!!latestDate}
      days={days}
    />
  )
}
