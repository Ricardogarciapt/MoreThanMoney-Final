"use client"

import { useEffect, useState } from "react"
import { Keyboard, X } from "lucide-react"
import { useRascunho } from "./rascunho-ordem"
import { useUmClique } from "./um-clique"
import { useModoWebtrader } from "./modo-webtrader"

/**
 * ATALHOS DE TECLADO do WebTrader (modo PRO) — os de uma plataforma de secretária.
 *
 *   B / S        prepara COMPRA / VENDA e abre o resumo (a confirmação)
 *   Shift+B / S  com a negociação num clique LIGADA, envia logo (sem ela, abre o resumo como B/S)
 *   Enter        com o resumo aberto, confirma
 *   Esc          fecha o resumo → desarma a ferramenta de posição → limpa o rascunho
 *   F9           abre/foca o ticket
 *   Alt+1…4      1 gráfico · 2 lado a lado · 2 em cima/baixo · 4 gráficos
 *   Alt+M        alterna SIMPLE / PRO
 *   ?            esta ajuda
 *
 * As regras de confirmação são as mesmas dos botões: um atalho nunca salta a confirmação que o
 * botão pediria. Não reage enquanto se escreve num campo (senão escrever «BTCUSD» comprava).
 */

export type Layout = "1" | "2h" | "2v" | "4"
const LAYOUTS: Layout[] = ["1", "2h", "2v", "4"]

const aEscrever = (alvo: EventTarget | null) => {
  const el = alvo as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
}

export default function Atalhos({ podeNegociar, onF9, onLayout }: { podeNegociar: boolean; onF9: () => void; onLayout: (l: Layout) => void }) {
  const k = useRascunho()
  const umClique = useUmClique()
  const { modo, definir } = useModoWebtrader()
  const [ajuda, setAjuda] = useState(false)
  const [envioPendente, setEnvioPendente] = useState<"buy" | "sell" | null>(null)

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.altKey && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); onLayout(LAYOUTS[Number(e.code.slice(5)) - 1]); return }
      if (e.altKey && e.code === "KeyM") { e.preventDefault(); definir(modo === "pro" ? "simples" : "pro"); return }
      if (e.key === "F9") { e.preventDefault(); onF9(); return }
      if (aEscrever(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "?") { setAjuda((v) => !v); return }
      if (e.key === "Escape") {
        if (ajuda) return setAjuda(false)
        if (k.r.escolhido) return k.set({ escolhido: false })
        if (k.ferramenta) return k.setFerramenta(null)
        return k.limpar()
      }
      if (!podeNegociar) return
      if (e.code === "KeyB" || e.code === "KeyS") {
        e.preventDefault()
        const lado = e.code === "KeyB" ? "buy" : "sell"
        if (e.shiftKey && umClique.ligado) { k.set({ lado, visivel: true }); setEnvioPendente(lado); return }
        k.set({ lado, escolhido: true, visivel: true })
        return
      }
      if (e.key === "Enter" && k.r.escolhido && !k.temErros && !k.aEnviar) { e.preventDefault(); void k.enviar() }
    }
    window.addEventListener("keydown", f)
    return () => window.removeEventListener("keydown", f)
  })

  // Shift+B/S num clique: o lado muda primeiro (os níveis em pips/$ recalculam-se) e a ordem sai no render seguinte.
  useEffect(() => {
    if (!envioPendente || k.r.lado !== envioPendente) return
    setEnvioPendente(null)
    if (k.temErros || k.entrada == null) k.set({ escolhido: true })
    else void k.enviar()
  }, [envioPendente, k.r.lado]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ajuda) return (
    <button onClick={() => setAjuda(true)} title="Atalhos de teclado (?)" aria-label="atalhos de teclado" className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white">
      <Keyboard className="h-4 w-4" />
    </button>
  )
  const linhas: Array<[string, string]> = [
    ["B / S", "Compra / venda — abre o resumo"], ["Shift+B / S", "Envia logo (só com num clique ligado)"], ["Enter", "Confirma o resumo aberto"],
    ["Esc", "Fecha resumo · desarma ferramenta · limpa"], ["F9", "Ticket"], ["Alt+1…4", "1 · 2 lado a lado · 2 em pilha · 4 gráficos"], ["Alt+M", "SIMPLE / PRO"], ["?", "Esta ajuda"],
  ]
  return (
    <div className="fixed inset-0 z-[1002] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Atalhos de teclado" onClick={() => setAjuda(false)}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1E222D] p-4 text-[12.5px]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2"><Keyboard className="h-4 w-4 text-[#D2A63C]" /><p className="font-bold">Atalhos de teclado</p><button onClick={() => setAjuda(false)} className="ml-auto text-zinc-400" aria-label="fechar"><X className="h-4 w-4" /></button></div>
        {linhas.map(([t, d]) => (
          <div key={t} className="flex items-center justify-between gap-3 border-t border-white/5 py-1.5 first:border-0">
            <kbd className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-white">{t}</kbd><span className="text-right text-zinc-300">{d}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
