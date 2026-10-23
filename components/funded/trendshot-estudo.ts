"use client"

import { ESTUDOS_WEBTRADER } from "@/lib/scanners/estudos"
import type { ResultadoTrendShot } from "@/lib/estudos/trendshot/motor"
import type { SinalEstudo } from "./use-sinais-estudos"

const ESTUDO_TS = ESTUDOS_WEBTRADER.find((e) => e.chave === "TrendShot")!

/**
 * O sinal do TrendShot calculado no gráfico, para o «Usar este sinal»: o último cruzamento enquanto
 * não tocar no SL nem em todos os TPs. O TP proposto é o primeiro ainda por tocar (como o MTM Scanner).
 */
export function sinalDoTrendShot(r: ResultadoTrendShot | null, symbol: string): SinalEstudo | null {
  const u = r?.ultima
  if (!u || u.slTocado || u.tpTocado.every(Boolean)) return null
  const s = u.sinal
  const tp = s.tps.find((_, k) => !u.tpTocado[k]) ?? null
  return {
    id: `trendshot-local:${symbol}:${s.t}`,
    estudo: ESTUDO_TS,
    direcao: s.direcao,
    entrada: s.entrada,
    sl: s.sl,
    tp,
    em: s.t,
    ativo: true,
  }
}
