"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePrecos } from "@/components/funded/use-precos"
import { candidatosDeTicker } from "@/lib/mtmfunded/simulado/ordens"

/**
 * PREÇO AO VIVO DA CASA sobre o gráfico do scanner.
 *
 * O gráfico do scanner é um iframe do TradingView (fonte OANDA) e nós não mandamos na cadência
 * dele. O número que o trader usa para decidir vem daqui: bid/ask do nosso motor (corretora →
 * conector MT5 → WebSocket, ~100 ms), o mesmo que o Web trader mostra. Só aparece quando há
 * preço fresco — acções e símbolos fora do catálogo (NASDAQ:AAPL) não mostram nada, em vez de
 * mostrar um número velho.
 *
 * O símbolo do TradingView (`OANDA:XAUUSD`, `OANDA:SPX500USD`, `BINANCE:BTCUSDT`) resolve-se
 * com o mesmo dicionário do webhook (`candidatosDeTicker`), para não haver duas tabelas.
 */

/** Casas decimais pelo tamanho do número — o scanner não tem a ficha do símbolo. */
function casas(n: number): number {
  if (n >= 1000) return 2
  if (n >= 10) return 3
  return 5
}

export default function PrecoVivoScanner({ symbol, className = "" }: { symbol: string; className?: string }) {
  const candidatos = useMemo(() => candidatosDeTicker(symbol).slice(0, 3), [symbol])
  const { precos } = usePrecos(candidatos)
  const preco = candidatos.map((c) => precos[c]).find((p) => p && p.fresco) ?? null

  // Cor do último movimento: sobe a verde, desce a vermelho, até ao tick seguinte.
  const anterior = useRef<{ symbol: string; bid: number } | null>(null)
  const [sentido, setSentido] = useState<0 | 1 | -1>(0)
  useEffect(() => {
    if (!preco) return
    const a = anterior.current
    if (a && a.symbol === preco.symbol && a.bid !== preco.bid) setSentido(preco.bid > a.bid ? 1 : -1)
    if (!a || a.symbol !== preco.symbol) setSentido(0)
    anterior.current = { symbol: preco.symbol, bid: preco.bid }
  }, [preco])

  if (!preco) return null
  const d = casas(preco.bid)
  const spread = Math.abs(preco.ask - preco.bid)
  const cor = sentido > 0 ? "text-emerald-400" : sentido < 0 ? "text-red-400" : "text-white"

  return (
    <div
      className={`pointer-events-none select-none rounded-md border border-[#D2A63C]/40 bg-black/80 px-2 py-1 font-mono text-[11px] leading-tight shadow-lg backdrop-blur-sm ${className}`}
      aria-live="off"
      title="Preço da corretora MTM, ao vivo"
    >
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-[#D2A63C]">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        MTM · {preco.symbol}
      </div>
      <div className={`flex items-baseline gap-2 ${cor}`}>
        <span><span className="text-[9px] text-white/50">BID </span>{preco.bid.toFixed(d)}</span>
        <span><span className="text-[9px] text-white/50">ASK </span>{preco.ask.toFixed(d)}</span>
        <span className="text-[9px] text-white/40">{spread.toFixed(d)}</span>
      </div>
    </div>
  )
}
