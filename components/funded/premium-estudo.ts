"use client"

import { ESTUDOS_WEBTRADER } from "@/lib/scanners/estudos"
import type { ResultadoPremium } from "@/lib/estudos/premium-scanner/motor"
import type { SinalEstudo } from "./use-sinais-estudos"

const ESTUDO_PS = ESTUDOS_WEBTRADER.find((e) => e.chave === "PremiumScanner")!

/**
 * O sinal do Premium Scanner calculado no gráfico, para o «Usar este sinal»: o último enquanto a
 * ordem limite não expirar e, depois de entrar, enquanto não tocar no SL nem em todos os TPs.
 * O TP proposto é o primeiro ainda por tocar.
 */
export function sinalDoPremium(r: ResultadoPremium | null, symbol: string): SinalEstudo | null {
  const u = r?.ultima
  if (!u || u.expirou || u.slTocado || u.tpTocado.every(Boolean)) return null
  const s = u.sinal
  return {
    id: `premium-local:${symbol}:${s.t}`,
    estudo: ESTUDO_PS,
    direcao: s.direcao,
    entrada: s.entrada,
    sl: s.sl,
    tp: s.tps.find((_, k) => !u.tpTocado[k]) ?? null,
    em: s.t,
    ativo: true,
  }
}
