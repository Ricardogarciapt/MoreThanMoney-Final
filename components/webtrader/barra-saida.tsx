"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, LogOut } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { guardarOrigem, lerOrigem, origemDaQuery, type OrigemWebtrader } from "@/lib/webtrader/origem"

type Ponte = { postMessage: (m: unknown) => void }
const ponteDaCasca = (): Ponte | null =>
  (window as unknown as { webkit?: { messageHandlers?: { mtmautoWT?: Ponte } } }).webkit?.messageHandlers?.mtmautoWT ?? null

/**
 * Seta «voltar à app» (só quando se veio de uma app da casa — lib/webtrader/origem.ts).
 * Pedido do Ricardo, 22/11: vindo da MTM Auto não havia como regressar.
 */
export function VoltarApp() {
  const [origem, setOrigem] = useState<OrigemWebtrader | null>(null)
  useEffect(() => {
    const daQuery = origemDaQuery(window.location.search)
    if (daQuery) guardarOrigem(daQuery)
    setOrigem(daQuery ?? lerOrigem())
  }, [])
  if (!origem) return null
  const voltar = () => {
    if (origem.tipo === "casca") {
      const ponte = ponteDaCasca()
      try { ponte?.postMessage({ acao: "voltar" }) } catch { /* casca antiga */ }
      // Casca sem a acção «voltar» (build antiga): recua no histórico, que é onde está a MTM Auto.
      setTimeout(() => { if (document.visibilityState === "visible") window.history.back() }, 350)
      return
    }
    if (origem.url) window.location.href = origem.url
    else window.history.back()
  }
  return (
    <button type="button" onClick={voltar} title={`Voltar à ${origem.nome}`} aria-label={`Voltar à ${origem.nome}`}
      className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2 text-[12px] font-semibold text-[#E9C46A] hover:bg-white/5 [@media(pointer:coarse)]:h-10">
      <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{origem.nome}</span>
    </button>
  )
}

/**
 * Terminar sessão no WebTrader (pedido do Ricardo, 22/11): sai da conta MTM só NESTE dispositivo
 * (scope local — sair «global» terminaria também a sessão da app MTM Auto) e apaga as sessões das
 * contas abertas por credenciais (MTM Funded, TradeLocker, MT5) guardadas no navegador.
 */
export async function terminarSessaoWebtrader() {
  await Promise.race([supabase.auth.signOut({ scope: "local" }), new Promise((ok) => setTimeout(ok, 2000))]).catch(() => null)
  try {
    const { clearCachedSession } = await import("@/lib/auth-cache")
    clearCachedSession()
  } catch { /* sem cache */ }
  try {
    for (const k of Object.keys(localStorage)) if (/^(mtmfunded_sessoes|tradelocker_sessoes|webtrader_sessoes|mtmfunded_ultima_conta)/.test(k)) localStorage.removeItem(k)
    for (const k of Object.keys(sessionStorage)) if (/sess(oes|ao)/i.test(k) && k !== "webtrader_origem") sessionStorage.removeItem(k)
  } catch { /* modo privado */ }
  window.location.replace("/webtrader")
}

export function SairWebtrader({ compacto = false }: { compacto?: boolean }) {
  const [aSair, setASair] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  useEffect(() => { if (!confirmar) return; const t = setTimeout(() => setConfirmar(false), 4000); return () => clearTimeout(t) }, [confirmar])
  return (
    <button type="button" disabled={aSair}
      onClick={() => { if (!confirmar) { setConfirmar(true); return } setASair(true); void terminarSessaoWebtrader() }}
      title={confirmar ? "Toca outra vez para sair" : "Terminar sessão no WebTrader"} aria-label="Terminar sessão no WebTrader"
      className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[12px] font-semibold transition-colors [@media(pointer:coarse)]:h-10 ${confirmar ? "border-rose-400/60 bg-rose-500/15 text-rose-200" : "border-white/10 bg-black/40 text-zinc-400 hover:text-white"}`}>
      <LogOut className="h-4 w-4" /> {(!compacto || confirmar) && <span className={confirmar ? "" : "hidden md:inline"}>{confirmar ? "Sair?" : "Sair"}</span>}
    </button>
  )
}
