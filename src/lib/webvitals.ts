import type { RumVitalsDay } from "@/lib/cloudflare"

// Score = 92 + 8 * e^(-λ * max(0, Value - Base)) — bounded to [92, 100], never crashes into
// the red even on bad days. Base = ideal threshold (anything better scores 100). Lambda
// controls how gently the score decays as the metric gets worse.
function expScore(value: number, base: number, lambda: number): number {
  return 92 + 8 * Math.exp(-lambda * Math.max(0, value - base))
}

interface MetricConfig {
  base:   number
  lambda: number
  toUnit: (raw: number) => number   // Cloudflare returns microseconds for timing metrics
}

const METRICS: Record<"lcp" | "fcp" | "ttfb" | "inp" | "cls", MetricConfig> = {
  lcp:  { base: 1.0, lambda: 0.25,  toUnit: us => us / 1_000_000 }, // seconds
  fcp:  { base: 0.8, lambda: 0.35,  toUnit: us => us / 1_000_000 }, // seconds
  ttfb: { base: 0.2, lambda: 0.45,  toUnit: us => us / 1_000_000 }, // seconds
  inp:  { base: 50,  lambda: 0.004, toUnit: us => us / 1_000     }, // ms
  cls:  { base: 0.0, lambda: 2.5,   toUnit: raw => raw           }, // unitless, no conversion
}

// Daily Performance Score (92-100) from a day's p75 quantiles. Metrics missing / null /
// undefined / -1 (Cloudflare's "not enough samples" sentinel) are excluded entirely.
// Returns null if every metric is missing that day.
export function computeDailyPerformanceScore(q: RumVitalsDay["quantiles"]): number | null {
  const raw: Record<keyof typeof METRICS, number | null | undefined> = {
    lcp:  q.largestContentfulPaintP75,
    fcp:  q.firstContentfulPaintP75,
    ttfb: q.timeToFirstByteP75,
    inp:  q.interactionToNextPaintP75,
    cls:  q.cumulativeLayoutShiftP75,
  }

  const scores: number[] = []
  for (const key of Object.keys(METRICS) as Array<keyof typeof METRICS>) {
    const v = raw[key]
    if (v === null || v === undefined || v === -1) continue
    const cfg = METRICS[key]
    scores.push(expScore(cfg.toUnit(v), cfg.base, cfg.lambda))
  }

  if (scores.length === 0) return null

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return Math.round(avg * 10) / 10
}
