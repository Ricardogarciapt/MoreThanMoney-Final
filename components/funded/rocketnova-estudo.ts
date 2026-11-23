"use client"

import { ESTUDOS_WEBTRADER } from "@/lib/scanners/estudos"
import type { ResultadoRocketNova } from "@/lib/estudos/rocketnova/motor"
import type { SinalEstudo } from "./use-sinais-estudos"

const ESTUDO_RN = ESTUDOS_WEBTRADER.find((e) => e.chave === "RocketNova")!

/** O sinal do RocketNova calculado no gráfico, para o «Usar este sinal» (como o TrendShot). */
export function sinalDoRocketNova(r: ResultadoRocketNova | null, symbol: string): SinalEstudo | null {
  const u = r?.ultima
  if (!u || u.slTocado || u.tpTocado.every(Boolean)) return null
  const s = u.sinal
  const tp = s.tps.find((_, k) => !u.tpTocado[k]) ?? null
  return {
    id: `rocketnova-local:${symbol}:${s.t}`,
    estudo: ESTUDO_RN,
    direcao: s.direcao,
    entrada: s.entrada,
    sl: s.sl,
    tp,
    em: s.t,
    ativo: true,
  }
}
