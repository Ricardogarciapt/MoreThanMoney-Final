/**
 * MTM GoldKiller — cálculo num Web Worker (mesmo protocolo do sensei.worker.ts).
 *
 * O GoldKiller é leve — Supertrend + percentis que só mudam nas viragens. Medido em 2026-09-15 (Node,
 * Apple Silicon): ~8 ms para 3000-5000 velas; num telemóvel 3-5× isso, somado ao Sensei quando os
 * dois estão ligados, a cada vela fechada. Corre aqui pelo mesmo caminho do Sensei; o resultado é só
 * arrays e objetos simples (structured clone).
 *
 * Protocolo: { id, velas, inputs, extra } → { id, r, ms } | { id, erro }.
 */
import { calcularGoldKiller } from './motor'
import type { DadosExtraGK, InputsGoldKiller, ResultadoGoldKiller, Vela } from './tipos'

export interface PedidoGoldKiller { id: number; velas: Vela[]; inputs: Partial<InputsGoldKiller>; extra: DadosExtraGK }
export type RespostaGoldKiller = { id: number; r: ResultadoGoldKiller; ms: number } | { id: number; erro: string }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<PedidoGoldKiller>) => void) | null; postMessage: (m: RespostaGoldKiller) => void }

ctx.onmessage = (e) => {
  const { id, velas, inputs, extra } = e.data
  const t0 = performance.now()
  try {
    const r = calcularGoldKiller(velas, inputs, extra)
    ctx.postMessage({ id, r, ms: performance.now() - t0 })
  } catch (err) {
    ctx.postMessage({ id, erro: err instanceof Error ? err.message : String(err) })
  }
}
