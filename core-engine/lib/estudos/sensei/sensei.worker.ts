/**
 * MTM Sensei — cálculo num Web Worker.
 *
 * Medido em 2026-09-14 (Node, Apple Silicon): 3000 velas M5 + 800 H4 + 3000 M1 levam 19-43 ms por
 * cálculo; num telemóvel é 3-5× isso (60-200 ms) — acima dos ~30 ms que se aceitam na thread
 * principal sem soluços no pan/zoom e nos preços ao vivo. O motor é puro (sem DOM), por isso corre
 * aqui tal e qual; o resultado é só arrays e objetos simples (passa por structured clone).
 *
 * Protocolo: { id, velas, inputs, extra } → { id, r, ms } | { id, erro }.
 * O `id` deixa o cliente deitar fora respostas antigas (mudou o símbolo a meio de um cálculo).
 */
import { calcularSensei } from './motor'
import type { DadosExtra, InputsSensei, ResultadoSensei, Vela } from './tipos'

export interface PedidoSensei { id: number; velas: Vela[]; inputs: Partial<InputsSensei>; extra: DadosExtra }
export type RespostaSensei = { id: number; r: ResultadoSensei; ms: number } | { id: number; erro: string }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<PedidoSensei>) => void) | null; postMessage: (m: RespostaSensei) => void }

ctx.onmessage = (e) => {
  const { id, velas, inputs, extra } = e.data
  const t0 = performance.now()
  try {
    const r = calcularSensei(velas, inputs, extra)
    ctx.postMessage({ id, r, ms: performance.now() - t0 })
  } catch (err) {
    ctx.postMessage({ id, erro: err instanceof Error ? err.message : String(err) })
  }
}
