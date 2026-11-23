/**
 * PAGAR AS COMISSÕES APROVADAS POR TRANSFERÊNCIA STRIPE — lê a base, faz o plano
 * (`comissoes-plano.ts`) e transfere.
 *
 * Só toca no que o dono já APROVOU no admin. Cada lote leva uma chave de idempotência feita das
 * comissões que paga: se a mesma corrida se repetir (cron duas vezes, erro de rede a meio), o
 * Stripe devolve a mesma transferência em vez de pagar duas vezes.
 *
 * Interruptor: `site_settings.comissoes_pagamento.auto` (omissão: ligado). Desligado, o cron só
 * mostra o plano; o admin continua a poder pagar por Stripe à mão (`accao: 'pagar', via: 'stripe'`).
 */
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  chaveDoLote,
  MOTIVO_TEXTO,
  planearPagamentos,
  type Espera,
  type LinhaComissao,
  type Lote,
  type PessoaPagamento,
} from './comissoes-plano'

export const CHAVE_DEFINICOES = 'comissoes_pagamento'

export type ResultadoPagamento = {
  ensaio: boolean
  pagos: Array<{ beneficiarioId: string; totalCents: number; comissoes: number; transferencia: string }>
  falhados: Array<{ beneficiarioId: string; totalCents: number; erro: string }>
  espera: Array<Espera & { texto: string }>
}

export async function pagamentoAutomaticoLigado(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_DEFINICOES).maybeSingle()
  const v = (data?.value ?? {}) as { auto?: boolean }
  return v.auto !== false
}

async function lerPessoas(db: SupabaseClient, ids: string[]): Promise<Map<string, PessoaPagamento>> {
  const mapa = new Map<string, PessoaPagamento>()
  if (ids.length === 0) return mapa
  const [{ data: perfis }, { data: dividas }] = await Promise.all([
    db.from('profiles').select('id, user_type, stripe_connect_account_id, stripe_connect_status').in('id', ids),
    db
      .from('vendas_comissoes')
      .select('beneficiario_id, valor_cents')
      .in('beneficiario_id', ids)
      .not('paga_em', 'is', null)
      .not('estornada_em', 'is', null),
  ])
  const divida = new Map<string, number>()
  for (const d of dividas ?? []) {
    const k = String(d.beneficiario_id)
    divida.set(k, (divida.get(k) ?? 0) + (Number(d.valor_cents) || 0))
  }
  for (const p of perfis ?? []) {
    mapa.set(String(p.id), {
      id: String(p.id),
      connectId: (p.stripe_connect_account_id as string) || null,
      connectEstado: (p.stripe_connect_status as string) || null,
      admin: p.user_type === 'admin',
      dividaCents: divida.get(String(p.id)) ?? 0,
    })
  }
  return mapa
}

async function executarLote(
  db: SupabaseClient,
  stripe: Stripe,
  lote: Lote,
  por: string | null,
): Promise<string> {
  const transferencia = await stripe.transfers.create(
    {
      amount: lote.totalCents,
      currency: lote.moeda.toLowerCase(),
      destination: lote.destino,
      description: `Comissões MoreThanMoney (${lote.ids.length})`,
      metadata: {
        origem: 'vendas_comissoes',
        beneficiario_id: lote.beneficiarioId,
        comissoes: lote.ids.join(',').slice(0, 480),
      },
    },
    { idempotencyKey: chaveDoLote(lote) },
  )
  const agora = new Date().toISOString()
  const referencia = `stripe:${transferencia.id}`
  await db
    .from('vendas_comissoes')
    .update({ estado: 'paga', paga_em: agora, paga_por: por, pagamento_ref: referencia })
    .in('id', lote.ids)
    .eq('estado', 'aprovada')
  await db.from('vendas_comissoes_historico').insert(
    lote.ids.map((id) => ({
      comissao_id: id,
      de: 'aprovada',
      para: 'paga',
      por,
      nota: `Pago por transferência Stripe ${transferencia.id}${por ? '' : ' (automático, depois da aprovação)'}.`,
    })),
  )
  return transferencia.id
}

/**
 * Paga o que estiver pronto. `ids` limita às comissões indicadas (pagamento à mão no admin);
 * sem `ids`, olha para todas as aprovadas (cron).
 */
export async function pagarComissoesAprovadas(
  db: SupabaseClient,
  stripe: Stripe,
  opcoes: { ids?: string[]; ensaio?: boolean; por?: string | null } = {},
): Promise<ResultadoPagamento> {
  let q = db
    .from('vendas_comissoes')
    .select(
      'id, beneficiario_id, valor_cents, moeda, estado, estornada_em, venda:vendas_vendas!vendas_comissoes_venda_id_fkey(pago_em, estornada_em)',
    )
    .eq('estado', 'aprovada')
    .limit(2000)
  if (opcoes.ids?.length) q = q.in('id', opcoes.ids)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  const linhas: LinhaComissao[] = (data ?? []).map((r: Record<string, unknown>) => {
    const venda = (Array.isArray(r.venda) ? r.venda[0] : r.venda) as { pago_em?: string; estornada_em?: string } | null
    return {
      id: String(r.id),
      beneficiario_id: String(r.beneficiario_id),
      valor_cents: Number(r.valor_cents) || 0,
      moeda: (r.moeda as string) ?? 'EUR',
      estado: String(r.estado),
      estornada_em: (r.estornada_em as string) ?? null,
      venda_pago_em: venda?.pago_em ?? null,
      venda_estornada_em: venda?.estornada_em ?? null,
    }
  })

  const pessoas = await lerPessoas(db, [...new Set(linhas.map((l) => l.beneficiario_id))])
  const { lotes, espera } = planearPagamentos({ linhas, pessoas, agoraIso: new Date().toISOString() })

  const resultado: ResultadoPagamento = {
    ensaio: !!opcoes.ensaio,
    pagos: [],
    falhados: [],
    espera: espera.map((e) => ({ ...e, texto: MOTIVO_TEXTO[e.motivo] })),
  }
  if (opcoes.ensaio) {
    resultado.pagos = lotes.map((l) => ({ beneficiarioId: l.beneficiarioId, totalCents: l.totalCents, comissoes: l.ids.length, transferencia: '(ensaio)' }))
    return resultado
  }

  for (const lote of lotes) {
    try {
      const tr = await executarLote(db, stripe, lote, opcoes.por ?? null)
      resultado.pagos.push({ beneficiarioId: lote.beneficiarioId, totalCents: lote.totalCents, comissoes: lote.ids.length, transferencia: tr })
    } catch (e) {
      resultado.falhados.push({ beneficiarioId: lote.beneficiarioId, totalCents: lote.totalCents, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return resultado
}
