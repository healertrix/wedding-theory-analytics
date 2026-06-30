// ── Types ─────────────────────────────────────────────────────────────────────

export interface GeoSource {
  url: string
  title: string
}

export interface GeoRanking {
  n: string   // business name
  r: number   // rank 1–20
}

export interface ModelResult {
  position: number | null   // Wedding Theory rank, null = not found
  sources: GeoSource[]      // from API response annotations
  rankings: GeoRanking[]
  error?: string
}

export interface PromptResult {
  promptId: number
  promptText: string
  models: {
    chatgpt: ModelResult
    gemini:  ModelResult
    claude:  ModelResult
  }
}

export interface GeoRunResult {
  runAt: string   // ISO 8601
  prompts: PromptResult[]
}

export interface ModelSummary {
  score:        number          // 0–100 combining mention rate + avg position
  avgPosition:  number | null
  mentionCount: number          // how many of 6 prompts found Wedding Theory
  trend:        number | null   // delta vs previous run (negative = improved)
  sources:      GeoSource[]     // deduped across all prompts for this model
  promptResults: Array<{ promptId: number; position: number | null }>
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const PROMPTS = [
  { id: 1, text: "List the top 20 wedding photographers in Bangalore" },
  { id: 2, text: "List the top 20 wedding photography studios in Bangalore with prices" },
  { id: 3, text: "List the top 20 wedding cinematography companies in Bangalore" },
  { id: 4, text: "List the top 20 destination wedding photographers based in Bangalore" },
  { id: 5, text: "List the top 20 wedding photographers in Bangalore to hire in 2026" },
  { id: 6, text: "List the top 20 professional wedding photography and cinematography in KR Puram Bangalore" },
] as const

export const MODELS = {
  chatgpt: "openai/gpt-4o-mini:online",
  gemini:  "google/gemini-2.5-flash-lite:online",
  claude:  "anthropic/claude-3-haiku:online",
} as const

export type ModelKey = keyof typeof MODELS

export interface GeoScoreSnapshot {
  date:   string
  scores: Record<ModelKey, number>
}

// ── Helpers (pure, no I/O) ────────────────────────────────────────────────────

export function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") }
  catch { return url }
}


function extractPosition(rankings: GeoRanking[]): number | null {
  const match = rankings.find(item => item.n.toLowerCase().includes("wedding theory"))
  return match ? match.r : null
}

function extractSources(responseBody: unknown, parsed: Record<string, unknown>): GeoSource[] {
  const seen = new Set<string>()
  const sources: GeoSource[] = []

  function add(url: string, title?: string) {
    if (!url || seen.has(url)) return
    seen.add(url)
    sources.push({ url, title: title ?? getDomain(url) })
  }

  // Primary: "s" array from the AI's JSON response — works for all models
  if (Array.isArray(parsed?.s)) {
    for (const u of parsed.s as unknown[]) {
      if (typeof u === "string") add(u)
    }
  }

  // Supplement: OpenAI-style annotations — works for ChatGPT
  const body    = responseBody as Record<string, unknown>
  const choices = body?.choices as Array<Record<string, unknown>> | undefined
  const annotations = (choices?.[0]?.message as Record<string, unknown>)?.annotations as Array<Record<string, unknown>> | undefined ?? []
  for (const a of annotations) {
    if (a.type === "url_citation") {
      const c = a.url_citation as Record<string, string> | undefined
      if (c?.url) add(c.url, c.title)
    }
  }

  return sources
}

export function computeModelSummary(
  modelKey: ModelKey,
  current: GeoRunResult,
  previous?: GeoRunResult | null,
): ModelSummary {
  const positions = current.prompts.map(p => p.models[modelKey].position)
  const valid     = positions.filter((p): p is number => p !== null)

  const avgPosition = valid.length > 0
    ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
    : null

  // Prompt Score = ((21 - rank) / 20) × 100  →  unranked = 0
  // AI Model Score = sum of all 6 prompt scores / 6
  const score = Math.round(
    positions.reduce<number>((sum, pos) =>
      pos !== null ? sum + ((21 - pos) / 20) * 100 : sum, 0
    ) / PROMPTS.length
  )

  // Trend = score delta vs previous run — positive means improving
  const prevPositions = previous?.prompts.map(p => p.models[modelKey].position) ?? []
  const prevScore = previous
    ? Math.round(
        prevPositions.reduce<number>((sum, pos) =>
          pos !== null ? sum + ((21 - pos) / 20) * 100 : sum, 0
        ) / PROMPTS.length
      )
    : null
  const trend = prevScore !== null ? score - prevScore : null

  // Dedupe sources across all prompts
  const seen    = new Set<string>()
  const sources = current.prompts
    .flatMap(p => p.models[modelKey].sources)
    .filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true })

  return {
    score,
    avgPosition,
    mentionCount: valid.length,
    trend,
    sources,
    promptResults: current.prompts.map(p => ({
      promptId: p.promptId,
      position: p.models[modelKey].position,
    })),
  }
}

// ── OpenRouter call (server-only) ─────────────────────────────────────────────

function buildUserPrompt(promptText: string): string {
  return `${promptText}

Search the web and return ONLY a JSON code block with this exact structure:
\`\`\`json
{"r":[{"n":"Business Name","r":1},{"n":"Another","r":2}],"s":["https://url1.com","https://url2.com"]}
\`\`\`

"r" = top 20 ranked results in order. "s" = every URL you used from your web search. No other text.`
}

async function callModel(modelId: string, promptText: string): Promise<ModelResult> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization":  `Bearer ${process.env.open_router}`,
        "Content-Type":   "application/json",
        "HTTP-Referer":   "https://weddingtheory.co.in",
        "X-Title":        "Wedding Theory Analytics",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: "You are a helpful assistant with web search access. Always search before answering." },
          { role: "user",   content: buildUserPrompt(promptText) },
        ],
      }),
    })

    if (!res.ok) {
      return { position: null, sources: [], rankings: [], error: `HTTP ${res.status}` }
    }

    const body = await res.json()
    const raw  = (body as Record<string, unknown>)?.choices
    const content = ((raw as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown>)?.content as string ?? ""

    // Extract JSON from anywhere in the response (handles text before/after code block)
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    const cleaned = fenceMatch ? fenceMatch[1].trim() : content.trim()

    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(cleaned) }
    catch { return { position: null, sources: [], rankings: [], error: "JSON parse failed" } }

    const rankings: GeoRanking[] = Array.isArray(parsed?.r) ? (parsed.r as GeoRanking[]) : []
    const sources  = extractSources(body, parsed)
    const position = extractPosition(rankings)

    return { position, sources, rankings }
  } catch (e: unknown) {
    return { position: null, sources: [], rankings: [], error: (e as Error)?.message ?? "Unknown error" }
  }
}

// ── Run all 18 calls ──────────────────────────────────────────────────────────

export async function runGeo(): Promise<GeoRunResult> {
  type Call = { promptId: number; modelKey: ModelKey; modelId: string; promptText: string }
  const calls: Call[] = []

  for (const prompt of PROMPTS) {
    for (const [modelKey, modelId] of Object.entries(MODELS) as [ModelKey, string][]) {
      calls.push({ promptId: prompt.id, modelKey, modelId, promptText: prompt.text })
    }
  }

  const settled = await Promise.allSettled(calls.map(c => callModel(c.modelId, c.promptText)))

  const promptMap = new Map<number, PromptResult>()

  calls.forEach((call, i) => {
    const result: ModelResult = settled[i].status === "fulfilled"
      ? settled[i].value
      : { position: null, sources: [], rankings: [], error: "Promise rejected" }

    if (!promptMap.has(call.promptId)) {
      const prompt = PROMPTS.find(p => p.id === call.promptId)!
      promptMap.set(call.promptId, {
        promptId:   call.promptId,
        promptText: prompt.text,
        models: {
          chatgpt: { position: null, sources: [], rankings: [] },
          gemini:  { position: null, sources: [], rankings: [] },
          claude:  { position: null, sources: [], rankings: [] },
        },
      })
    }

    promptMap.get(call.promptId)!.models[call.modelKey] = result
  })

  return {
    runAt:   new Date().toISOString(),
    prompts: PROMPTS.map(p => promptMap.get(p.id)!),
  }
}
