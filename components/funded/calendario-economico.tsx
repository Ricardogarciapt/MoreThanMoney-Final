"use client"

import { useEffect, useRef } from "react"

/**
 * CALENDÁRIO ECONÓMICO — o widget gratuito «Economic Calendar» do TradingView (embed oficial por
 * script; não há nenhum calendário já embutido no site). Só leitura, tema escuro, eventos de
 * impacto médio e alto das moedas que o MTM Funded negoceia.
 *
 * O script cria um iframe dentro do contentor; ao desmontar limpa-se o contentor (o widget não tem
 * API de destruição). Carrega-se só quando o separador/painel abre — não pesa no arranque.
 */
export default function CalendarioEconomico({ altura = 420 }: { altura?: number | string }) {
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    el.innerHTML = ""
    const alvo = document.createElement("div")
    alvo.className = "tradingview-widget-container__widget"
    el.appendChild(alvo)
    const s = document.createElement("script")
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js"
    s.async = true
    s.type = "text/javascript"
    s.innerHTML = JSON.stringify({
      colorTheme: "dark", isTransparent: true, width: "100%", height: "100%", locale: "pt",
      importanceFilter: "0,1", countryFilter: "us,eu,gb,jp,ch,au,ca,nz,cn,de",
    })
    el.appendChild(s)
    return () => { el.innerHTML = "" }
  }, [])
  return (
    <div className="flex h-full flex-col">
      <div ref={caixa} className="tradingview-widget-container min-h-0 flex-1" style={{ height: altura }} />
      <p className="px-2 py-1 text-[10px] text-zinc-500">Calendário: TradingView. Horas no fuso do dispositivo.</p>
    </div>
  )
}
