/**
 * NUNCA DUAS EXECUÇÕES DO MESMO SINAL NA MESMA CONTA — as três camadas, todas puras e testadas:
 *
 *  1. Por EVENTO × CONTA: `copia_eventos.chave` é única ('<rota>:<posição>:<tipo>:<disc>', e a rota já é
 *     mestre × conta); a abertura grava a cópia `enviando` com unique (rota, posição) ANTES da ordem; e
 *     `mestres_ordens` tem unique (chave) em live. Um reinício ou dois consumidores dão a mesma chave.
 *  2. Por TRADE × CONTA FÍSICA, entre caminhos: a mesma conta pode seguir a estratégia E aceitar o T2T
 *     do mesmo sinal, ou estar ligada no site e no MTM Auto. `mestres_execucoes_conta` guarda a
 *     impressão do trade (par + direcção + entrada a 10 pips + hora) por conta física; a segunda
 *     abertura do mesmo trade nessa conta é recusada, venha de onde vier. O T2T legado (execução
 *     directa do site) é lido de `mtmcopy_signal_log` pela mesma regra.
 *  3. Modificações em rajada (trailing a cada passo): numa fila da mesma posição só a ÚLTIMA
 *     modificação seguida vai à corretora; as anteriores ficam «substituídas».
 */
import { impressaoDoTrade } from '../mtmfunded/estrategias-sinais/calculo'
import { pipDe } from './pips'
import type { Direcao, TipoEventoCopia } from '../copia-contas/tipos'

/**
 * Impressão do trade para a conta — COM a estratégia (decisão do dono, 07/10): o mesmo sinal de duas
 * estratégias na mesma conta são duas trades; o mesmo sinal repetido da mesma estratégia é uma.
 */
export function impressaoParaConta(p: { symbol: string; direcao: Direcao; entrada: number | null; em?: string | number | Date; estrategia?: string | null }): string {
  const hora = p.em != null ? new Date(p.em).toISOString().slice(0, 13) : undefined
  const base = impressaoDoTrade({ symbol: p.symbol, direcao: p.direcao, entrada: p.entrada, hora })
  const e = String(p.estrategia ?? '').trim().toLowerCase()
  return e ? `${e}|${base}` : base
}

export interface ExecucaoRecente {
  symbol: string
  direcao: Direcao
  entrada: number | null
  em: number
  origem: string
  /** estratégia da execução recente (null = desconhecida) */
  estrategia?: string | null
}

/** Janela e tolerância do «mesmo trade» vindo por outro caminho (T2T legado, outra ligação). */
export const JANELA_CONFLITO_MS = 30 * 60_000
export const TOLERANCIA_CONFLITO_PIPS = 15

/**
 * Há na conta uma execução RECENTE do mesmo trade por outro caminho? (par igual, mesma direcção,
 * entrada a ≤ 15 pips, há ≤ 30 min). Devolve o motivo ou null.
 */
export function conflitoEntreCaminhos(
  novo: { symbol: string; direcao: Direcao; entrada: number | null; agora: number; estrategia?: string | null },
  recentes: ExecucaoRecente[],
): string | null {
  const pip = pipDe(novo.symbol)
  const est = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()
  const norm = (s: string) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const igual = recentes.find((r) => {
    if (norm(r.symbol) !== norm(novo.symbol) && !norm(r.symbol).startsWith(norm(novo.symbol)) && !norm(novo.symbol).startsWith(norm(r.symbol))) return false
    if (r.direcao !== novo.direcao) return false
    // Outra estratégia (as duas conhecidas) = outra trade — cada estratégia executa a sua (07/10).
    // Uma das duas desconhecida = não se sabe se é o mesmo sinal: fica a regra conservadora.
    if (est(novo.estrategia) && est(r.estrategia) && est(novo.estrategia) !== est(r.estrategia)) return false
    if (novo.agora - r.em > JANELA_CONFLITO_MS || r.em - novo.agora > 60_000) return false
    if (r.entrada == null || novo.entrada == null) return true
    return Math.abs(r.entrada - novo.entrada) / pip <= TOLERANCIA_CONFLITO_PIPS
  })
  return igual ? `duplicado: o mesmo trade já foi executado nesta conta por ${igual.origem}` : null
}

export interface EventoNaFila {
  id: number
  tipo: TipoEventoCopia
}

/**
 * Numa fila de eventos da MESMA posição (ordem crescente), cada sequência contígua de `modify` só
 * precisa da última: o SL/TP final é o que conta. Abrir, parciais e fechos nunca se saltam, e um
 * modify separado de outro por um parcial não se funde com ele.
 */
export function colapsarModificacoesDaFila<T extends EventoNaFila>(fila: T[]): { processar: T[]; substituidos: T[] } {
  const processar: T[] = []
  const substituidos: T[] = []
  for (let i = 0; i < fila.length; i++) {
    const ev = fila[i]
    const seguinte = fila[i + 1]
    if (ev.tipo === 'modify' && seguinte?.tipo === 'modify') substituidos.push(ev)
    else processar.push(ev)
  }
  return { processar, substituidos }
}

/** Chave do registo de uma ordem (evento × conta) e do ajuste de SL/TP depois de abrir. */
export function chaveOrdem(chaveEvento: string, sufixo?: 'reancorar'): string {
  return sufixo ? `${chaveEvento}:${sufixo}` : chaveEvento
}
