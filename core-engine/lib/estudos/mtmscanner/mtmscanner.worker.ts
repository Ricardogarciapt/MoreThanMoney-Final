/**
 * MTM Scanner — cálculo num Web Worker (mesmo protocolo do sensei.worker.ts / goldkiller.worker.ts).
 *
 * Protocolo: { id, velas, inputs, extra } → { id, r, ms } | { id, erro }.
 */
import { calcularMTMScanner } from './motor'
import type { DadosExtraMS, InputsMTMScanner, ResultadoMTMScanner, Vela } from './tipos'

export interface PedidoMTMScanner { id: number; velas: Vela[]; inputs: Partial<InputsMTMScanner>; extra: DadosExtraMS }
export type RespostaMTMScanner = { id: number; r: ResultadoMTMScanner; ms: number } | { id: number; erro: string }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<PedidoMTMScanner>) => void) | null; postMessage: (m: RespostaMTMScanner) => void }

ctx.onmessage = (e) => {
  const { id, velas, inputs, extra } = e.data
  const t0 = performance.now()
  try {
    const r = calcularMTMScanner(velas, inputs, extra)
    ctx.postMessage({ id, r, ms: performance.now() - t0 })
  } catch (err) {
    ctx.postMessage({ id, erro: err instanceof Error ? err.message : String(err) })
  }
}
