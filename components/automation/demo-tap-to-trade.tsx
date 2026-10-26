"use client"

import { useEffect, useState } from "react"

/**
 * O Tap to Trade a acontecer, dentro de uma moldura de telemóvel — em HTML, não em imagem, para
 * ficar nítido em qualquer ecrã e para o texto poder mudar sem refazer um ficheiro.
 *
 * Quatro tempos, os mesmos da app MTM Auto: o sinal chega, tu tocas, escolhes a conta, e a ordem
 * fica aberta na corretora com o motor a gerir. Os preços são de exemplo e dizem-no; resultados
 * não entram aqui (nenhum número de desempenho sem origem declarada).
 *
 * Com `prefers-reduced-motion` a demo pára no último tempo — quem pediu menos movimento vê o
 * resultado sem a animação a passar em ciclo.
 */
const TEMPOS = ["chega", "toque", "conta", "aberta"] as const
type Tempo = (typeof TEMPOS)[number]

const LEGENDA: Record<Tempo, string> = {
  chega: "1 · O sinal chega como notificação",
  toque: "2 · Revês e tocas em Tap to Trade",
  conta: "3 · Escolhes em que conta abre",
  aberta: "4 · Abre na corretora e o motor gere",
}

export default function DemoTapToTrade() {
  const [i, setI] = useState(0)

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setI(TEMPOS.length - 1)
      return
    }
    const id = window.setInterval(() => setI((n) => (n + 1) % TEMPOS.length), 2600)
    return () => window.clearInterval(id)
  }, [])

  const tempo = TEMPOS[i]
  const depoisDe = (t: Tempo) => i >= TEMPOS.indexOf(t)

  return (
    <figure className="mx-auto flex w-full max-w-[280px] flex-col items-center">
      <div className="w-full rounded-[2.2rem] border border-white/12 bg-[#08090C] p-2 shadow-[0_30px_80px_-28px_rgba(210,166,60,0.55)]">
        <div className="relative h-[470px] overflow-hidden rounded-[1.8rem] bg-[#0B0C10] px-3 pt-4">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/10" />

          {/* Notificação */}
          <div
            className={`absolute inset-x-3 top-8 z-20 rounded-2xl border border-white/10 bg-[#1A1C23]/95 p-3 shadow-xl backdrop-blur transition-all duration-500 ${
              tempo === "chega" ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
            }`}
            aria-hidden={tempo !== "chega"}
          >
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-[#D2A63C] text-[9px] font-black text-black">
                MTM
              </span>
              <p className="text-[10px] font-semibold text-white/80">MTM Auto · agora</p>
            </div>
            <p className="mt-1.5 text-[12px] font-bold text-white">Novo sinal · XAUUSD BUY</p>
            <p className="text-[10.5px] text-white/50">Toca para rever e abrir na tua conta.</p>
          </div>

          <p className="text-[15px] font-bold text-white">Sinais</p>
          <p className="text-[10px] text-white/40">Preços de exemplo</p>

          {/* Cartão do sinal */}
          <div className="mt-3 rounded-[1.05rem] bg-gradient-to-br from-[#D2A63C]/70 to-[#D2A63C]/15 p-[1.5px]">
            <div className="rounded-[1rem] bg-[#12141A] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-white">XAUUSD</span>
                <span className="rounded-full bg-[#28C878]/15 px-2 py-0.5 text-[9px] font-bold text-[#28C878]">BUY</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Campo nome="Entrada" valor="4 615.0" />
                <Campo nome="Stop" valor="4 610.0" cor="text-[#FF4D4D]" />
                <Campo nome="Alvo" valor="4 635.0" cor="text-[#28C878]" />
              </div>
              <div
                className={`mt-3 w-full rounded-xl py-2 text-center text-[12px] font-bold transition-all duration-300 ${
                  depoisDe("aberta")
                    ? "bg-[#28C878]/15 text-[#28C878]"
                    : tempo === "toque"
                      ? "scale-[0.97] bg-[#E9C46A] text-black ring-4 ring-[#D2A63C]/30"
                      : "bg-[#D2A63C] text-black"
                }`}
              >
                {depoisDe("aberta") ? "✓ Aberta na tua conta" : "Tap to Trade"}
              </div>
            </div>
          </div>

          <div className="relative mt-3 h-[150px]">
          {/* Escolha de conta */}
          <div
            className={`absolute inset-x-0 top-0 rounded-2xl border border-white/10 bg-[#12141A] p-3 transition-all duration-500 ${
              tempo === "conta" ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
            }`}
            aria-hidden={tempo !== "conta"}
          >
            <p className="text-[10px] uppercase tracking-[0.09em] text-white/40">Onde abrir</p>
            <div className="mt-2 space-y-1.5">
              <Conta nome="PU Prime · Real" marcada />
              <Conta nome="Demo" />
            </div>
          </div>

          {/* Gestão depois de aberta */}
          <div
            className={`absolute inset-x-0 top-0 space-y-1.5 transition-all duration-500 ${
              depoisDe("aberta") ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
            }`}
            aria-hidden={!depoisDe("aberta")}
          >
            <Gestao texto="Stop e alvos colocados na corretora" />
            <Gestao texto="Avisos de cada passo no telemóvel" />
            <Gestao texto="Breakeven, parciais e trailing pelo motor" />
          </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 h-5 text-center text-[13px] font-medium text-[#E9C46A]" aria-live="polite">
        {LEGENDA[tempo]}
      </figcaption>
    </figure>
  )
}

function Campo({ nome, valor, cor = "text-white" }: { nome: string; valor: string; cor?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.09em] text-white/40">{nome}</p>
      <p className={`text-[12px] font-semibold ${cor}`}>{valor}</p>
    </div>
  )
}

function Conta({ nome, marcada = false }: { nome: string; marcada?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-2.5 py-2 text-[11.5px] ${
        marcada ? "border-[#D2A63C]/60 bg-[#D2A63C]/10 text-white" : "border-white/10 text-white/50"
      }`}
    >
      {nome}
      <span className={`h-3.5 w-3.5 rounded-full border ${marcada ? "border-[#D2A63C] bg-[#D2A63C]" : "border-white/30"}`} />
    </div>
  )
}

function Gestao({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#12141A] px-2.5 py-2">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#28C878]" />
      <span className="text-[11px] text-white/75">{texto}</span>
    </div>
  )
}
