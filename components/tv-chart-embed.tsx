"use client"

import { useEffect, useRef } from "react"

declare global {
  interface Window {
    TradingView?: any
  }
}

let tvScriptPromise: Promise<void> | null = null

/** Carrega o script tv.js do TradingView uma única vez (partilhado com o scanner). */
function loadTvScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.TradingView) return Promise.resolve()
  if (tvScriptPromise) return tvScriptPromise
  tvScriptPromise = new Promise<void>((resolve) => {
    const existing = document.getElementById("tradingview-tv-js")
    if (existing) {
      existing.addEventListener("load", () => resolve())
      if (window.TradingView) resolve()
      return
    }
    const script = document.createElement("script")
    script.id = "tradingview-tv-js"
    script.src = "https://s3.tradingview.com/tv.js"
    script.async = true
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
  return tvScriptPromise
}

interface TvChartEmbedProps {
  /** Símbolo TradingView completo, ex.: BINANCE:BTCUSDT, OANDA:XAUUSD */
  tvSymbol: string
  /** Intervalo do gráfico: "15", "60", "240", "D"... */
  interval?: string
  height?: number
  /** Compacto = sem barra de ferramentas (para cartões de alerta) */
  compact?: boolean
  /** Studies/indicadores a aplicar. String (PUB;<id>) ou {id, inputs} p/ ocultar painéis. */
  studies?: Array<string | { id: string; inputs?: Record<string, unknown> }>
}

export default function TvChartEmbed({
  tvSymbol,
  interval = "60",
  height = 420,
  compact = false,
  studies,
}: TvChartEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(
    `tvchart_${Math.abs(hashCode(tvSymbol + interval + (compact ? "c" : "f") + (studies?.join(",") ?? "")))}`
  )

  useEffect(() => {
    let cancelled = false
    loadTvScript().then(() => {
      if (cancelled || !containerRef.current || !window.TradingView) return
      containerRef.current.innerHTML = ""
      const inner = document.createElement("div")
      inner.id = idRef.current
      inner.style.height = "100%"
      inner.style.width = "100%"
      containerRef.current.appendChild(inner)
      // eslint-disable-next-line no-new
      new window.TradingView.widget({
        container_id: idRef.current,
        symbol: tvSymbol,
        interval,
        autosize: true,
        theme: "dark",
        style: "1",
        locale: "pt",
        timezone: "Europe/Lisbon",
        hide_top_toolbar: compact,
        hide_legend: compact,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        withdateranges: !compact,
        save_image: false,
        backgroundColor: "rgba(0,0,0,1)",
        gridColor: "rgba(210,166,60,0.06)",
        ...(studies && studies.length ? { studies } : {}),
      })
    })
    return () => {
      cancelled = true
    }
  }, [tvSymbol, interval, compact, studies])

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full overflow-hidden rounded-lg border border-[#D2A63C]/20 bg-black"
    />
  )
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h
}
