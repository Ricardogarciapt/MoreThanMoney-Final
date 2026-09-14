"use client"

import { Loader2, X } from "lucide-react"
import { px, usd } from "./api"
import { TV } from "./grafico-tipos"
import { useRascunho } from "./rascunho-ordem"

/**
 * A BARRA DA ORDEM NO GRÁFICO — o mesmo rascunho do ticket, visto por baixo do gráfico.
 *
 * A ferramenta Long/Short nunca envia nada sozinha: desenha-se, arrasta-se, e só «Confirmar» abre
 * a posição (entrada perto do preço) ou cria a pendente (longe dele). Confirmar aqui ou no ticket
 * é a mesma coisa — o rascunho é um só (rascunho-ordem.tsx).
 */
export default function PainelFerramenta() {
  const k = useRascunho()
  const { r, simbolo, preco, volume, resumo, erros } = k
  const compra = r.lado === "buy"
  const nome = r.tipo === "mercado"
    ? `${compra ? "Comprar" : "Vender"} a mercado`
    : `${compra ? "Buy" : "Sell"} ${r.tipo === "limit" ? "Limit" : "Stop"} @ ${px(r.entrada, simbolo.digits)}`
  const primeiroErro = erros.volume ?? erros.entrada ?? erros.sl ?? erros.tp ?? erros.margem ?? null

  return (
    <div className="border-t p-2.5 text-[12px]" style={{ borderColor: TV.borda, background: TV.painel, color: TV.texto }}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <b className="text-white">{nome}</b> · {volume} lotes
          <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px]">
            {k.sl != null && <span style={{ color: TV.sl }}>SL {px(k.sl, simbolo.digits)} · {resumo.pipsSl} pips · {usd(resumo.risco)} $</span>}
            {k.tp != null && <span style={{ color: TV.tp }}>TP {px(k.tp, simbolo.digits)} · {resumo.pipsTp} pips · +{usd(resumo.ganho)} $</span>}
            {resumo.rr && <span style={{ color: TV.textoFraco }}>R:R {resumo.rr}</span>}
          </div>
          <div className="mt-0.5 text-[10.5px]" style={{ color: TV.textoFraco }}>
            Arrasta a entrada, o SL e o TP no gráfico (ou escreve-os no ticket). Entrada perto do preço executa a mercado; longe cria ordem pendente.
          </div>
        </div>
        <button onClick={k.limpar} aria-label="cancelar ordem" className="rounded border px-2.5 py-2" style={{ borderColor: TV.borda, color: TV.textoFraco }}>
          <X className="h-4 w-4" />
        </button>
        <button
          disabled={k.aEnviar || !preco?.fresco || k.temErros || k.entrada == null}
          onClick={() => void k.enviar()}
          className="rounded px-3 py-2 font-bold text-white disabled:opacity-40"
          style={{ background: compra ? TV.compra : TV.venda }}
        >
          {k.aEnviar ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
        </button>
      </div>
      {!preco?.fresco && <p className="mt-1 text-[11px] text-amber-300">Sem preço ao vivo — mercado fechado ou motor parado.</p>}
      {primeiroErro && <p className="mt-1 text-[11px] text-rose-300">{primeiroErro}</p>}
      {k.erroEnvio && <p className="mt-1 text-[11px] text-rose-300">{k.erroEnvio}</p>}
    </div>
  )
}
