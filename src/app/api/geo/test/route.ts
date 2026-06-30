import { PROMPTS } from "@/lib/geo"

export const maxDuration = 60

// 4 models for the test — Perplexity is trial-only here until confirmed working
const TEST_MODELS = [
  { label: "chatgpt",    id: "openai/gpt-4o-mini:online" },
  { label: "gemini",     id: "google/gemini-2.5-flash-lite:online" },
  { label: "claude",     id: "anthropic/claude-3-haiku:online" },
] as const

export async function GET() {
  const prompt = PROMPTS[0]

  const userContent = `${prompt.text}

Search the web and return ONLY a JSON code block with this exact structure:
\`\`\`json
{"r":[{"n":"Business Name","r":1},{"n":"Another","r":2}],"s":["https://url1.com","https://url2.com"]}
\`\`\`

"r" = top 20 ranked results in order. "s" = every URL you used from your web search. No other text.`

  const results = await Promise.allSettled(
    TEST_MODELS.map(async ({ label, id: modelId }) => {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.open_router}`,
          "Content-Type":  "application/json",
          "HTTP-Referer":  "https://weddingtheory.co.in",
          "X-Title":       "Wedding Theory Analytics",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: "You are a helpful assistant with web search access. Always search before answering." },
            { role: "user",   content: userContent },
          ],
        }),
      })

      const body = await res.json()
      const message     = body?.choices?.[0]?.message ?? {}
      const content     = message?.content ?? ""
      const annotations = message?.annotations ?? []

      // Perplexity returns citations as a top-level array of URLs
      const citations: unknown[]     = body?.citations ?? []
      // Some models return search_results at top level too
      const searchResults: unknown[] = body?.search_results ?? []

      // Extract JSON from content
      const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr    = fenceMatch ? fenceMatch[1].trim() : content.trim()
      let parsed: unknown = null
      try { parsed = JSON.parse(jsonStr) } catch { parsed = null }

      // Show top-level keys in body so we can spot any new fields Perplexity adds
      const bodyTopLevelKeys = Object.keys(body ?? {})

      return {
        model:            label,
        modelId,
        httpStatus:       res.status,
        errorBody:        res.ok ? undefined : body,
        rawContent:       content,
        // Sources from 3 different places — so we can compare which model uses which
        annotations,                    // OpenAI-style (ChatGPT, some others)
        citations,                      // Perplexity-style (top-level URL array)
        searchResults,                  // some models put full search results here
        bodyTopLevelKeys,               // full list of what Perplexity returns at root
        parsed,
      }
    })
  )

  const output = results.map((r, i) => {
    const label = TEST_MODELS[i].label
    if (r.status === "rejected") return { model: label, error: String(r.reason) }
    return r.value
  })

  return Response.json({ prompt: prompt.text, results: output }, { status: 200 })
}
