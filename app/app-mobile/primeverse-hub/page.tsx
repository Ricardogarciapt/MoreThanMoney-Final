"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ExternalLink, Loader2, Globe } from "lucide-react"

/**
 * PrimeVerse Hub — navegável DENTRO da app, como se fosse a app da PrimeVerse.
 *
 * O hub.primeverse.ca envia `Content-Security-Policy: frame-ancestors 'self' ...replit...`,
 * ou seja NÃO pode ser embebido num <iframe> a partir do nosso domínio. Por isso abrimos
 * o hub no IN-APP BROWSER nativo (@capacitor/browser → SFSafariViewController / Chrome
 * Custom Tabs), que é totalmente navegável e mantém o utilizador dentro da app MTM.
 * No web (fora da app nativa), abre numa nova aba.
 */
const HUB_URL = "https://hub.primeverse.ca"

type CapWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Browser?: { open: (o: { url: string; presentationStyle?: string }) => Promise<void> } } }
}

export default function PrimeverseHubPage() {
  const router = useRouter()
  const [opening, setOpening] = useState(true)
  const openedOnce = useRef(false)

  const openHub = useCallback(async () => {
    const w = window as CapWindow
    const cap = w.Capacitor
    const isNative = cap?.isNativePlatform?.() === true
    if (isNative && cap?.Plugins?.Browser) {
      // In-app browser nativo — navegável, dentro da app.
      try {
        await cap.Plugins.Browser.open({ url: HUB_URL, presentationStyle: "fullscreen" })
      } catch {
        window.open(HUB_URL, "_blank", "noopener,noreferrer")
      }
    } else {
      // Web: nova aba (o hub bloqueia iframing).
      window.open(HUB_URL, "_blank", "noopener,noreferrer")
    }
    setOpening(false)
  }, [])

  // Abre automaticamente ao entrar (tocar em "PrimeVerse Hub" → hub abre).
  useEffect(() => {
    if (openedOnce.current) return
    openedOnce.current = true
    void openHub()
  }, [openHub])

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

      {/* Launcher */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#D2A63C]/15 flex items-center justify-center">
          {opening ? <Loader2 className="w-7 h-7 animate-spin text-[#D2A63C]" /> : <Globe className="w-8 h-8 text-[#D2A63C]" />}
        </div>
        <div>
          <p className="text-base font-bold">PrimeVerse Hub</p>
          <p className="text-[13px] text-zinc-400 mt-1 max-w-xs">
            {opening ? "A abrir o hub dentro da app…" : "Toca para abrir o PrimeVerse Hub — navega como se fosse a app da PrimeVerse, sem sair do MTM."}
          </p>
        </div>
        <button
          onClick={openHub}
          className="inline-flex items-center gap-2 rounded-xl bg-[#D2A63C] text-black font-bold text-[14px] px-6 py-3 active:scale-[0.98] transition-transform"
        >
          <Globe className="w-4 h-4" /> Abrir PrimeVerse Hub
        </button>
        {/* Depois do registo no hub/PU Prime, o passo seguinte é dar o UID: é com ele (e o email)
            que o PrimeGate confirma que a conta ficou no ramo MTM. Sem este atalho a pessoa
            registava-se e ficava por ali. */}
        <a
          href="/app-mobile/accountopen"
          className="text-[13px] text-[#E9C46A] underline underline-offset-4"
        >
          Já te registaste? Confirma aqui a tua conta PU Prime (UID)
        </a>
      </div>
    </div>
  )
}
