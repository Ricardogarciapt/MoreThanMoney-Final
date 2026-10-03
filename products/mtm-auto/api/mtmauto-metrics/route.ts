import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * Métricas da MTM Auto do próprio membro, para o terminal do site.
 *
 * A MTM Auto é uma app separada, mas partilha a autenticação com o site: quem já é membro entra
 * lá com o mesmo email. Faz por isso sentido ver aqui o que a app fez na conta dele — em vez de
 * ter de saltar entre dois sítios para saber como está o mês.
 *
 * Não devolve nada a quem não tem MTM Auto: o ecrã só mostra o painel se houver mesmo dados.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  const { data: { user }, error } = await db.auth.getUser(auth.replace('Bearer ', ''))
  if (error || !user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const dias = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get('dias')) || 30))
  const desde = new Date(Date.now() - dias * 86400_000).toISOString()

  const [{ data: perfil }, { data: contas }] = await Promise.all([
    db.from('mtmauto_users').select('subscricao, isento, acesso_manual, papel').eq('user_id', user.id).maybeSingle(),
    db.from('mtmauto_accounts').select('id, rotulo, corretora, estado, demo, copia_ativa, plataforma, funded_account_id').eq('user_id', user.id),
  ])

  // Sem ficha na MTM Auto não há nada a mostrar — e inventar um painel vazio só confunde.
  if (!perfil && !(contas ?? []).length) return NextResponse.json({ temMtmAuto: false })

  const { data: execucoes } = await db
    .from('mtmauto_executions')
    .select('id, estado, motivo, resultado, resultado_pips, lote, created_at, fechado_em, mtmauto_signals(symbol, direction, mtmauto_providers(nome))')
    .eq('user_id', user.id)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(500)

  const linhas = (execucoes ?? []).map((e) => {
    const sig = (e as unknown as { mtmauto_signals?: { symbol?: string; direction?: string; mtmauto_providers?: { nome?: string } } }).mtmauto_signals
    return {
      id: e.id as string,
      estado: e.estado as string,
      motivo: (e.motivo as string) ?? null,
      resultado: e.resultado != null ? Number(e.resultado) : null,
      pips: e.resultado_pips != null ? Number(e.resultado_pips) : null,
      lote: e.lote != null ? Number(e.lote) : null,
      symbol: sig?.symbol ?? '—',
      direction: sig?.direction ?? null,
      estrategia: sig?.mtmauto_providers?.nome ?? '—',
      quando: (e.fechado_em as string) ?? (e.created_at as string),
    }
  })

  const fechadas = linhas
    .filter((l) => l.estado === 'closed' && l.resultado != null)
    .sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime())
  const ganhas = fechadas.filter((l) => (l.resultado ?? 0) > 0).length

  // Curva acumulada: é a resposta à pergunta que se faz primeiro — "está a crescer?".
  let acumulado = 0
  const curva = fechadas.map((l) => {
    acumulado += l.resultado ?? 0
    return { quando: l.quando, valor: Math.round(acumulado * 100) / 100 }
  })

  // Por estratégia: onde é que o dinheiro está mesmo a ser feito (ou perdido).
  const porEstrategia = new Map<string, { trades: number; ganhas: number; resultado: number; pips: number }>()
  for (const l of fechadas) {
    const g = porEstrategia.get(l.estrategia) ?? { trades: 0, ganhas: 0, resultado: 0, pips: 0 }
    g.trades++
    if ((l.resultado ?? 0) > 0) g.ganhas++
    g.resultado += l.resultado ?? 0
    g.pips += l.pips ?? 0
    porEstrategia.set(l.estrategia, g)
  }

  /**
   * Contas MTM Funded no MTM Auto (plataforma 'mtmfunded', migração 070): cada uma segue UMA
   * estratégia e negoceia no motor simulado. O desempenho vem das posições dela — as execuções do
   * MTM Auto (`mtmauto_executions`) não as incluem, porque não passam pelo executor.
   */
  const fundedIds = (contas ?? []).filter((c) => c.plataforma === 'mtmfunded' && c.funded_account_id).map((c) => String(c.funded_account_id))
  const contasFunded: Array<Record<string, unknown>> = []
  if (fundedIds.length) {
    const { desempenhoDaConta } = await import('@/lib/mtmfunded/simulado/desempenho')
    const [{ data: sims }, { data: fechadas }, { data: abertas }, { data: provs }] = await Promise.all([
      db.from('mtm_trading_accounts').select('id, mt5_login, saldo_inicial, sim_saldo, sim_equity, segue_estrategia, estado').in('id', fundedIds),
      db.from('funded_positions').select('id, account_id, mae_id, symbol, direcao, volume, preco_entrada, preco_fecho, pnl, comissao, swap, fechada_em, origem, comentario')
        .in('account_id', fundedIds).eq('estado', 'fechada').limit(10000),
      db.from('funded_positions').select('id, account_id').in('account_id', fundedIds).eq('estado', 'aberta'),
      db.from('mtmauto_providers').select('slug, nome'),
    ])
    const nomeDe = new Map((provs ?? []).map((p) => [String(p.slug), String(p.nome)]))
    for (const s of sims ?? []) {
      const id = String(s.id)
      const d = desempenhoDaConta({
        saldoInicial: Number(s.saldo_inicial ?? 0),
        equity: Number(s.sim_equity ?? s.sim_saldo ?? 0),
        fechadas: (fechadas ?? []).filter((f) => f.account_id === id) as never,
        abertasIds: new Set((abertas ?? []).filter((a) => a.account_id === id).map((a) => String(a.id))),
      })
      contasFunded.push({
        accountId: id, login: s.mt5_login, estado: s.estado,
        estrategia: s.segue_estrategia ? nomeDe.get(String(s.segue_estrategia)) ?? s.segue_estrategia : null,
        saldo: s.sim_saldo == null ? null : Number(s.sim_saldo), equity: s.sim_equity == null ? null : Number(s.sim_equity),
        posicoesAbertas: (abertas ?? []).filter((a) => a.account_id === id).length,
        desempenho: d,
      })
    }
  }

  return NextResponse.json({
    temMtmAuto: true,
    contasFunded,
    dias,
    acesso: {
      subscricao: perfil?.subscricao ?? 'none',
      isento: Boolean(perfil?.isento),
      manual: Boolean(perfil?.acesso_manual),
    },
    contas: (contas ?? []).map((c) => ({
      rotulo: (c.rotulo as string) ?? (c.corretora as string) ?? 'Conta',
      estado: c.estado as string,
      demo: Boolean(c.demo),
      copiaAtiva: c.copia_ativa !== false,
      plataforma: (c.plataforma as string) ?? 'mt5',
    })),
    resumo: {
      total: linhas.length,
      abertas: linhas.filter((l) => l.estado === 'open').length,
      fechadas: fechadas.length,
      naoAbriram: linhas.filter((l) => l.estado === 'skipped').length,
      resultado: Math.round(fechadas.reduce((a, l) => a + (l.resultado ?? 0), 0) * 100) / 100,
      pips: Math.round(fechadas.reduce((a, l) => a + (l.pips ?? 0), 0) * 10) / 10,
      // Sem trades fechadas não se inventa uma taxa de acerto.
      winrate: fechadas.length ? Math.round((ganhas / fechadas.length) * 100) : null,
      melhor: fechadas.length ? Math.max(...fechadas.map((l) => l.resultado ?? 0)) : null,
      pior: fechadas.length ? Math.min(...fechadas.map((l) => l.resultado ?? 0)) : null,
    },
    curva,
    estrategias: [...porEstrategia.entries()]
      .map(([nome, g]) => ({
        nome,
        trades: g.trades,
        winrate: g.trades ? Math.round((g.ganhas / g.trades) * 100) : null,
        resultado: Math.round(g.resultado * 100) / 100,
        pips: Math.round(g.pips * 10) / 10,
      }))
      .sort((a, b) => b.resultado - a.resultado),
    ultimas: linhas.slice(0, 8),
  })
}
