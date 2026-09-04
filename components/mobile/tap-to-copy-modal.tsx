"use client"

/**
 * TAP to Copy — modal dos sinais de Perpétuos Cripto (Aurum Flow & afins).
 *
 * Nos perpétuos não abrimos ordem MT5: o cliente copia os parâmetros para a
 * corretora dele. Cada campo (entrada, SL, exits) tem o SEU botão de copiar —
 * pedido Ricardo 2026-09-04 — porque nas exchanges os campos preenchem-se um a um.
 */

import { useState } from "react"
import { X, Copy, Check } from "lucide-react"

type Campo = { rotulo: string; valor: string }

/** Extrai os parâmetros do texto canónico do sinal (webhook TradingView). */
export function parseCamposDoSinal(content: string): Campo[] {
  const campos: Campo[] = []
  const sym = content.match(/📊\s*([A-Z0-9.\-/]+)/i)?.[1]
  const dir = /🔵|COMPRA|BUY|LONG/i.test(content) && !/VENDA|SELL|SHORT/i.test(content.split("\n")[2] ?? content)
    ? "LONG"
    : /🔴|VENDA|SELL|SHORT/i.test(content)
      ? "SHORT"
      : null
  if (sym) campos.push({ rotulo: "Par", valor: sym })
  if (dir) campos.push({ rotulo: "Direção", valor: dir })
  const entrada = content.match(/Entrada:\s*([0-9][\d.,]*|Mercado)/i)?.[1]
  if (entrada) campos.push({ rotulo: "Entrada", valor: entrada })
  const sl = content.match(/Stop\s*Loss:\s*([0-9][\d.,]*)/i)?.[1]
  if (sl) campos.push({ rotulo: "Stop Loss", valor: sl })
  for (const m of content.matchAll(/Take\s*Profit\s*(\d+):\s*([0-9][\d.,]*)/gi)) {
    campos.push({ rotulo: `Exit ${m[1]}`, valor: m[2]! })
  }
  return campos
}

export default function TapToCopyModal({ content, aoFechar }: { content: string; aoFechar: () => void }) {
  const campos = parseCamposDoSinal(content)
  const [copiado, setCopiado] = useState<string | null>(null)

  const copiar = async (c: Campo) => {
    try {
      await navigator.clipboard.writeText(c.valor)
      setCopiado(c.rotulo)
      setTimeout(() => setCopiado((v) => (v === c.rotulo ? null : v)), 1500)
    } catch {
      /* clipboard bloqueado — o valor está visível para copiar à mão */
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70" onClick={aoFechar}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-b-0 border-[#D2A63C]/30 bg-[#12141A] p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-white">TAP to Copy · Perpétuos</h3>
          <button onClick={aoFechar} aria-label="Fechar" className="rounded-full p-1.5 text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-[12px] leading-snug text-zinc-400">
          Copia cada parâmetro para a tua corretora. Conteúdo educativo — gere o risco e o lote.
        </p>

        {campos.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-zinc-500">Não consegui ler os parâmetros deste sinal.</p>
        ) : (
          <div className="space-y-2">
            {campos.map((c) => (
              <div key={c.rotulo} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500">{c.rotulo}</p>
                  <p className="truncate font-mono text-[15px] font-semibold text-white">{c.valor}</p>
                </div>
                <button
                  onClick={() => copiar(c)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#D2A63C] px-3 py-2 text-[12px] font-bold text-black active:scale-95"
                >
                  {copiado === c.rotulo ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiado === c.rotulo ? "Copiado" : "Copy"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
