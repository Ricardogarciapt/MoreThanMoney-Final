import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAccess } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  decisaoDeAcesso, validarPedido, paraCsv, fotografia, ACCOES_DE_DINHEIRO,
} from '@/lib/mtmfunded/admin-conta'
import { contarAbertas } from '@/lib/mtmfunded/admin-conta-accoes'
import { executarComAuditoria, lerContaFunded } from '@/lib/mtmfunded/admin-conta-executar'
import { tipoCurto, estadoCurto } from '@/lib/mtmfunded/etiquetas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * A GESTÃO DE UMA CONTA MTM FUNDED PELO ADMIN — o modal de /admin?tab=mtmfunded.
 *
 * GET  ?vista=resumo|posicoes|metricas|historico|levantamentos|auditoria  (historico&formato=csv)
 * POST { accao, chave, … }  — ver lib/mtmfunded/admin-conta.ts (PedidoAccao)
 *
 * Só admin (sessão verificada no servidor, 401/403 antes de qualquer leitura). Cada POST:
 *  1. valida o corpo (zod) — acções explícitas, nada de patch genérico;
 *  2. regista a intenção na auditoria com a chave de idempotência (única) ANTES de agir — a mesma
 *     chave outra vez devolve o resultado da primeira, e sem a tabela (079) não se age (503);
 *  3. executa pelas mesmas funções do WebTrader/motor (lib/mtmfunded/admin-conta-accoes.ts);
 *  4. fecha a linha da auditoria com o depois e o resultado (passwords nunca).
 *
 * Leituras curtas e indexadas: nada aqui é chamado mais do que de 20 em 20 s pelo modal.
 */

type Ctx = { params: Promise<{ id: string }> }

const CONTA_ID = /^[0-9a-f-]{36}$/i
const SEM_PASSWORDS = (c: Record<string, unknown>) => {
  const { mt5_password_cifrada: _a, mt5_investor_cifrada: _b, ...resto } = c
  return resto
}

async function guarda() {
  const a = await verifyAdminAccess()
  const d = decisaoDeAcesso(a)
  if (d) return { negado: NextResponse.json({ error: d.erro }, { status: d.status }) } as const
  return { adminId: a.userId as string, adminEmail: a.email ?? null } as const
}

/** A mesma leitura do bot de Telegram (lib/mtmfunded/admin-conta-executar.ts). */
const lerConta = lerContaFunded

export async function GET(request: NextRequest, { params }: Ctx) {
  const g = await guarda()
  if ('negado' in g) return g.negado

  const { id } = await params
  if (!CONTA_ID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const db = getSupabaseAdmin()
  const sp = request.nextUrl.searchParams
  const vista = sp.get('vista') ?? 'resumo'
  const conta = await lerConta(id)
  if (!conta) return NextResponse.json({ error: 'conta não encontrada' }, { status: 404 })
  const semCache = { headers: { 'Cache-Control': 'no-store' } }

  // ── posições & ordens (o modal relê de 20 em 20 s com o separador à vista) ──
  if (vista === 'posicoes') {
    if (conta.motor !== 'sim') return NextResponse.json({ motor: conta.motor, posicoes: [], ordens: [], nota: 'conta da corretora — posições na MetaApi' }, semCache)
    const [{ data: posicoes }, { data: ordens }] = await Promise.all([
      db.from('funded_positions').select('*').eq('account_id', id).eq('estado', 'aberta').order('aberta_em', { ascending: true }).limit(500),
      db.from('funded_orders').select('*').eq('account_id', id).eq('estado', 'pendente').order('criada_em', { ascending: false }).limit(500),
    ])
    const ex = await import('@/lib/mtmfunded/simulado/execucao')
    const { simbolosParaMedir, posicaoDaLinha } = await import('@/lib/mtmfunded/simulado/ordens')
    const { estadoDaConta, lucroUsd, precoDeFecho } = await import('@/lib/mtmfunded/simulado/matematica')
    const envolvidos = [...(posicoes ?? []), ...(ordens ?? [])].map((x) => String(x.symbol))
    const simbolos = await ex.carregarSimbolos(envolvidos, false)
    const { precos, em } = await ex.carregarPrecos(simbolosParaMedir(Object.values(simbolos)))
    const abertas = (posicoes ?? []).map(posicaoDaLinha)
    const estado = estadoDaConta(Number(conta.sim_saldo ?? 0), Number(conta.alavancagem ?? 100), abertas, simbolos, precos)
    return NextResponse.json({
      motor: 'sim',
      estado: { saldo: Number(conta.sim_saldo ?? 0), ...estado },
      posicoes: (posicoes ?? []).map((linha, i) => {
        const p = abertas[i]
        const s = simbolos[p.symbol]
        const preco = precos[p.symbol]
        const pnl = s && preco ? lucroUsd(s, p.direcao, p.volume, p.preco_entrada, precoDeFecho(p.direcao, preco), precos) : null
        return { ...linha, precoAtual: preco ? precoDeFecho(p.direcao, preco) : null, pnlFlutuante: pnl == null ? null : Math.round((pnl + (p.swap || 0)) * 100) / 100 }
      }),
      ordens: ordens ?? [],
      precos: Object.fromEntries(Object.entries(precos).map(([s, p]) => [s, { ...p, em: em[s] }])),
      digitos: Object.fromEntries(Object.entries(simbolos).map(([s, x]) => [s, x.digits])),
    }, semCache)
  }

  // ── métricas (as mesmas contas do separador Estatísticas do WebTrader) ─────
  if (vista === 'metricas') {
    // A MESMA função da rota do WebTrader (lib/mtmfunded/numeros-conta.ts) — antes eram duas cópias.
    const { estatisticasDaContaServidor, reduzirCurva, PONTOS_CURVA } = await import('@/lib/mtmfunded/numeros-conta')
    const est = await estatisticasDaContaServidor(db, conta as never)
    return NextResponse.json({ ...est, curva: reduzirCurva(est.curva, PONTOS_CURVA), moeda: 'USD' }, semCache)
  }

  // ── histórico (filtros + CSV) ─────────────────────────────────────────────
  if (vista === 'historico') {
    const csv = sp.get('formato') === 'csv'
    let q = db.from('funded_positions')
      .select('id, mae_id, symbol, direcao, volume, preco_entrada, preco_fecho, sl, tp, pnl, comissao, swap, motivo_fecho, origem, comentario, aberta_em, fechada_em')
      .eq('account_id', id).eq('estado', 'fechada')
      .order('fechada_em', { ascending: false })
      .limit(csv ? 10000 : 300)
    const desde = sp.get('desde'); const ate = sp.get('ate')
    const simbolo = sp.get('symbol'); const origem = sp.get('origem'); const direcao = sp.get('direcao')
    if (desde && !Number.isNaN(Date.parse(desde))) q = q.gte('fechada_em', new Date(desde).toISOString())
    if (ate && !Number.isNaN(Date.parse(ate))) q = q.lte('fechada_em', new Date(Date.parse(ate) + 86_399_999).toISOString())
    if (simbolo) q = q.eq('symbol', simbolo.toUpperCase().slice(0, 30))
    if (origem && /^[a-z_]{3,20}$/.test(origem)) q = q.eq('origem', origem)
    if (direcao === 'buy' || direcao === 'sell') q = q.eq('direcao', direcao)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (csv) {
      const colunas = ['id', 'mae_id', 'symbol', 'direcao', 'volume', 'preco_entrada', 'preco_fecho', 'sl', 'tp', 'pnl', 'comissao', 'swap', 'motivo_fecho', 'origem', 'comentario', 'aberta_em', 'fechada_em']
      return new NextResponse(paraCsv((data ?? []) as Array<Record<string, unknown>>, colunas), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="conta-${String(conta.mt5_login ?? id).replace(/[^\w-]/g, '')}-historico.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }
    return NextResponse.json({ trades: data ?? [] }, semCache)
  }

  // ── levantamentos desta conta ────────────────────────────────────────────
  if (vista === 'levantamentos') {
    const { levantavelUsd, almofadaUsd } = await import('@/lib/mtmfunded/contrato')
    const [{ data: pedidos }, contagem] = await Promise.all([
      db.from('mtm_funded_withdrawals')
        .select('id, valor_usd, uid_broker, endereco_cripto, estado, motivo, criado_em, pago_em, atualizado_em')
        .eq('account_id', id).order('criado_em', { ascending: false }).limit(50),
      conta.motor === 'sim' ? contarAbertas(db, id) : Promise.resolve(null),
    ])
    const jaPago = (pedidos ?? []).filter((x) => ['pago', 'aprovado'].includes(String(x.estado))).reduce((t, x) => t + Number(x.valor_usd ?? 0), 0)
    const { equityParaLevantamento } = await import('@/lib/mtmfunded/numeros-conta')
    const equity = equityParaLevantamento(conta as never)
    return NextResponse.json({
      pedidos: pedidos ?? [],
      regras: {
        funded: ['financiada', 'funded'].includes(conta.tipo),
        ativa: conta.estado === 'ativa',
        abertas: contagem?.abertas ?? null,
        pendentes: contagem?.pendentes ?? null,
        saldoExacto: conta.motor === 'sim' ? Number(conta.sim_saldo ?? 0) : null,
        almofada: almofadaUsd(Number(conta.saldo_inicial ?? 0)),
        jaPago,
        // O levantável de um pedido novo; ao aprovar, o próprio pedido sai do «já pago».
        levantavel: levantavelUsd(Number(conta.saldo_inicial ?? 0), equity, jaPago),
      },
    }, semCache)
  }

  // ── apagar: o que desaparece com a conta (só leitura — nada é apagado aqui) ──
  if (vista === 'apagar') {
    const { recolherPendurados } = await import('@/lib/mtmfunded/apagar-conta-servidor')
    const { decisao, dados } = await recolherPendurados(db, conta)
    return NextResponse.json({
      conta: {
        login: dados.conta.login, tipo: tipoCurto(conta.tipo, (conta.metricas ?? {}) as Record<string, unknown>), estado: dados.conta.estado,
        saldo: dados.conta.saldo, saldoInicial: dados.conta.saldoInicial,
        etiquetaDoDono: typeof conta.etiqueta === 'string' && conta.etiqueta ? conta.etiqueta : null,
      },
      ...decisao,
    }, semCache)
  }

  // ── histórico de ajustes de saldo (197) + a referência sugerida ──────────
  if (vista === 'ajustes') {
    const { data, error } = await db.from('mtm_funded_ajustes_saldo')
      .select('id, tipo, estado, delta, saldo_antes, saldo_depois, referencia, observacao, transferencia_id, conta_contraparte, admin_email, email_enviado_em, email_estado, criado_em, aplicado_em')
      .eq('account_id', id).order('criado_em', { ascending: false }).limit(200)
    if (error) return NextResponse.json({ ajustes: [], aviso: 'histórico indisponível — migração 197 por aplicar' }, semCache)
    const contraparteIds = [...new Set((data ?? []).map((a) => a.conta_contraparte).filter(Boolean) as string[])]
    const { data: cps } = contraparteIds.length
      ? await db.from('mtm_trading_accounts').select('id, mt5_login').in('id', contraparteIds)
      : { data: [] as Array<{ id: string; mt5_login: string | null }> }
    const loginDe = new Map((cps ?? []).map((x) => [x.id, x.mt5_login]))
    const { data: dono } = conta.user_id
      ? await db.from('profiles').select('full_name').eq('id', conta.user_id as string).maybeSingle()
      : { data: null }
    return NextResponse.json({
      ajustes: (data ?? []).map((a) => ({ ...a, contraparteLogin: a.conta_contraparte ? loginDe.get(a.conta_contraparte) ?? null : null })),
      nomeDono: (dono as { full_name?: string } | null)?.full_name ?? null,
      saldo: conta.motor === 'sim' ? Number(conta.sim_saldo ?? 0) : null,
      arquivada: conta.arquivada_em ? { em: conta.arquivada_em, motivo: conta.arquivo_motivo ?? null } : null,
    }, semCache)
  }

  // ── auditoria ────────────────────────────────────────────────────────────
  if (vista === 'auditoria') {
    const { data, error } = await db.from('mtm_funded_admin_audit')
      .select('id, admin_id, admin_email, accao, motivo, pedido, antes, depois, resultado, estado, criado_em, concluido_em')
      .eq('account_id', id).order('criado_em', { ascending: false }).limit(200)
    if (error) return NextResponse.json({ registos: [], aviso: 'auditoria indisponível — migração 079 por aplicar' }, semCache)
    return NextResponse.json({ registos: data ?? [] }, semCache)
  }

  // ── resumo ───────────────────────────────────────────────────────────────
  const [perfil, programa, torneio, contagem, auto, t2t, providers] = await Promise.all([
    conta.user_id ? db.from('profiles').select('id, full_name, email, user_type').eq('id', conta.user_id as string).maybeSingle() : Promise.resolve({ data: null }),
    conta.program_id ? db.from('mtm_funded_programs').select('id, slug, nome, fases, saldo, regras').eq('id', conta.program_id as string).maybeSingle() : Promise.resolve({ data: null }),
    conta.tournament_id ? db.from('mtm_tournaments').select('id, slug, nome, regras, comeca_em, acaba_em').eq('id', conta.tournament_id as string).maybeSingle() : Promise.resolve({ data: null }),
    conta.motor === 'sim' ? contarAbertas(db, id) : Promise.resolve(null),
    db.from('mtmauto_accounts').select('*').eq('funded_account_id', id).limit(20),
    db.from('mtmcopy_connections').select('*').eq('funded_account_id', id).limit(20),
    db.from('mtmauto_providers').select('slug, nome, ativo').order('nome', { ascending: true }).limit(100),
  ])
  const m = (conta.metricas ?? {}) as Record<string, unknown>
  const regras = ((programa.data as { regras?: unknown } | null)?.regras ?? (torneio.data as { regras?: unknown } | null)?.regras ?? null) as Record<string, unknown> | null
  // Os números e as barras pela fonte única — as mesmas funções que o WebTrader do dono usa.
  const { numerosDaConta, barrasDaConta } = await import('@/lib/mtmfunded/numeros-conta')
  const num = numerosDaConta(conta as never)
  const equity = num.equity
  const analise = num.analise
  const limpar = (linhas: Array<Record<string, unknown>> | null) =>
    (linhas ?? []).map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !/password|token|secret|cifrad/i.test(k))))

  // 116 — esta conta é a MESTRE de uma estratégia do motor das mestres? (emblema «Mestre · Sensei»)
  const { lerMestresPorConta } = await import('@/lib/mestres/servidor/painel-leitura')
  const mestre = (await lerMestresPorConta().catch(() => new Map())).get(id) ?? null

  return NextResponse.json({
    conta: {
      ...SEM_PASSWORDS(conta),
      // `etiqueta` aqui é o TIPO curto (F1/F2/Funded…); a etiqueta que o dono escreveu (113) vai à parte.
      etiqueta: tipoCurto(conta.tipo, m),
      etiquetaDoDono: typeof conta.etiqueta === 'string' && conta.etiqueta ? conta.etiqueta : null,
      mestre,
      estadoCurto: estadoCurto(conta.estado, m, (conta.pausada_em as string | null) ?? null),
      analise,
      // 109 — conta real da casa (a leitura é `select('*')`: sem a migração vem false).
      contaReal: num.contaReal,
      fase: Number(m.fase ?? 1),
      temPassword: Boolean(conta.mt5_password_cifrada),
      migracao079: 'pausada_em' in conta,
    },
    dono: perfil.data,
    programa: programa.data ? { ...(programa.data as Record<string, unknown>), regras: undefined } : null,
    torneio: torneio.data,
    regras,
    financeiro: {
      saldo: num.saldo,
      equity,
      margem: num.margem,
      flutuante: num.flutuante,
      resultadoPct: num.resultadoPct,
      picoEquity: conta.sim_pico_equity ?? m.picoEquity ?? null,
      ancoraDia: num.ancoraDia,
      atualizadoEm: conta.metricas_lidas_em ?? null,
    },
    barras: barrasDaConta(num, regras),
    contagem,
    destinos: { mtmAuto: limpar(auto.data as never), t2t: limpar(t2t.data as never) },
    estrategias: providers.data ?? [],
  }, semCache)
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const g = await guarda()
  if ('negado' in g) return g.negado

  const { id } = await params
  if (!CONTA_ID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const corpo = await request.json().catch(() => null)
  const v = validarPedido(corpo)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  const { pedido, chave } = v

  const conta = await lerConta(id)
  if (!conta) return NextResponse.json({ error: 'conta não encontrada' }, { status: 404 })

  /*
   * Auditar → executar → fechar o registo. O corpo vive em `lib/mtmfunded/admin-conta-executar.ts`
   * porque o bot de Telegram decide levantamentos pelo MESMO caminho (24/09): duas cópias desta
   * sequência divergiriam no dia em que alguém corrigisse só uma delas.
   */
  const r = await executarComAuditoria({ adminId: g.adminId, adminEmail: g.adminEmail, conta, pedido, chave })

  return NextResponse.json(
    { ...r.resposta, dinheiro: ACCOES_DE_DINHEIRO.has(pedido.accao) || undefined },
    { status: r.status, headers: { 'Cache-Control': 'no-store' } },
  )
}
