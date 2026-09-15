"use client"

import type { Direcao, MapaPrecos, Simbolo } from "@/lib/mtmfunded/simulado/matematica"
import { distanciaEmPreco, validarGestao, type Gestao, type UnidadeDistancia } from "@/lib/mtmfunded/simulado/avancadas"

/**
 * O ESTADO DAS ORDENS AVANÇADAS NO TICKET — escrito como o trader escreve (texto, em pips, preço ou $)
 * e convertido para a gestão em PREÇO só no fim, com a mesma validação do servidor
 * (lib/mtmfunded/simulado/avancadas.ts). Assim o erro aparece no ticket ANTES de enviar e o
 * servidor, se discordar, diz o mesmo.
 */

export interface Avancado {
  aberto: boolean
  tpsModo: "pips" | "preco"
  tps: Array<{ valor: string; pct: string }>
  trailing: { ligado: boolean; valor: string; unidade: UnidadeDistancia; ativacaoPips: string }
  be: { ligado: boolean; gatilhoPips: string; noTp1: boolean; offsetPips: string }
  /** datetime-local (hora do dispositivo); vazio = GTC. Só pendentes. */
  expira: string
  /** Segunda perna OCO. Só pendentes. */
  oco: { ligado: boolean; direcao: Direcao; preco: string }
}

export const AVANCADO_VAZIO: Avancado = {
  aberto: false,
  tpsModo: "pips",
  tps: [],
  trailing: { ligado: false, valor: "", unidade: "pips", ativacaoPips: "" },
  be: { ligado: false, gatilhoPips: "", noTp1: false, offsetPips: "" },
  expira: "",
  oco: { ligado: false, direcao: "sell", preco: "" },
}

export const numeroDe = (t: string) => {
  const n = Number(String(t ?? "").replace(",", "."))
  return String(t ?? "").trim() && Number.isFinite(n) ? n : null
}

export function temAvancado(a: Avancado): boolean {
  return a.tps.some((t) => numeroDe(t.valor) != null) || a.trailing.ligado || a.be.ligado || Boolean(a.expira) || a.oco.ligado
}

/** Converte o que está escrito na gestão que o servidor espera. `erro` em linguagem de gente. */
export function gestaoDoAvancado(
  a: Avancado, s: Simbolo, lado: Direcao, entrada: number | null, volume: number, sl: number | null, tp: number | null, precos: MapaPrecos,
): { gestao: Partial<Gestao> | null; erro: string | null } {
  if (entrada == null) return { gestao: null, erro: null }
  const sinal = lado === "buy" ? 1 : -1
  const pedido: Partial<Gestao> = {}
  let algum = false

  const tps = a.tps.filter((t) => numeroDe(t.valor) != null || numeroDe(t.pct) != null)
  if (tps.length) {
    pedido.tps = []
    for (const [i, t] of tps.entries()) {
      const v = numeroDe(t.valor)
      const pct = numeroDe(t.pct)
      if (v == null || !(v > 0) || pct == null || !(pct > 0)) return { gestao: null, erro: `TP${i + 1}: indica ${a.tpsModo === "pips" ? "os pips" : "o preço"} e a %` }
      const preco = a.tpsModo === "pips" ? entrada + sinal * v * s.pip_size : v
      pedido.tps.push({ preco: Number(preco.toFixed(s.digits)), pct, atingido: false })
    }
    algum = true
  }
  if (a.trailing.ligado) {
    const d = distanciaEmPreco(s, numeroDe(a.trailing.valor), a.trailing.unidade, volume, entrada, precos)
    if (d == null) return { gestao: null, erro: "trailing: indica a distância" }
    pedido.trailing_distancia = d
    const at = numeroDe(a.trailing.ativacaoPips)
    pedido.trailing_ativacao = at != null && at > 0 ? at * s.pip_size : null
    algum = true
  }
  if (a.be.ligado) {
    const g = numeroDe(a.be.gatilhoPips)
    if ((g == null || !(g > 0)) && !a.be.noTp1) return { gestao: null, erro: "break-even: indica o gatilho em pips ou escolhe «no TP1»" }
    if (a.be.noTp1 && !tps.length) return { gestao: null, erro: "break-even no TP1 precisa de um TP1 parcial" }
    pedido.be_gatilho = g != null && g > 0 ? g * s.pip_size : null
    pedido.be_no_tp1 = a.be.noTp1
    pedido.be_offset = (numeroDe(a.be.offsetPips) ?? 0) * s.pip_size
    algum = true
  }
  if (!algum) return { gestao: null, erro: null }
  const v = validarGestao(s, lado, entrada, volume, sl, tp, pedido)
  return v.ok ? { gestao: pedido, erro: null } : { gestao: null, erro: v.erro }
}

/** datetime-local → ISO; vazio ou passado → erro/nulo. */
export function expiracaoDe(a: Avancado): { iso: string | null; erro: string | null } {
  if (!a.expira) return { iso: null, erro: null }
  const t = new Date(a.expira).getTime()
  if (!Number.isFinite(t)) return { iso: null, erro: "expiração inválida" }
  if (t <= Date.now() + 30_000) return { iso: null, erro: "a expiração tem de ser no futuro" }
  return { iso: new Date(t).toISOString(), erro: null }
}
