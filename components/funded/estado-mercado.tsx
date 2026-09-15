"use client"

import { useEffect, useState } from "react"
import { Users } from "lucide-react"
import type { SimboloFicha } from "./api"

/**
 * ESTADO DO MERCADO E SENTIMENTO de um símbolo — as duas informações que a TradeLocker põe ao lado
 * do nome: «aberto/fechado (fecha em 2h)» e a percentagem de traders comprados.
 *
 * Sessões: `funded_symbols.sessoes` são as tradeSessions da corretora em HORA DO SERVIDOR DELA. O
 * motor mede o desvio nos ticks; aqui usa-se o desvio típico da PU Prime (UTC+3 no verão, +2 no
 * inverno — aproximado pela regra europeia de mudança de hora). É um indicador, não uma trava: quem
 * trava ordens com o mercado fechado é o servidor (preço fresco ≤5 s).
 */

const DIAS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]

/** Desvio da hora do servidor da corretora (EET/EEST): +3h no horário de verão europeu, +2h fora. */
export function desvioCorretoraMin(agora: Date): number {
  const ano = agora.getUTCFullYear()
  const ultimoDomingo = (mes: number) => { const d = new Date(Date.UTC(ano, mes + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d }
  return agora >= ultimoDomingo(2) && agora < ultimoDomingo(9) ? 180 : 120
}

export interface EstadoSessao { aberto: boolean | null; mudaEmMin: number | null }

/** Aberto agora? E daqui a quantos minutos muda (fecha se aberto, abre se fechado), procurando 7 dias. */
export function estadoDaSessao(sessoes: SimboloFicha["sessoes"], agora = new Date()): EstadoSessao {
  if (!sessoes || !Object.keys(sessoes).length) return { aberto: null, mudaEmMin: null }
  const desvio = desvioCorretoraMin(agora)
  const emSessao = (t: Date) => {
    const b = new Date(t.getTime() + desvio * 60_000)
    const hms = b.toISOString().slice(11, 19)
    return (sessoes[DIAS[b.getUTCDay()]] ?? []).some((s) => hms >= s.from.slice(0, 8) && hms <= s.to.slice(0, 8))
  }
  const aberto = emSessao(agora)
  // Passos de 15 min até 7 dias: chega para «fecha em ~2h» sem calcular intervalos à mão.
  for (let m = 15; m <= 7 * 24 * 60; m += 15) {
    if (emSessao(new Date(agora.getTime() + m * 60_000)) !== aberto) return { aberto, mudaEmMin: m }
  }
  return { aberto, mudaEmMin: null }
}

const duracao = (m: number) => (m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`)

export function EstadoMercado({ simbolo, compacto }: { simbolo: SimboloFicha; compacto?: boolean }) {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => { const iv = setInterval(() => setAgora(new Date()), 60_000); return () => clearInterval(iv) }, [])
  const e = estadoDaSessao(simbolo.sessoes, agora)
  if (e.aberto == null) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] ${e.aberto ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-500/15 text-zinc-400"}`}
      title={e.mudaEmMin ? `${e.aberto ? "Fecha" : "Abre"} dentro de ${duracao(e.mudaEmMin)} (horário da corretora)` : undefined}>
      <span className={`h-1.5 w-1.5 rounded-full ${e.aberto ? "bg-emerald-400" : "bg-zinc-500"}`} />
      {e.aberto ? "Aberto" : "Fechado"}{!compacto && e.mudaEmMin ? ` · ${e.aberto ? "fecha" : "abre"} em ${duracao(e.mudaEmMin)}` : ""}
    </span>
  )
}

export function Sentimento({ symbol }: { symbol: string }) {
  const [s, setS] = useState<{ pctCompras: number | null; contas: number } | null>(null)
  useEffect(() => {
    let vivo = true
    const ir = () => fetch(`/api/mtmfunded/simulado/sentimento?symbol=${encodeURIComponent(symbol)}`).then((r) => r.json()).then((d) => vivo && setS(d)).catch(() => {})
    void ir()
    const iv = setInterval(() => { if (document.visibilityState !== "hidden") void ir() }, 60_000)
    return () => { vivo = false; clearInterval(iv) }
  }, [symbol])
  if (!s || s.pctCompras == null) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px]" title={`Posições abertas de ${s.contas} contas MTM Funded (volume)`}>
      <Users className="h-3 w-3 text-zinc-500" />
      <span className="text-emerald-300">{s.pctCompras}%</span>
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-rose-500/60"><span className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${s.pctCompras}%` }} /></span>
      <span className="text-rose-300">{100 - s.pctCompras}%</span>
    </span>
  )
}
