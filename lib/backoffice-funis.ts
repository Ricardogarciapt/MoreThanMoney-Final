/**
 * OS FUNIS DO PIPELINE (CRM Fase 3, 17/11/2026) — Conduta v2 mais o B2B.
 *
 * Um negócio pertence a um destes quatro, guardado em `vendas_negocios.funil` (migração 261).
 * `null` é «por classificar» e mostra-se como tal: não se deduz um funil por palpite.
 */
export const FUNIS = ['educacao', 'corretora', 'funded', 'b2b'] as const
export type Funil = (typeof FUNIS)[number]

export const FUNIL_NOME: Record<Funil, string> = {
  educacao: 'Educação',
  corretora: 'Rota Corretora',
  funded: 'MTM Funded',
  b2b: 'B2B',
}

/** Uma frase por funil: o que se vende ali, para quem trabalha o quadro não confundir. */
export const FUNIL_RESUMO: Record<Funil, string> = {
  educacao: 'Membro e Premium (trial sem cartão).',
  corretora: 'Conta na PU Prime financiada desbloqueia o Premium.',
  funded: 'Sem capital: contas simuladas e Patrocínio de Desempenho. Não é prop firm.',
  b2b: 'Negócios locais: soluções e demos em /solucoes.',
}

export const SEM_FUNIL = 'sem' as const
export type FiltroFunil = Funil | typeof SEM_FUNIL

export function ehFunil(v: unknown): v is Funil {
  return typeof v === 'string' && (FUNIS as readonly string[]).includes(v)
}

export function nomeDoFunil(v: string | null | undefined): string {
  return ehFunil(v) ? FUNIL_NOME[v] : 'Por classificar'
}
