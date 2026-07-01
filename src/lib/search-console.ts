import { GoogleAuth } from "google-auth-library"
import fs from "fs"
import path from "path"

function loadCredentials() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
  }
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "google-credentials.json"), "utf8"))
}

const WMT   = "https://www.googleapis.com/webmasters/v3"
const SC_V1 = "https://searchconsole.googleapis.com/v1"

function fmtDate(d: Date) { return d.toISOString().split("T")[0] }

// Current period: last `daysBack` days ending yesterday
function buildRange(daysBack: number) {
  const end = new Date(); end.setDate(end.getDate() - 1)
  const start = new Date(); start.setDate(start.getDate() - daysBack)
  return { startDate: fmtDate(start), endDate: fmtDate(end) }
}

// Previous period: the `daysBack` days immediately before the current period (no overlap)
function buildPrevRange(daysBack: number) {
  const end = new Date(); end.setDate(end.getDate() - daysBack - 1)
  const start = new Date(); start.setDate(start.getDate() - daysBack * 2)
  return { startDate: fmtDate(start), endDate: fmtDate(end) }
}

async function getToken(): Promise<string | null> {
  try {
    const creds = loadCredentials()
    const auth = new GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] })
    const client = await auth.getClient()
    return (await client.getAccessToken()).token ?? null
  } catch { return null }
}

async function wmtGet(token: string, endpoint: string) {
  const r = await fetch(`${WMT}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 3600 },
  })
  return r.ok ? r.json() : null
}

async function scQuery(token: string, siteUrl: string, body: Record<string, unknown>) {
  const r = await fetch(`${WMT}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 3600 },
  })
  if (!r.ok) return null
  return r.json()
}

async function inspectUrl(token: string, inspectionUrl: string, siteUrl: string) {
  const r = await fetch(`${SC_V1}/urlInspection/index:inspect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl, siteUrl }),
    next: { revalidate: 3600 },
  })
  return r.ok ? r.json() : null
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SCRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SCTypeData {
  searchType: string
  // current period totals
  totalClicks: number
  totalImpressions: number
  avgCtr: number
  avgPosition: number
  // previous period totals (for change % badges)
  clicksPrev: number
  impressionsPrev: number
  ctrPrev: number
  positionPrev: number
  // daily trend for selected period
  byDate: SCRow[]
  topQueries: SCRow[]
  topPages:   SCRow[]
  byCountry:  SCRow[]
  byDevice:   SCRow[]
}

export interface Sitemap {
  path: string
  lastSubmitted: string
  lastDownloaded: string
  isPending: boolean
  isSitemapsIndex: boolean
  type: string
  warnings: number
  errors: number
  submitted: number
  indexed: number
}

export interface PageInspection {
  url: string
  verdict: string
  coverageState: string
  indexingState: string
  robotsTxtState: string
  lastCrawlTime: string
  pageFetchState: string
  crawledAs: string
  googleCanonical: string
  userCanonical: string
  mobileVerdict: string
  richResultsVerdict: string
}

export interface SCData {
  ok: boolean
  error?: string
  startDate: string
  endDate: string
  web:   SCTypeData
  image: SCTypeData
  video: SCTypeData
  news:  SCTypeData
  sitemaps: Sitemap[]
  pageInspections: PageInspection[]
}

function emptyType(searchType: string): SCTypeData {
  return {
    searchType,
    totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0,
    clicksPrev: 0, impressionsPrev: 0, ctrPrev: 0, positionPrev: 0,
    byDate: [], topQueries: [], topPages: [], byCountry: [], byDevice: [],
  }
}

function rows(r: unknown): SCRow[] { return (r as { rows?: SCRow[] })?.rows ?? [] }
function sumRow(r: unknown): SCRow | undefined { return rows(r)[0] }

async function fetchType(token: string, siteUrl: string, searchType: string, days: number): Promise<SCTypeData> {
  const { startDate, endDate }       = buildRange(days)
  const { startDate: sPrev, endDate: ePrev } = buildPrevRange(days)

  const base     = { startDate, endDate, searchType, rowLimit: 1000 }
  const basePrev = { startDate: sPrev, endDate: ePrev, searchType, rowLimit: 1, dimensions: [] as string[] }

  const [rSum, rSumPrev, rDate, rQuery, rPage, rCountry, rDevice] = await Promise.all([
    scQuery(token, siteUrl, { ...base, dimensions: [] }),
    scQuery(token, siteUrl, basePrev),
    scQuery(token, siteUrl, { ...base, dimensions: ["date"], rowLimit: days }),
    scQuery(token, siteUrl, { ...base, dimensions: ["query"] }),
    scQuery(token, siteUrl, { ...base, dimensions: ["page"] }),
    scQuery(token, siteUrl, { ...base, dimensions: ["country"], rowLimit: 20 }),
    scQuery(token, siteUrl, { ...base, dimensions: ["device"] }),
  ])

  const s     = sumRow(rSum)
  const sPrevData = sumRow(rSumPrev)

  return {
    searchType,
    totalClicks:      s?.clicks      ?? 0,
    totalImpressions: s?.impressions ?? 0,
    avgCtr:           s?.ctr         ?? 0,
    avgPosition:      s?.position    ?? 0,
    clicksPrev:       sPrevData?.clicks      ?? 0,
    impressionsPrev:  sPrevData?.impressions ?? 0,
    ctrPrev:          sPrevData?.ctr         ?? 0,
    positionPrev:     sPrevData?.position    ?? 0,
    byDate:    rows(rDate),
    topQueries: rows(rQuery),
    topPages:   rows(rPage),
    byCountry:  rows(rCountry),
    byDevice:   rows(rDevice),
  }
}

async function fetchSitemapUrls(sitemapPath: string): Promise<string[]> {
  try {
    const r = await fetch(sitemapPath, { next: { revalidate: 3600 } })
    if (!r.ok) return []
    const xml = await r.text()
    return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim())
  } catch { return [] }
}

function parseInspection(url: string, j: Record<string, unknown>): PageInspection {
  const res = (j as { inspectionResult?: Record<string, unknown> })?.inspectionResult ?? {}
  const idx  = (res.indexStatusResult      ?? {}) as Record<string, unknown>
  const mob  = (res.mobileUsabilityResult  ?? {}) as Record<string, unknown>
  const rich = (res.richResultsResult      ?? {}) as Record<string, unknown>
  return {
    url,
    verdict:           String(idx.verdict           ?? "UNKNOWN"),
    coverageState:     String(idx.coverageState     ?? "Unknown"),
    indexingState:     String(idx.indexingState     ?? "Unknown"),
    robotsTxtState:    String(idx.robotsTxtState    ?? "Unknown"),
    lastCrawlTime:     String(idx.lastCrawlTime     ?? ""),
    pageFetchState:    String(idx.pageFetchState    ?? "Unknown"),
    crawledAs:         String(idx.crawledAs         ?? ""),
    googleCanonical:   String(idx.googleCanonical   ?? ""),
    userCanonical:     String(idx.userCanonical     ?? ""),
    mobileVerdict:     String(mob.verdict           ?? "UNKNOWN"),
    richResultsVerdict: String(rich.verdict         ?? "UNKNOWN"),
  }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function getSearchConsoleData(days: number = 7): Promise<SCData | null> {
  const siteUrl = process.env.GOOGLE_SITE_URL?.trim()
  if (!siteUrl) return null

  const token = await getToken()
  const { startDate, endDate } = buildRange(days)

  if (!token) return {
    ok: false, error: "Auth failed — check google-credentials.json",
    startDate, endDate,
    web: emptyType("web"), image: emptyType("image"),
    video: emptyType("video"), news: emptyType("news"),
    sitemaps: [], pageInspections: [],
  }

  const [webData, imageData, videoData, newsData, smRaw] = await Promise.all([
    fetchType(token, siteUrl, "web", days),
    fetchType(token, siteUrl, "image", days),
    fetchType(token, siteUrl, "video", days),
    fetchType(token, siteUrl, "news", days),
    wmtGet(token, `/sites/${encodeURIComponent(siteUrl)}/sitemaps`),
  ])

  const sitemaps: Sitemap[] = ((smRaw as { sitemap?: Record<string, unknown>[] })?.sitemap ?? []).map(s => ({
    path:            String(s.path          ?? ""),
    lastSubmitted:   String(s.lastSubmitted ?? ""),
    lastDownloaded:  String(s.lastDownloaded ?? ""),
    isPending:       Boolean(s.isPending),
    isSitemapsIndex: Boolean(s.isSitemapsIndex),
    type:            String(s.type ?? "sitemap"),
    warnings:        Number(s.warnings ?? 0),
    errors:          Number(s.errors   ?? 0),
    submitted:       Number((s.contents as { submitted?: string }[])?.[0]?.submitted ?? 0),
    indexed:         Number((s.contents as { indexed?: string   }[])?.[0]?.indexed   ?? 0),
  }))

  return {
    ok: true, startDate, endDate,
    web: webData, image: imageData, video: videoData, news: newsData,
    sitemaps, pageInspections: [],
  }
}

// ─── Page inspection fetch ───────────────────────────────────────────────────

export async function getPageInspections(sitemapPath: string): Promise<PageInspection[]> {
  const siteUrl = process.env.GOOGLE_SITE_URL?.trim()
  if (!siteUrl || !sitemapPath) return []

  const token = await getToken()
  if (!token) return []

  const sitemapUrls = await fetchSitemapUrls(sitemapPath)
  const inspections: PageInspection[] = []
  for (const url of sitemapUrls.slice(0, 10)) {
    const j = await inspectUrl(token, url, siteUrl)
    if (j) inspections.push(parseInspection(url, j))
    await new Promise(r => setTimeout(r, 150))
  }
  return inspections
}
