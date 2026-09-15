import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { tipoCurto, estadoCurto } from '@/lib/mtmfunded/etiquetas'
import { selecionarComOpcionais } from '@/lib/mtmfunded/numeros-conta'

export const dynamic = 'force-dynamic'

/**
 * AS CONTAS SIMULADAS DE QUEM PEDE — o que o WebTrader (M3) lê ao abrir.
 *
 * Contas, posições abertas, ordens pendentes e o catálogo de símbolos com o último preço, numa
 * só ida: o ecrã abre com tudo em vez de quatro pedidos em cascata.
 *
 * Sessão por token OU cookie, como as outras rotas da app: dentro do MTM System a sessão chega
 * como Bearer.
 *
 * `?leve=1` (o seletor do WebTrader): SÓ as contas. O WebTrader nunca usou posições, ordens, catálogo
 * nem preços desta resposta — e o catálogo (1026 símbolos) + a tabela de preços inteira eram duas
 * leituras grandes à base a cada abertura. Sem o parâmetro, a resposta fica igual à de sempre.
 */
export async function GET(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'sem sessão' }, { status: 401 })

  const db = getSupabaseAdmin()
  // `pausada_em`/`conta_casa` quando existem (numeros-conta.ts): a pausa do admin lê-se «Pause» aqui como no admin.
  const { data: contas } = await selecionarComOpcionais<Record<string, unknown>>(
    'id, tipo, estado, motor, mt5_login, servidor, program_id, tournament_id, saldo_inicial, alavancagem, sim_saldo, sim_equity, sim_margem, sim_ancora_dia, sim_pico_equity, sim_dias_negociados, quebrou_regra, metricas, created_at, segue_estrategia, aceita_t2t',
    (cols) => db.from('mtm_trading_accounts').select(cols).eq('user_id', userId).eq('motor', 'sim').order('created_at', { ascending: false }) as never,
  )

  const leve = request.nextUrl.searchParams.get('leve') === '1'
  const ids = (contas ?? []).map((c) => c.id as string)
  const programIds = [...new Set((contas ?? []).map((c) => c.program_id as string | null).filter(Boolean))] as string[]
  const vazio = Promise.resolve({ data: [] as Record<string, unknown>[] })
  const [{ data: posicoes }, { data: ordens }, { data: simbolos }, { data: precos }, { data: programas }] = await Promise.all([
    leve ? vazio : ids.length
      ? db.from('funded_positions').select('*').in('account_id', ids).eq('estado', 'aberta').order('aberta_em', { ascending: false })
      : Promise.resolve({ data: [] }),
    leve ? vazio : ids.length
      ? db.from('funded_orders').select('*').in('account_id', ids).eq('estado', 'pendente').order('criada_em', { ascending: false })
      : Promise.resolve({ data: [] }),
    leve ? vazio : db.from('funded_symbols')
      .select('symbol, nome, classe, digits, contract_size, pip_size, spread_pontos, comissao_lote, volume_min, volume_step, volume_max, alavancagem_max, horario')
      .eq('ativo', true).order('ordem'),
    leve ? vazio : db.from('funded_precos').select('symbol, bid, ask, em'),
    // Programas só das contas que os têm (e nenhum pedido sem contas).
    programIds.length ? db.from('mtm_funded_programs').select('id, slug, nome, fases, regras').in('id', programIds) : vazio,
  ])
  // Contas que seguem uma estratégia do MTM Auto (migração 070): o nome dela vai pronto para o seletor.
  const slugs = [...new Set((contas ?? []).map((c) => (c as { segue_estrategia?: string | null }).segue_estrategia).filter(Boolean))] as string[]
  const { data: estrategias } = slugs.length
    ? await db.from('mtmauto_providers').select('slug, nome').in('slug', slugs)
    : { data: [] as Array<{ slug: string; nome: string }> }
  const nomeDe = new Map((estrategias ?? []).map((e) => [String(e.slug), String(e.nome)]))

  const programaDe = new Map((programas ?? []).map((p) => [p.id as string, p]))

  return NextResponse.json({
    contas: (contas ?? []).map((c) => {
      const prog = c.program_id ? programaDe.get(c.program_id as string) : null
      const m = c.metricas as Record<string, unknown> | null
      return {
        ...c,
        // As etiquetas vêm prontas: o seletor de contas do WebTrader mostra F1/Active sem reimplementar a regra.
        etiqueta: tipoCurto(c.tipo as string, m),
        estadoCurto: estadoCurto(c.estado as string, m, (c.pausada_em as string | null) ?? null),
        programa: prog ? { slug: prog.slug, nome: prog.nome, fases: prog.fases, regras: prog.regras } : null,
        segueEstrategia: (c as { segue_estrategia?: string | null }).segue_estrategia
          ? { slug: String((c as { segue_estrategia?: string }).segue_estrategia), nome: nomeDe.get(String((c as { segue_estrategia?: string }).segue_estrategia)) ?? String((c as { segue_estrategia?: string }).segue_estrategia) }
          : null,
      }
    }),
    ...(leve ? {} : { posicoes: posicoes ?? [], ordens: ordens ?? [], simbolos: simbolos ?? [], precos: precos ?? [] }),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
