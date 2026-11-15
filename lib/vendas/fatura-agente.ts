/**
 * DE QUEM É O PRIMEIRO DINHEIRO DE UMA SUBSCRIÇÃO — o elo que faltava entre o `?ag=` e o livro.
 *
 * ═══ O DEFEITO, MEDIDO A 10/11 ═════════════════════════════════════════════════════════════
 *
 * 13 vendas no livro, 2 com código (ambas `CEO-MTM`, de Setembro). Desde Outubro, ZERO. O motivo
 * não é o cookie nem o checkout: o código chega ao `metadata` da sessão. O que acontece é que a
 * casa vende quase tudo com período grátis (trial de 3 dias, campanha 90 dias, cupões de 1.º mês)
 * e a sessão de checkout desses casos vale **0 €**. O código ficava gravado numa linha de 0 €, e o
 * primeiro dinheiro a sério chegava dias depois numa `invoice` de `subscription_cycle` — que o
 * webhook gravava como «renovação» e SEM código, de propósito. Resultado: a venda que o agente fez
 * aparecia no painel como receita sem dono, e a linha com o dono valia zero.
 *
 * ═══ A REGRA, QUE CONTINUA A NÃO INVENTAR ══════════════════════════════════════════════════
 *
 * O código só passa para uma fatura quando ela é o **primeiro pagamento com valor** da subscrição.
 * Esse pagamento é a conversão do trial (ou o fim do mês grátis) — é ainda a venda que o agente
 * trouxe. A partir do segundo pagamento com valor fica tudo como estava: renovações sem código,
 * porque a permanência não é do link (ver o campo `agenteCodigo` em `lib/vendas/livro.ts`).
 *
 * De onde vem o código, por esta ordem (a primeira que existir ganha):
 *  1. o `metadata.agente_codigo` da PRÓPRIA subscrição — os checkouts passam a escrevê-lo em
 *     `subscription_data.metadata`, e é a ligação mais forte que existe: está no objecto que cobra;
 *  2. o código gravado na venda de 0 € que abriu esta subscrição (a sessão de checkout do trial),
 *     para as subscrições criadas antes desta correcção.
 */
import { normalizar } from '@/lib/agentes/atribuicao'

export type OrigemDoCodigo = 'metadata_subscricao' | 'checkout_do_trial'

export interface FactosDaFatura {
  /** Valor pago nesta fatura, em cêntimos. */
  pagoCents: number
  /** Quantas faturas ANTERIORES desta subscrição foram pagas com valor maior que zero. */
  pagamentosAnterioresComValor: number
  /** `metadata.agente_codigo` da subscrição, se existir. */
  codigoNaSubscricao?: string | null
  /** O código da venda de 0 € que abriu a subscrição (checkout de trial/cupão), se existir. */
  codigoDoCheckoutGratis?: string | null
}

export interface CodigoDaFatura {
  codigo: string | null
  origem: OrigemDoCodigo | null
  /** Porque é que não passou, quando não passou. Vai para o log e para o ensaio do cron. */
  motivo?: 'sem_valor' | 'nao_e_o_primeiro_pagamento' | 'sem_codigo'
}

/** PURA. Decide se esta fatura leva código e de onde ele vem. */
export function codigoParaFatura(f: FactosDaFatura): CodigoDaFatura {
  if (!(f.pagoCents > 0)) return { codigo: null, origem: null, motivo: 'sem_valor' }
  if (f.pagamentosAnterioresComValor > 0) return { codigo: null, origem: null, motivo: 'nao_e_o_primeiro_pagamento' }
  const daSub = normalizar(f.codigoNaSubscricao)
  if (daSub) return { codigo: daSub, origem: 'metadata_subscricao' }
  const doTrial = normalizar(f.codigoDoCheckoutGratis)
  if (doTrial) return { codigo: doTrial, origem: 'checkout_do_trial' }
  return { codigo: null, origem: null, motivo: 'sem_codigo' }
}

/**
 * O id da subscrição de uma fatura, nas duas formas da API (2024-06-20: `invoice.subscription`;
 * versões novas: `invoice.parent.subscription_details.subscription`).
 */
export function subscricaoDaFatura(invoice: unknown): string | null {
  const i = invoice as {
    subscription?: string | { id?: string } | null
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null
  } | null
  const v = i?.subscription ?? i?.parent?.subscription_details?.subscription ?? null
  if (!v) return null
  return typeof v === 'string' ? v : v.id ?? null
}

/** O `metadata` da subscrição tal como vem copiado na fatura, nas duas formas da API. */
export function metadataDaSubscricaoNaFatura(invoice: unknown): Record<string, string> {
  const i = invoice as {
    subscription_details?: { metadata?: Record<string, string> | null } | null
    parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null
  } | null
  return i?.subscription_details?.metadata ?? i?.parent?.subscription_details?.metadata ?? {}
}

/** Os metadados que um checkout deve pôr na subscrição para o código a acompanhar. */
export function metadataDeAgenteParaSubscricao(codigo: string | null | undefined): Record<string, string> {
  const c = normalizar(codigo)
  return c ? { agente_codigo: c } : {}
}
