/**
 * RELEITURA LEVE DO WEBTRADER — quando é que a sondagem de 4 s tem de pedir o estado inteiro.
 *
 * PORQUÊ: cada releitura trazia as últimas 100 trades fechadas (`select *`) e até 5 000 fechadas
 * para o desempenho, de 4 em 4 s, por cada ecrã aberto — ~15 pedidos/min, cada um com ~10 leituras
 * à base (medido 17/09). Isso só muda quando uma posição fecha (total ou parcial) ou quando o saldo
 * mexe; o resto do tempo a resposta leve (`?leve=1`, sem histórico nem desempenho) chega.
 *
 * Regra: pede-se o estado inteiro na primeira leitura, depois de cada ordem (quem chama), quando a
 * leve mostra outro saldo / outras posições (id ou volume) / outras pendentes do que a última
 * inteira, e de minuto a minuto por segurança. Com a conta parada, a sondagem abranda.
 */

export interface LinhaComId { id?: unknown; volume?: unknown }
export interface EstadoAssinavel {
  estado: { saldo: number }
  posicoes: LinhaComId[]
  ordens: LinhaComId[]
}

/** O que muda quando o histórico muda: saldo, posições abertas (id+volume) e pendentes. */
export function assinaturaEstado(e: EstadoAssinavel): string {
  const pos = e.posicoes.map((p) => `${String(p.id)}:${Number(p.volume)}`).sort().join(",")
  const ord = e.ordens.map((o) => String(o.id)).sort().join(",")
  return `${Math.round(Number(e.estado.saldo) * 100)}|${pos}|${ord}`
}

export const CHEIO_MAX_MS = 60_000
/** Releitura com posições ou pendentes (o motor fecha por SL/TP sem o ecrã saber). */
export const SONDAGEM_ATIVA_MS = 4_000
/** Conta sem nada aberto: nada a fechar pelo motor, basta ver ordens que cheguem de fora. */
export const SONDAGEM_PARADA_MS = 10_000

export function precisaDeEstadoCheio(
  ultimoCheio: { em: number; assinatura: string } | null,
  assinaturaAgora: string,
  agoraMs: number,
): boolean {
  if (!ultimoCheio) return true
  if (agoraMs - ultimoCheio.em >= CHEIO_MAX_MS) return true
  return ultimoCheio.assinatura !== assinaturaAgora
}

export function intervaloDeSondagem(e: EstadoAssinavel | null): number {
  if (!e) return SONDAGEM_ATIVA_MS
  return e.posicoes.length || e.ordens.length ? SONDAGEM_ATIVA_MS : SONDAGEM_PARADA_MS
}

/**
 * Junta uma resposta leve ao estado anterior: fica o histórico, o desempenho e os MOVIMENTOS da
 * carteira que já havia.
 *
 * `portefolio` entrou nesta lista com a 173 pela mesma razão que o histórico: a resposta leve não
 * traz os 2 139 movimentos (seria o mesmo peso que ela veio evitar) e vem a `null`. Sem o guardar
 * aqui, o separador Histórico da carteira enchia-se e esvaziava-se a cada 4 segundos.
 */
export function juntarLeve<T extends { historico: unknown; desempenho: unknown; portefolio?: unknown }>(
  anterior: T | null,
  leve: T,
): T {
  if (!anterior) return leve
  // `portefolio` só se junta quando EXISTE: numa conta que não é carteira (todas menos duas) não
  // se inventa a chave, e o estado junto fica carácter a carácter o que era antes da 173.
  return {
    ...leve,
    historico: anterior.historico,
    desempenho: anterior.desempenho,
    ...('portefolio' in anterior ? { portefolio: anterior.portefolio } : {}),
  }
}
