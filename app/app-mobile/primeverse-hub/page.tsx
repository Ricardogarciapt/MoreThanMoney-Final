"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ExternalLink, Loader2 } from "lucide-react"

/**
 * PrimeVerse Hub DENTRO da app (WebView/iframe) — o user não sai da app MTM.
 * Se o hub bloquear iframing (X-Frame-Options), o fallback abre em nova aba.
 */
const HUB_URL = "https://hub.primeverse.ca"

export default function PrimeverseHubPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      {/* Header MTM */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg text-zinc-300 hover:bg-zinc-800" aria-label="Voltar">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold leading-tight">PrimeVerse Hub</p>
          <p className="text-[11px] text-zinc-500 truncate">hub.primeverse.ca</p>
        </div>
        <a
          href={HUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg text-[#D2A63C] hover:bg-zinc-800"
          aria-label="Abrir em nova aba"
        >
          <ExternalLink className="w-4.5 h-4.5" />
        </a>
      </div>

      {/* WebView */}
      <div className="relative flex-1">
        {loading && !blocked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#D2A63C]" />
          </div>
        )}
        {blocked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <Globe />
            <p className="text-sm text-zinc-300">O PrimeVerse Hub não permite abrir aqui dentro.</p>
            <a
              href={HUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] px-5 py-2.5"
            >
              <ExternalLink className="w-4 h-4" /> Abrir PrimeVerse Hub
            </a>
          </div>
        ) : (
          <iframe
            src={HUB_URL}
            title="PrimeVerse Hub"
            className="absolute inset-0 w-full h-full border-0"
            onLoad={() => setLoading(false)}
            onError={() => setBlocked(true)}
            allow="clipboard-write; fullscreen"
          />
        )}
      </div>
    </div>
  )
}

function Globe() {
  return (
    <div className="w-14 h-14 rounded-full bg-[#D2A63C]/15 flex items-center justify-center">
      <span className="text-2xl">🌐</span>
    </div>
  )
}
