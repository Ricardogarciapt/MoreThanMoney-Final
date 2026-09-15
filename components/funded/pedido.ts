"use client"

import type { PedidoOrdem } from "./rascunho-ordem"

/**
 * Do rascunho para o corpo da API das ordens — um só sítio, usado pelo WebTrader e pelo painel
 * «Negociar» dos scanners. Uma OCO leva as duas pernas; a segunda copia volume, SL/TP em DISTÂNCIA
 * (os pips do SL da primeira aplicados à entrada da segunda) e a gestão não (cada lado é o seu).
 */
export function corpoDoPedido(p: PedidoOrdem, accountId: string, symbol: string): { accao: string; corpo: Record<string, unknown> } {
  const base = { accountId, symbol, direcao: p.direcao, volume: p.volume, sl: p.sl, tp: p.tp, origem: p.origem, ideiaRef: p.ideiaRef, gestao: p.gestao ?? null }
  if (p.accao === "abrir") return { accao: "abrir", corpo: base }
  const pendente = { ...base, tipo: p.tipo, preco: p.preco, expiraEm: p.expiraEm ?? null }
  if (!p.oco || p.preco == null) return { accao: "pendente", corpo: pendente }
  const mesmoLado = p.oco.direcao === p.direcao
  const espelho = (nivel: number | null) => {
    if (nivel == null) return null
    const d = nivel - (p.preco as number)
    return p.oco!.preco + (mesmoLado ? d : -d)
  }
  const segunda = {
    symbol, direcao: p.oco.direcao, tipo: p.oco.tipo, volume: p.volume, preco: p.oco.preco,
    sl: espelho(p.sl), tp: espelho(p.tp), expiraEm: p.expiraEm ?? null, origem: p.origem,
  }
  return { accao: "oco", corpo: { accountId, pernas: [pendente, segunda] } }
}
