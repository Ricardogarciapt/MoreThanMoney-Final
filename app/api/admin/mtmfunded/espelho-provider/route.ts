import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { escreverEstrategia } from '@/lib/admin-centro/servidor/estrategia-escrita'
import { quemAdminDoSite } from '@/lib/admin-centro/servidor/quem-decide'
import { msEntre, resumirLatencias, veredictoEspelho, type LinhaComparacao } from '@/lib/mtmfunded/espelho/provider'

export const dynamic = 'force-dynamic'

/**
 * ESPELHO PROVIDER — relatório e configuração (admin).
 *
 * GET  ?dias=30   → estratégias com conta espelho, comparação trade a trade (mestre MetaApi vs
 *                   espelho com gestão nossa), propagação para fora (copia_eventos das rotas com
 *                   origem na conta espelho), veredicto por estratégia e o pulso do motor do VPS.
 * POST { accao: 'criar_conta', slug, saldo? }  → conta simulada da CASA (conta_casa, analise) ligada à estratégia
 *      { accao: 'ligar', slug, ativo }         → liga/desliga o espelho desta estratégia no motor
 *      { accao: 'config', slug, config }       → seguirFechos / seguirParciais / copiarNiveisIniciais
 *
 * Só leituras em lote e com limite (Supabase frágil): uma consulta por tabela, nada por linha.
 */
export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const dias = Math.min(180, Math.max(1, Number(request.nextUrl.searchParams.get('dias') ?? 30)))
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const { data: provs, error } = await db.from('mtmauto_providers')
    .select('id, slug, nome, metaapi_account_id, espelho_funded_account_id, espelho_provider_ativo, espelho_config, be_gatilho, trailing_arranca_pips, trailing_distancia_pips, trailing_passo_pips, saidas_pct, trailing_tempo_real')
    .order('slug')
  if (error) {
    if (/does not exist/.test(error.message)) return NextResponse.json({ migracao: false, erro: 'migração 082 por aplicar' })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const contaIds = (provs ?? []).map((p) => p.espelho_funded_account_id).filter(Boolean) as string[]

  const [contasR, compR, rotasR, pulsoR, veredR] = await Promise.all([
    contaIds.length ? db.from('mtm_trading_accounts').select('id, mt5_login, sim_saldo, sim_equity, saldo_inicial, estado').in('id', contaIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    contaIds.length
      ? db.from('espelho_comparacao').select('*').in('espelho_account_id', contaIds).gte('created_at', desde).order('created_at', { ascending: false }).limit(1000)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    contaIds.length
      ? db.from('copia_rotas').select('id, origem_ref, destino_tipo, destino_ref, modo, ativa, estado').eq('origem_tipo', 'mtmfunded').in('origem_ref', contaIds.map((id) => `funded:${id}`))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    db.from('servicos_pulso').select('servico, host, versao, estado, em').eq('servico', 'mtm-funded-motor').maybeSingle(),
    db.from('espelho_veredito').select('*'),
  ])
  const rotas = (rotasR.data ?? []) as Array<{ id: string; origem_ref: string; destino_tipo: string; destino_ref: string; modo: string; ativa: boolean; estado: string }>

  // Propagação: outbox (trigger na mesma transacção do facto) → processado pelo motor de cópia.
  let eventos: Array<{ rota_id: string; tipo: string; origem_posicao_id: string; origem_em: string | null; processado_em: string | null; resultado: string | null; latencia_ms: number | null }> = []
  if (rotas.length) {
    const { data } = await db.from('copia_eventos')
      .select('rota_id, tipo, origem_posicao_id, origem_em, processado_em, resultado, latencia_ms')
      .in('rota_id', rotas.map((r) => r.id)).gte('criado_em', desde).order('id', { ascending: false }).limit(5000)
    eventos = (data ?? []) as typeof eventos
  }
  // Tick do nosso feed → outbox, nas aberturas (tick_entrada.em é a hora do preço usado).
  const abertas = [...new Set(eventos.filter((e) => e.tipo === 'open').map((e) => e.origem_posicao_id))].slice(0, 500)
  const ticks = new Map<string, { tick: string | null; decidido: string | null }>()
  if (abertas.length) {
    const { data } = await db.from('funded_positions').select('id, tick_em:tick_entrada->>em, decidido_em:tick_entrada->>decidido_em').in('id', abertas)
    for (const r of (data ?? []) as Array<{ id: string; tick_em: string | null; decidido_em: string | null }>) ticks.set(String(r.id), { tick: r.tick_em, decidido: r.decidido_em })
  }

  const comparacoes = (compR.data ?? []) as unknown as Array<LinhaComparacao & { id: string; created_at: string; espelho_account_id: string }>
  const contas = new Map(((contasR.data ?? []) as Array<Record<string, unknown>>).map((c) => [String(c.id), c]))
  const veredSql = new Map(((veredR.data ?? []) as Array<Record<string, unknown>>).map((v) => [String(v.estrategia), v]))

  const estrategias = (provs ?? []).map((p) => {
    const contaId = p.espelho_funded_account_id as string | null
    const linhas = contaId ? comparacoes.filter((c) => c.espelho_account_id === contaId) : []
    const rotasDaConta = contaId ? rotas.filter((r) => r.origem_ref === `funded:${contaId}`) : []
    const evs = eventos.filter((e) => rotasDaConta.some((r) => r.id === e.rota_id))
    const propagacao = evs.map((e) => msEntre(e.origem_em, e.processado_em)).filter((x): x is number => x != null)
    const porTipo = Object.fromEntries(['open', 'modify', 'partial', 'close'].map((t) => [t, resumirLatencias(evs.filter((e) => e.tipo === t).map((e) => msEntre(e.origem_em, e.processado_em)).filter((x): x is number => x != null))]))
    const tickOutbox = resumirLatencias(evs.filter((e) => e.tipo === 'open').map((e) => msEntre(ticks.get(e.origem_posicao_id)?.tick, e.origem_em)).filter((x): x is number => x != null))
    const decisaoOutbox = resumirLatencias(evs.filter((e) => e.tipo === 'open').map((e) => msEntre(ticks.get(e.origem_posicao_id)?.decidido, e.origem_em)).filter((x): x is number => x != null))
    const fechadas = linhas.filter((l) => l.estado !== ('em_curso' as string))
    return {
      slug: p.slug, nome: p.nome, mestre: p.metaapi_account_id, ativo: p.espelho_provider_ativo === true, config: p.espelho_config ?? {},
      regras: { be_gatilho: p.be_gatilho, trailing_arranca_pips: p.trailing_arranca_pips, trailing_distancia_pips: p.trailing_distancia_pips, trailing_passo_pips: p.trailing_passo_pips, saidas_pct: p.saidas_pct, trailing_tempo_real: p.trailing_tempo_real },
      conta: contaId ? { id: contaId, ...(contas.get(contaId) ?? {}) } : null,
      emCurso: linhas.length - fechadas.length,
      veredicto: veredictoEspelho(fechadas, propagacao),
      vereditoSql: veredSql.get(String(p.slug)) ?? null,
      propagacao: { rotas: rotasDaConta.length, eventos: evs.length, total: resumirLatencias(propagacao), porTipo, tickOutbox, decisaoOutbox, emSombra: evs.filter((e) => e.resultado === 'sombra').length },
      trades: linhas.slice(0, 200),
    }
  })

  return NextResponse.json({ migracao: true, dias, estrategias, pulso: pulsoR.data ?? null, veredictoSqlDisponivel: !veredR.error })
}

/**
 * FACHADA (05/10): as escritas do espelho vivem na camada única (`estrategia-escrita.ts`, acção
 * `espelho`). O corpo antigo `{ accao, slug, … }` continua a valer.
 */
export const POST = soAdmin(async (adminId: string, request: NextRequest) => {
  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const r = await escreverEstrategia(quemAdminDoSite(adminId), { ...b, accao: 'espelho', sub: String(b.accao ?? ''), slug: String(b.slug ?? '') })
  if (!r.ok) return NextResponse.json({ error: r.mensagem, ...(r.dados ?? {}) }, { status: r.status })
  return NextResponse.json({ ok: true, ...(r.dados ?? {}) })
})
