"use client"

import { useState } from "react"

export default function GeoTestPage() {
  const [status, setStatus]   = useState<"idle" | "running" | "done" | "error">("idle")
  const [output, setOutput]   = useState("")

  async function run() {
    setStatus("running")
    setOutput("")
    try {
      const res  = await fetch("/api/geo/test")
      const json = await res.json()
      setOutput(JSON.stringify(json, null, 2))
      setStatus("done")
    } catch (e: unknown) {
      setOutput(String(e))
      setStatus("error")
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-8 font-mono">
      <h1 className="text-white text-lg font-bold mb-2">GEO Test — 1 prompt × 3 models</h1>
      <p className="text-white/40 text-sm mb-6">
        Runs only prompt #1 against ChatGPT, Gemini, Claude. Shows raw response so you can see what each model returns.
      </p>

      <button
        onClick={run}
        disabled={status === "running"}
        className="px-5 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm
                   hover:bg-white/15 disabled:opacity-40 transition-colors mb-8"
      >
        {status === "running" ? "⏳  Running 3 calls… (may take 30s)" : "▶  Run Test"}
      </button>

      {status === "done" && (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-emerald-400 text-sm">✓ Done — copy everything below and paste it to Claude</span>
          <button
            onClick={() => navigator.clipboard.writeText(output)}
            className="px-3 py-1 text-xs rounded bg-white/10 border border-white/20 text-white/60 hover:text-white transition-colors"
          >
            Copy to clipboard
          </button>
        </div>
      )}

      {status === "error" && (
        <p className="text-red-400 text-sm mb-3">Error — see output below</p>
      )}

      {output && (
        <pre className="bg-[#111] border border-[#222] rounded-xl p-5 text-xs text-white/70 overflow-auto max-h-[80vh] whitespace-pre-wrap break-all select-all">
          {output}
        </pre>
      )}
    </div>
  )
}
