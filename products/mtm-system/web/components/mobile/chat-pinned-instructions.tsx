"use client"

import { useEffect, useState } from "react"
import { ChevronDown, Pin } from "lucide-react"

/**
 * Card FIXO de "como seguir os sinais" no topo de um canal de sinais.
 * Clicável para expandir/colapsar. Lê /api/chat/pinned-instructions?slug=<canal>.
 * Só aparece se o canal tiver instruções configuradas (site_settings.chat_pinned_instructions).
 */
type Instruction = { emoji?: string; title?: string; body?: string }

export default function ChatPinnedInstructions({ slug }: { slug: string | null | undefined }) {
  const [ins, setIns] = useState<Instruction | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setIns(null)
    setOpen(false)
    if (!slug) return
    let cancelled = false
    fetch(`/api/chat/pinned-instructions?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.instruction?.body) setIns(j.instruction as Instruction)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  if (!ins?.body) return null

  return (
    <div className="mx-3 mt-2 mb-1 rounded-xl border border-[#D2A63C]/40 bg-[#D2A63C]/[0.07] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Pin className="h-3.5 w-3.5 shrink-0 text-[#D2A63C]" />
        <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-[#e9cf8f]">
          {ins.emoji ? `${ins.emoji} ` : ""}
          {ins.title || "Como seguir os sinais"}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[#D2A63C]/80">{open ? "fechar" : "abrir"}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#D2A63C] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0.5 text-[12.5px] leading-relaxed text-gray-200 whitespace-pre-line border-t border-[#D2A63C]/20">
          {ins.body}
        </div>
      )}
    </div>
  )
}
