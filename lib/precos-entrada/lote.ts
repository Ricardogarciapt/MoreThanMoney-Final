/**
 * O QUE SE MANDA PELA REDE — e o que NÃO se manda.
 *
 * O EA publica uma fotografia de TODOS os símbolos do Market Watch de 50 em 50 ms. No VPS isso é
 * grátis (o motor lê um ficheiro ao lado). Do Mac para o VPS não é: mandar a fotografia inteira 20
 * vezes por segundo são ~40 pedidos/s com centenas de bytes de coisas que não mudaram, e o que se
 * ganha é zero — quem lê só quer o ÚLTIMO preço de cada símbolo.
 *
 * Então manda-se o que MUDOU: um símbolo entra no lote quando o seu `time_msc` é diferente do
 * último que dele enviámos. Fora de horas isso é um lote vazio (nada se manda, nem um pedido); em
 * mercado aberto são os poucos símbolos que tiveram tick.
 *
 * E de `reenvioMs` em `reenvioMs` manda-se a fotografia COMPLETA. Não é redundância decorativa: o
 * receptor guarda o retrato em memória, e se ele reiniciar os símbolos quietos nunca voltariam a
 * aparecer — o retrato ficava com metade do Market Watch para sempre. O reenvio cheio repõe-no sem
 * o agente precisar de saber que o outro lado reiniciou.
 */
import type { TickEntrada } from './sanidade'

/**
 * O `ticks.json` do EA, lido SEM canonizar nomes.
 *
 * `lerFotografia` (services/funded-motor/fonte-conector-mt5.ts) corta sufixos porque quem lê ali é
 * o motor, que quer o nome canónico. Aqui não: o que viaja é o nome como a CORRETORA o escreve, e
 * quem canoniza é o motor do outro lado, com o mapa dele. Assim a auditoria diz de que símbolo da
 * corretora veio o preço, e um mapa mal posto no Mac não contamina o que os motores vêem.
 */
export function lerTicksBrutos(texto: string): TickEntrada[] {
  return lerFicheiroEa(texto).ticks
}

/** A âncora do ficheiro: o `em` que o EA escreve com o relógio da máquina onde ele corre. */
export interface FicheiroEa {
  /** `em` do ficheiro (ms UTC), ou null quando não vem ou não é um número */
  em: number | null
  ticks: TickEntrada[]
}

/**
 * O ficheiro do EA inteiro — ticks E âncora.
 *
 * A âncora é o que permite medir o desvio da hora da corretora (lib/precos-entrada/desvio.ts) sem
 * ninguém configurar nada: `em` é a hora UTC da máquina do terminal, `t` é a hora do servidor da
 * corretora, e a diferença nos ticks que acabaram de mudar é o desvio.
 */
export function lerFicheiroEa(texto: string): FicheiroEa {
  let j: { em?: unknown; p?: Array<{ s?: unknown; b?: unknown; a?: unknown; t?: unknown }> }
  try {
    j = JSON.parse(texto)
  } catch {
    return { em: null, ticks: [] }
  }
  const em = typeof j.em === 'number' && Number.isFinite(j.em) && j.em > 0 ? j.em : null
  const saida: TickEntrada[] = []
  for (const p of j.p ?? []) {
    const s = typeof p?.s === 'string' ? p.s.trim().toUpperCase() : ''
    const b = Number(p?.b)
    const a = Number(p?.a)
    const t = Number(p?.t)
    if (!s || !Number.isFinite(b) || !Number.isFinite(a) || !Number.isFinite(t)) continue
    if (!(b > 0) || !(a > 0)) continue
    saida.push({ s, b, a, t })
  }
  return { em, ticks: saida }
}

export interface OpcoesLote {
  /** de quanto em quanto tempo se manda a fotografia completa (ms) */
  reenvioMs: number
  /** tecto de ticks por lote: um lote gigante é um pedido lento e um corpo a assinar à toa */
  maxTicks: number
}

export const OPCOES_LOTE: OpcoesLote = { reenvioMs: 5_000, maxTicks: 250 }

export interface Envio {
  ticks: TickEntrada[]
  cheio: boolean
}

/**
 * O próximo envio, ou `null` quando não há nada a dizer.
 *
 * `enviados` = símbolo → `time_msc` do último tick que já mandámos (o chamador actualiza-o só
 * depois de o pedido correr bem: um lote perdido tem de voltar no seguinte).
 */
export function montarLote(
  foto: readonly TickEntrada[],
  enviados: ReadonlyMap<string, number>,
  agora: number,
  ultimoCheioEm: number,
  o: OpcoesLote = OPCOES_LOTE,
): Envio | null {
  const cheio = agora - ultimoCheioEm >= o.reenvioMs
  const escolha: TickEntrada[] = []
  for (const t of foto) {
    if (!cheio && enviados.get(t.s) === t.t) continue
    escolha.push(t)
    if (escolha.length >= o.maxTicks) break
  }
  if (!escolha.length) return null
  // Um lote truncado não é a fotografia completa, e não se pode dizer que é: o receptor apagaria
  // do retrato os símbolos que ficaram de fora.
  return { ticks: escolha, cheio: cheio && escolha.length === foto.length }
}
