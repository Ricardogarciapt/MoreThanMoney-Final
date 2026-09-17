"use client"

import { useEffect, useState } from "react"
import { Download, Share, X } from "lucide-react"
import { isNativeApp } from "@/hooks/use-capacitor"

/**
 * «ADICIONAR AO ECRÃ PRINCIPAL» — o WebTrader como app própria (MTM WebTrader, /webtrader).
 *
 * · Android/Chrome/Edge: o browser dispara `beforeinstallprompt` quando a página é instalável;
 *   guarda-se o evento (logo ao carregar este módulo — ele chega cedo e só uma vez) e o botão
 *   chama `prompt()`.
 * · iOS Safari: não há API. Mostra-se a instrução: Partilhar → «Adicionar ao ecrã principal».
 * · Já instalada (display-mode standalone / navigator.standalone) ou dentro da app nativa
 *   MTM System (WKWebView/Capacitor): o botão não aparece.
 *
 * Dentro da app-mobile (contexto «embutido») a instalação tem de acontecer em /webtrader — o
 * manifesto da app-mobile instalaria a «MTM App» inteira, não o WebTrader. Por isso o botão leva
 * lá com `?instalar=1`, e é lá que o pedido do browser é feito.
 */

let eventoGuardado: any = null
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault()
    eventoGuardado = e
    window.dispatchEvent(new Event("mtm-webtrader-instalavel"))
  })
  window.addEventListener("appinstalled", () => { eventoGuardado = null })
}

function jaInstalada() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true
  } catch {
    return false
  }
}
function nativa() {
  try {
    return isNativeApp() || /MTMNativeApp|MTMAuto-(iOS|Android)/i.test(navigator.userAgent)
  } catch {
    return false
  }
}
const ios = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

export default function InstalarWebtrader({ contexto }: { contexto: "embutido" | "app" }) {
  const [visivel, setVisivel] = useState(false)
  const [folha, setFolha] = useState<"ios" | "outro" | null>(null)
  const [podePedir, setPodePedir] = useState(false)

  useEffect(() => {
    if (nativa() || jaInstalada()) return
    setVisivel(true)
    setPodePedir(Boolean(eventoGuardado))
    const f = () => setPodePedir(Boolean(eventoGuardado))
    window.addEventListener("mtm-webtrader-instalavel", f)
    // Vindo da app-mobile com ?instalar=1: abre logo as instruções no iOS.
    if (contexto === "app" && new URLSearchParams(window.location.search).get("instalar") === "1" && ios()) setFolha("ios")
    return () => window.removeEventListener("mtm-webtrader-instalavel", f)
  }, [contexto])

  if (!visivel) return null

  const instalar = async () => {
    if (contexto === "embutido") {
      window.location.href = "/webtrader?instalar=1"
      return
    }
    if (eventoGuardado) {
      try {
        eventoGuardado.prompt()
        await eventoGuardado.userChoice
      } catch { /* o browser recusou */ }
      eventoGuardado = null
      setPodePedir(false)
      return
    }
    setFolha(ios() ? "ios" : "outro")
  }

  return (
    <>
      <button
        type="button"
        onClick={instalar}
        className="flex shrink-0 items-center gap-1 rounded-md border border-amber-400/40 bg-black/30 px-2 py-1 text-[11px] font-semibold text-amber-100"
        title={podePedir ? "Instalar o MTM WebTrader" : undefined}
      >
        <Download className="h-3.5 w-3.5" /> Adicionar ao ecrã principal
      </button>
      {folha && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-3" onClick={() => setFolha(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1E222D] p-4 text-[13px] text-zinc-200" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[15px] font-bold text-white">Instalar o MTM WebTrader</p>
              <button onClick={() => setFolha(null)} aria-label="fechar" className="text-zinc-400"><X className="h-4 w-4" /></button>
            </div>
            {folha === "ios" ? (
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Toca em <Share className="inline h-4 w-4 align-text-bottom text-[#2962FF]" /> <b>Partilhar</b> na barra do Safari.</li>
                <li>Escolhe <b>«Adicionar ao ecrã principal»</b>.</li>
                <li>Confirma com <b>Adicionar</b>. O WebTrader abre em ecrã inteiro, como uma app.</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Abre o menu do browser (<b>⋮</b> ou <b>⋯</b>).</li>
                <li>Escolhe <b>«Instalar app»</b> ou <b>«Adicionar ao ecrã principal»</b>.</li>
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  )
}
