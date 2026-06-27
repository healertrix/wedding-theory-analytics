"use client"

import { useRouter } from "next/navigation"

const PRESETS = [
  { label: "7D",  value: "7d"  },
  { label: "15D", value: "15d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
]

export function DateFilter({ current = "7d" }: { current?: string }) {
  const router = useRouter()

  function navigate(value: string) {
    router.push(`?range=${value}`, { scroll: false })
  }

  return (
    <div className="flex items-center gap-1 bg-[#0d0d0d] border border-[#222] rounded-lg p-1">
      {PRESETS.map(p => (
        <button
          key={p.value}
          onClick={() => navigate(p.value)}
          className={[
            "px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 select-none",
            current === p.value
              ? "bg-white/[0.1] text-white border border-white/[0.08]"
              : "text-white/40 hover:text-white/70 hover:bg-white/[0.05]",
          ].join(" ")}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
