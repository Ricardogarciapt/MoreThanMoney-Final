import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'

export const dynamic = 'force-dynamic'

/**
 * AS CONTAS SIMULADAS DE QUEM PEDE — o que o WebTrader (M3) lê ao abrir.
 *
 * Contas, posições abertas, ordens pendentes e o catálogo de símbolos com o último preço, numa
 * só ida: o ecrã abre com tudo em vez de quatro pedidos em cascata.
 *
 * Sessão por token OU cookie, como as outras rotas da app: dentro do MTM System a sessão chega
 * como Bearer.
 */
export async function GET(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'sem sessão' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: contas } = await db
    .from('mtm_trading_accounts')
    .select('id, tipo, estado, program_id, tournament_id, saldo_inicial, alavancagem, sim_saldo, sim_equity, sim_margem, sim_ancora_dia, sim_pico_equity, sim_dias_negociados, quebrou_regra, metricas, created_at')
    .eq('user_id', userId)
    .eq('motor', 'sim')
    .order('created_at', { ascending: false })

  const ids = (contas ?? []).map((c) => c.id as string)
  const [{ data: posicoes }, { data: ordens }, { data: simbolos }, { data: precos }, { data: programas }] = await Promise.all([
    ids.length
      ? db.from('funded_positions').select('*').in('account_id', ids).eq('estado', 'aberta').order('aberta_em', { ascending: false })
      : Promise.resolve({ data: [] }),
    ids.length
      ? db.from('funded_orders').select('*').in('account_id', ids).eq('estado', 'pendente').order('criada_em', { ascending: false })
      : Promise.resolve({ data: [] }),
    db.from('funded_symbols')
      .select('symbol, nome, classe, digits, contract_size, pip_size, spread_pontos, comissao_lote, volume_min, volume_step, volume_max, alavancagem_max, horario')
      .eq('ativo', true).order('ordem'),
    db.from('funded_precos').select('symbol, bid, ask, em'),
    db.from('mtm_funded_programs').select('id, slug, nome, fases, regras'),
  ])

  const programaDe = new Map((programas ?? []).map((p) => [p.id as string, p]))

  return NextResponse.json({
    contas: (contas ?? []).map((c) => {
      const prog = c.program_id ? programaDe.get(c.program_id as string) : null
      return { ...c, programa: prog ? { slug: prog.slug, nome: prog.nome, fases: prog.fases, regras: prog.regras } : null }
    }),
    posicoes: posicoes ?? [],
    ordens: ordens ?? [],
    simbolos: simbolos ?? [],
    precos: precos ?? [],
  })
}
