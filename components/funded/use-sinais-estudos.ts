"use client"

import { useEffect, useMemo, useState } from "react"
import { authHeaders } from "@/lib/auth-token"
import { scannerKeyFromStrategy } from "@/lib/mtm-alerts/scanners"
import { candidatosDeTicker } from "@/lib/mtmfunded/simulado/ordens"
import { ESTUDOS_WEBTRADER, type ChaveEstudoWebtrader, type EstudoWebtrader } from "@/lib/scanners/estudos"

/**
 * OS SINAIS DOS ESTUDOS MTM PARA O SÍMBOLO DO GRÁFICO.
 *
 * O gráfico de negociação (o nosso ou a biblioteca do TradingView) não corre scripts Pine — só o
 * widget gratuito os corre. Mas o que interessa ao trader são os SINAIS que esses estudos deram, e
 * esses já estão na base de dados: o webhook do TradingView grava-os em `tradingview_signals` e
 * /api/mtm-alerts normaliza-os (entrada, SL, TPs, estratégia, estado). É a mesma fonte dos alertas
 * da app, por isso uma seta no gráfico é sempre um alerta que o trader também recebeu.
 *
 * O ticker do alerta (OANDA:XAUUSD, XAUUSD.s…) passa pelo mesmo `candidatosDeTicker` do webhook
 * antes de se comparar com o símbolo do catálogo.
 *
 * Precisa de sessão MTM (os alertas são de membros); quem entrou só com login+password da conta
 * simulada não vê sinais — e também não tem estudos permitidos.
 */

export interface SinalEstudo {
  id: string
  estudo: EstudoWebtrader
  direcao: "buy" | "sell"
  entrada: number | null
  sl: number | null
  tp: number | null
  em: number // unix s
  ativo: boolean
}

const REFRESCO_MS = 60_000

export function useSinaisEstudos(symbol: string | null, ativos: ChaveEstudoWebtrader[]) {
  const [brutos, setBrutos] = useState<any[]>([])
  const ligado = ativos.length > 0 && Boolean(symbol)

  useEffect(() => {
    if (!ligado || !symbol) { setBrutos([]); return }
    let vivo = true
    const correr = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      try {
        const r = await fetch(`/api/mtm-alerts?symbol=${encodeURIComponent(symbol)}&limit=60`, {
          credentials: "include", cache: "no-store", headers: await authHeaders(),
        })
        if (!r.ok) return
        const d = await r.json()
        if (vivo) setBrutos(Array.isArray(d.alerts) ? d.alerts : [])
      } catch { /* sem sinais — o gráfico continua */ }
    }
    correr()
    const iv = setInterval(correr, REFRESCO_MS)
    return () => { vivo = false; clearInterval(iv) }
  }, [symbol, ligado])

  const sinais = useMemo<SinalEstudo[]>(() => {
    if (!symbol) return []
    const out: SinalEstudo[] = []
    for (const a of brutos) {
      if (a?.direction !== "buy" && a?.direction !== "sell") continue
      if (!candidatosDeTicker(String(a.ticker ?? a.tvSymbol ?? "")).includes(symbol)) continue
      const chaveAlerta = scannerKeyFromStrategy(a.strategy ?? a.alertName)
      const estudo = ESTUDOS_WEBTRADER.find((e) => e.alerta === chaveAlerta)
      if (!estudo || !ativos.includes(estudo.chave)) continue
      const em = Math.floor(new Date(a.createdAt).getTime() / 1000)
      if (!Number.isFinite(em)) continue
      const estado = String(a.tradeStatus ?? "active")
      out.push({
        id: String(a.id), estudo, direcao: a.direction,
        entrada: typeof a.entry === "number" ? a.entry : null,
        sl: typeof a.stopLoss === "number" ? a.stopLoss : null,
        tp: Array.isArray(a.takeProfits) && typeof a.takeProfits[0] === "number" ? a.takeProfits[0] : null,
        em, ativo: estado === "active" || estado === "pending",
      })
    }
    return out.sort((x, y) => x.em - y.em)
  }, [brutos, symbol, ativos])

  // O sinal «em jogo»: o mais recente ainda activo — é esse que ganha linhas e o botão «Usar este sinal».
  const ultimoAtivo = useMemo(() => [...sinais].reverse().find((s) => s.ativo && s.entrada != null) ?? null, [sinais])

  return { sinais, ultimoAtivo }
}
