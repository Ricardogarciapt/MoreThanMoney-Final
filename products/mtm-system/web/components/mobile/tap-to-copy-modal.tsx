"use client"

/**
 * TAP to Copy — os PARÂMETROS do sinal, para replicar a trade à mão.
 *
 * Nasceu para os perpétuos (Aurum Flow & afins), onde não abrimos ordem MT5 e o cliente copia os
 * parâmetros para a corretora dele. Desde 2026-09-24 é para QUALQUER sinal, cripto e perpétuos
 * incluídos: há quem não queira executar connosco e queira na mesma replicar o sinal no MT5 — e
 * até aqui a única maneira era transcrever preços à mão de um cartão, com os erros que isso dá.
 *
 * Cada campo tem o SEU botão de copiar — pedido Ricardo 2026-09-04 — porque nas exchanges os
 * campos preenchem-se um a um; e há um «Copiar tudo» por cima, para quem cola o bloco inteiro.
 * O texto sai de `lib/mtmcopy/t2t-copiar`, o mesmo módulo que o /sinais da MTM Auto usa: os dois
 * ecrãs copiam os mesmos números pela mesma ordem.
 */

import { useState } from "react"
import { X, Copy, Check } from "lucide-react"
import { camposDoSinal, copiarTexto, type CampoCopiavel, type ParametrosSinal } from "@/lib/mtmcopy/t2t-copiar"

type Campo = CampoCopiavel

/**
 * Extrai os parâmetros do texto canónico do sinal (webhook TradingView).
 *
 * Plano B: quem tem os parâmetros já interpretados (o feed, que lê `lerSinal`) passa-os em
 * `campos` e não passa por aqui. Fica para o chat, que só tem o texto.
 */
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

export default function TapToCopyModal({
  content,
  parametros,
  titulo,
  aoFechar,
}: {
  content?: string
  /** Parâmetros JÁ interpretados. Quando existem mandam eles — não se volta a ler o texto. */
  parametros?: ParametrosSinal | null
  titulo?: string
  aoFechar: () => void
}) {
  const campos = parametros ? camposDoSinal(parametros) : parseCamposDoSinal(content ?? "")
  const [copiado, setCopiado] = useState<string | null>(null)

  const marcar = (chave: string) => {
    setCopiado(chave)
    setTimeout(() => setCopiado((v) => (v === chave ? null : v)), 1500)
  }

  const copiar = async (c: Campo) => {
    // Falhar em silêncio é o comportamento certo: o valor está à vista para se copiar à mão.
    if (await copiarTexto(c.valor)) marcar(c.rotulo)
  }

  const copiarTudo = async () => {
    const bloco = campos.map((c) => `${c.rotulo}: ${c.valor}`).join("\n")
    if (await copiarTexto(bloco)) marcar("__tudo__")
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70" onClick={aoFechar}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-b-0 border-[#D2A63C]/30 bg-[#12141A] p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-white">{titulo ?? "Tap to copy"}</h3>
          <button onClick={aoFechar} aria-label="Fechar" className="rounded-full p-1.5 text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-[12px] leading-snug text-zinc-400">
          Copia os parâmetros para o MT5 ou para a tua corretora. Conteúdo educativo — o risco e o lote
          são teus.
        </p>

        {campos.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-zinc-500">Não consegui ler os parâmetros deste sinal.</p>
        ) : (
          <>
            <button
              onClick={copiarTudo}
              className="mb-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#D2A63C] py-2.5 text-[13px] font-bold text-black active:scale-[0.98]"
            >
              {copiado === "__tudo__" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado === "__tudo__" ? "Copiado" : "Copiar tudo"}
            </button>
            <div className="space-y-2">
              {campos.map((c) => (
                <div key={c.rotulo} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">{c.rotulo}</p>
                    <p className="truncate font-mono text-[15px] font-semibold text-white">{c.valor}</p>
                  </div>
                  <button
                    onClick={() => copiar(c)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#D2A63C]/40 px-3 py-2 text-[12px] font-bold text-[#D2A63C] active:scale-95"
                  >
                    {copiado === c.rotulo ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiado === c.rotulo ? "Copiado" : "Copy"}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
