"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Smartphone, TrendingUp } from "lucide-react"

interface Metricas {
  temMtmAuto: boolean
  dias: number
  acesso: { subscricao: string; isento: boolean; manual: boolean }
  contas: { rotulo: string; estado: string; demo: boolean; copiaAtiva: boolean }[]
  resumo: {
    total: number; abertas: number; fechadas: number; naoAbriram: number
    resultado: number; pips: number; winrate: number | null
    melhor: number | null; pior: number | null
  }
  curva: { quando: string; valor: number }[]
  estrategias: { nome: string; trades: number; winrate: number | null; resultado: number; pips: number }[]
  ultimas: { id: string; symbol: string; estado: string; resultado: number | null; pips: number | null; estrategia: string; motivo: string | null; quando: string }[]
}

const PERIODOS = [7, 30, 90] as const

/** Curva acumulada em SVG — sem biblioteca, e com a linha do zero sempre à vista. */
function Curva({ pontos }: { pontos: { valor: number }[] }) {
  if (pontos.length < 2) return null
  const v = pontos.map((p) => p.valor)
  const max = Math.max(0, ...v)
  const min = Math.min(0, ...v)
  const amp = max - min || 1
  const L = 100, A = 40
  const x = (i: number) => (i / (pontos.length - 1)) * L
  const y = (n: number) => A - ((n - min) / amp) * A
  const linha = v.map((n, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(n).toFixed(2)}`).join(" ")
  const fim = v[v.length - 1]
  const cor = fim >= 0 ? "#28C878" : "#FF4D4D"
  return (
    <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" className="mt-3 h-20 w-full">
      <line x1="0" x2={L} y1={y(0)} y2={y(0)} stroke="#ffffff" strokeOpacity="0.15" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
      <path d={`${linha} L${L},${y(min)} L0,${y(min)} Z`} fill={cor} fillOpacity="0.12" />
      <path d={linha} fill="none" stroke={cor} strokeWidth="1.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * Painel MTM Auto dentro do terminal do site.
 *
 * Só aparece a quem TEM MTM Auto. Mostrar um painel vazio a quem não a usa seria publicidade
 * disfarçada de métrica — e o terminal é para ver a conta, não para vender.
 */
export default function PainelMtmAuto({ accessToken }: { accessToken: string }) {
  const [dados, setDados] = useState<Metricas | null>(null)
  const [dias, setDias] = useState<number>(30)
  const [aCarregar, setACarregar] = useState(true)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setACarregar(true)
      const r = await fetch(`/api/mtmcopy/mtmauto-metrics?dias=${dias}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const j = await r.json().catch(() => null)
      if (!cancelado) {
        setDados(j?.temMtmAuto ? j : null)
        setACarregar(false)
      }
    })()
    return () => { cancelado = true }
  }, [accessToken, dias])

  if (aCarregar && !dados) return null
  if (!dados) return null

  const r = dados.resumo
  const positivo = r.resultado >= 0

  return (
    <section className="mt-8 rounded-2xl border border-[#D2A63C]/25 bg-zinc-950/40 p-1">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 px-4 py-2">
        <span className="flex items-center gap-2 text-xs text-zinc-400">
          <Smartphone className="h-3.5 w-3.5 text-[#D2A63C]" />
          MTM Auto · a app a trabalhar na tua conta
        </span>
        <div className="flex items-center gap-1.5">
          {PERIODOS.map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                dias === d ? "bg-[#D2A63C] text-black" : "border border-zinc-800 text-zinc-500 hover:text-white"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Resultado</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: positivo ? "#28C878" : "#FF4D4D" }}>
              {positivo ? "+" : ""}{r.resultado.toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Pips</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums" style={{ color: r.pips >= 0 ? "#28C878" : "#FF4D4D" }}>
              {r.pips >= 0 ? "+" : ""}{r.pips}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Acerto</p>
            {/* Sem trades fechadas, um traço — um 0% inventado entra nas médias e mente. */}
            <p className="mt-0.5 text-xl font-bold text-white tabular-nums">{r.winrate != null ? `${r.winrate}%` : "—"}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Trades</p>
            <p className="mt-0.5 text-xl font-bold text-white tabular-nums">{r.fechadas}</p>
            <p className="text-[10px] text-zinc-500">{r.abertas} abertas · {r.naoAbriram} não abriram</p>
          </div>
        </div>

        <Curva pontos={dados.curva} />

        {dados.estrategias.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">Por estratégia</p>
            <div className="space-y-1.5">
              {dados.estrategias.map((e) => (
                <div key={e.nome} className="flex items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{e.nome}</p>
                    <p className="text-[11px] text-zinc-500">
                      {e.trades} trades{e.winrate != null ? ` · ${e.winrate}% acerto` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums" style={{ color: e.resultado >= 0 ? "#28C878" : "#FF4D4D" }}>
                      {e.resultado >= 0 ? "+" : ""}{e.resultado.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-zinc-500 tabular-nums">{e.pips >= 0 ? "+" : ""}{e.pips} pips</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/60 pt-4">
          <p className="text-[11px] text-zinc-500">
            {dados.contas.length
              ? dados.contas.map((c) => `${c.rotulo}${c.demo ? " (demo)" : ""} · ${c.estado === "connected" ? "ligada" : "sem ligação"}`).join(" · ")
              : "Sem conta de corretora ligada na app."}
            {dados.acesso.isento && " · mensalidade isenta"}
          </p>
          <Link
            href="https://mtm-auto.vercel.app/sinais"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D2A63C]/40 px-3 py-1.5 text-xs font-semibold text-[#D2A63C] hover:bg-[#D2A63C]/10"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Abrir a MTM Auto
          </Link>
        </div>
      </div>
    </section>
  )
}
