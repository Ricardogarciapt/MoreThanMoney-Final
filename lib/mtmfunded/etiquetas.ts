/**
 * AS ETIQUETAS CURTAS DE UMA CONTA — o que o trader lê à primeira.
 *
 * Tipo: F1 / F2 (fase do desafio), Funded, Torneio. Estado: Active, Breached, Pause, Closed,
 * Pending. Iguais no painel, no admin, no WebTrader e nas credenciais — é assim que as prop firms
 * as mostram, e é a língua que quem vem de lá já sabe ler. «Demo» não diz nada a ninguém: toda a
 * conta é simulada, o que interessa é EM QUE PONTO do caminho está.
 */

export type TipoCurto = 'F1' | 'F2' | 'Funded' | 'Torneio' | 'Real'
export type EstadoCurto = 'Active' | 'Breached' | 'Pause' | 'Closed' | 'Pending'

export function tipoCurto(tipo: string, metricas?: Record<string, unknown> | null): TipoCurto {
  if (tipo === 'torneio') return 'Torneio'
  if (tipo === 'financiada' || tipo === 'funded') return 'Funded'
  // Conta Real: dinheiro depositado pelo cliente, sem fases nem regras de desafio.
  if (tipo === 'real') return 'Real'
  // A fase vive nas métricas (`fase`), escrita quando a fase seguinte é emitida; sem ela é a 1.ª.
  return Number(metricas?.fase ?? 1) >= 2 ? 'F2' : 'F1'
}

export function estadoCurto(
  estado: string,
  metricas?: Record<string, unknown> | null,
  /** `pausada_em` (migração 079): pausa do admin — a conta continua `ativa` para o motor gerir SL/TP. */
  pausadaEm?: string | null,
): EstadoCurto {
  switch (estado) {
    case 'ativa':
      return pausadaEm ? 'Pause' : 'Active'
    // Rebentada ou inválida (cancelada por regra/fraude) — as duas são o fim por incumprimento.
    case 'quebrada':
    case 'cancelada':
      return 'Breached'
    // `expirada` serve dois casos: a pausa do ciclo do levantamento (tem `pausadaEm`) e o fim
    // por tempo ou por conclusão.
    case 'expirada':
      return metricas?.pausadaEm ? 'Pause' : 'Closed'
    case 'aprovada':
      return 'Closed'
    default:
      return 'Pending'
  }
}

/** Cores por estado, para quem quiser pintar a etiqueta sem inventar outra tabela. */
export const COR_DO_ESTADO: Record<EstadoCurto, string> = {
  Active: '#34d399',
  Breached: '#f87171',
  Pause: '#fbbf24',
  Closed: '#a1a1aa',
  Pending: '#60a5fa',
}
