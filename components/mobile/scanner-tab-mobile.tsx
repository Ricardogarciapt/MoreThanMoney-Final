"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BarChart3, CandlestickChart } from "lucide-react"
import ScannerMobile from "@/components/mobile/scanner-mobile"
import FundedWebtrader from "@/components/funded/funded-webtrader"

/**
 * O SEPARADOR SCANNER DA APP-MOBILE — dois sub-separadores: «Scanner» e «Web trader».
 *
 * O WebTrader do MTM Funded vive aqui (e já não num separador próprio) porque é o passo natural
 * depois de ver um sinal: o mesmo gráfico, agora com a conta simulada. `?tab=funded` continua a
 * abrir aqui, com «Web trader» escolhido e os parâmetros do «Negociar» (symbol/dir/sl/tp/origem).
 *
 * O sub-separador vive no URL (`&sub=webtrader`), para o link «Negociar no Web trader» do scanner
 * (que leva o símbolo do gráfico) e os deep-links funcionarem sem estado escondido. O símbolo é
 * partilhado: o que se escolhe no WebTrader é o que o Scanner mostra ao voltar.
 *
 * Negociar vive SÓ no Web trader: o Scanner não monta contas, preços nem polling do MTM Funded.
 * O Scanner fica sempre montado (só o gráfico TradingView); o WebTrader só monta quando está à
 * vista (separador Scanner activo + sub «Web trader») e desmonta ao sair — e o polling dele
 * salta pedidos com a página em segundo plano (document.visibilityState).
 */

export type SubScanner = "scanner" | "webtrader"

const tvDe = (symbol: string) => {
  // O scanner fala em símbolos do TradingView. Os mais usados têm corretagem própria.
  if (/^(XAU|XAG)USD$/.test(symbol) || /^[A-Z]{6}$/.test(symbol)) return `OANDA:${symbol}`
  if (/^(BTC|ETH|SOL|XRP)USD$/.test(symbol)) return `BINANCE:${symbol.slice(0, -3)}USDT`
  return symbol
}

export default function ScannerTabMobile({ ativo, sub }: { ativo: boolean; sub: SubScanner }) {
  const router = useRouter()
  const [vista, setVista] = useState<SubScanner>(sub)
  const [simboloPartilhado, setSimboloPartilhado] = useState<string | undefined>(undefined)
  useEffect(() => { setVista(sub) }, [sub])

  const mudar = (v: SubScanner) => {
    setVista(v)
    router.replace(v === "webtrader" ? "/app-mobile?tab=scanner&sub=webtrader" : "/app-mobile?tab=scanner", { scroll: false })
  }

  return (
    <div>
      <div className="sticky top-0 z-20 flex gap-1 border-b border-[#D2A63C]/20 bg-black/95 p-1.5 backdrop-blur">
        {([["scanner", "Scanner", BarChart3], ["webtrader", "Web trader", CandlestickChart]] as const).map(([v, nome, Icone]) => (
          <button
            key={v}
            type="button"
            onClick={() => mudar(v)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition-colors ${
              vista === v ? "bg-[#D2A63C] text-black" : "bg-white/5 text-gray-300"
            }`}
          >
            <Icone className="h-4 w-4" /> {nome}
          </button>
        ))}
      </div>

      <div className={vista === "scanner" ? "" : "hidden"}>
        <ScannerMobile externalSymbol={simboloPartilhado ? tvDe(simboloPartilhado) : undefined} />
      </div>
      {/* data-webtrader: na app-mobile, arrastar aqui é negociar — nunca muda de separador. */}
      {ativo && vista === "webtrader" && (
        <div data-webtrader className="bg-[#0b0e14]">
          <FundedWebtrader contexto="embutido" onSimbolo={setSimboloPartilhado} />
        </div>
      )}
    </div>
  )
}
