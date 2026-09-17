import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContaEntrega, Idioma } from './email-tipo-conta'
import { idiomaDoCliente } from './oferta-clientes'

/**
 * OS DADOS DE UMA CONTA PARA O EMAIL DE ENTREGA — lidos uma vez, no mesmo formato para todos os
 * que enviam (link de credenciais, agente MT5, reenvio do admin, véspera do torneio).
 *
 * Antes, cada rota montava o seu pedaço: uma lia o nome do torneio para um desafio, outra punha
 * `saldo_inicial ?? 0`, nenhuma lia as fases do programa. É por isso que os emails diziam coisas
 * diferentes (e erradas) conforme a porta por onde saíam.
 *
 * O idioma segue a regra da oferta de 2026-09 (`idiomaDoCliente`): PT para quem tem língua/país
 * lusófonos ou nenhum sinal; EN para os restantes clientes estrangeiros.
 */

export interface DadosEntrega {
  conta: ContaEntrega
  regras: Record<string, number | string> | null
  idioma: Idioma
  perfil: { nome: string; email: string | null } | null
}

const CAMPOS_PERFIL = 'full_name, email, preferred_language, detected_language, country, phone, timezone'

export async function dadosDeEntrega(db: SupabaseClient, contaId: string): Promise<DadosEntrega | null> {
  const { data: c } = await db
    .from('mtm_trading_accounts')
    .select('id, user_id, tipo, estado, saldo_inicial, program_id, tournament_id, metricas')
    .eq('id', contaId)
    .maybeSingle()
  if (!c) return null

  const [{ data: programa }, { data: torneio }, { data: compraOferta }, perfilR] = await Promise.all([
    c.program_id
      ? db.from('mtm_funded_programs').select('nome, fases, saldo, regras').eq('id', c.program_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    c.tournament_id
      ? db.from('mtm_tournaments').select('nome, regras').eq('id', c.tournament_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
    c.tipo === 'desafio'
      ? db.from('mtm_funded_purchases').select('id').eq('account_id', c.id as string).eq('estado', 'oferta').limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    c.user_id
      ? db.from('profiles').select(CAMPOS_PERFIL).eq('id', c.user_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const p = (programa ?? null) as { nome?: string; fases?: number; saldo?: number; regras?: Record<string, number | string> } | null
  const t = (torneio ?? null) as { nome?: string; regras?: Record<string, number | string> } | null
  const perfil = (perfilR.data ?? null) as Record<string, string | null> | null

  return {
    conta: contaEntregaDaLinha(c as Record<string, unknown>, p, t, Boolean(compraOferta)),
    // As regras do torneio num torneio; as do programa num desafio. Funded/análise não levam
    // regras de avaliação no email (não há objectivo).
    regras: c.tipo === 'torneio' ? (t?.regras ?? null) : c.tipo === 'desafio' ? (p?.regras ?? null) : null,
    idioma: perfil ? idiomaDoCliente({ id: String(c.user_id), ...perfil } as Parameters<typeof idiomaDoCliente>[0]) : 'pt',
    perfil: perfil ? { nome: String(perfil.full_name ?? '').trim(), email: perfil.email ?? null } : null,
  }
}

/** Puro: a linha da conta (+ programa/torneio) no formato do email. */
export function contaEntregaDaLinha(
  c: Record<string, unknown>,
  programa: { nome?: string; fases?: number; saldo?: number } | null,
  torneio: { nome?: string } | null,
  ofertaRenovacao: boolean,
): ContaEntrega {
  const m = (c.metricas ?? {}) as Record<string, unknown>
  return {
    tipo: String(c.tipo ?? ''),
    estado: (c.estado as string | null) ?? null,
    saldoInicial: c.saldo_inicial as number | string | null,
    fase: (m.fase as number | string | null) ?? null,
    fases: programa?.fases ?? null,
    programaNome: programa?.nome ?? null,
    programaSaldo: programa?.saldo ?? null,
    ofertaMarca: typeof m.oferta === 'string' ? m.oferta : null,
    ofertaRenovacao,
    analise: m.analise === true || m.analise === 'true',
    torneioNome: torneio?.nome ?? null,
  }
}
