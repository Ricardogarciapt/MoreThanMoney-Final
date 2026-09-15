import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAccess } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  decisaoDeAcesso, validarPedido, paraCsv, fotografia, ACCOES_DE_DINHEIRO,
} from '@/lib/mtmfunded/admin-conta'
import { ErroAdmin, executarAccao, contarAbertas } from '@/lib/mtmfunded/admin-conta-accoes'
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

async function lerConta(id: string) {
  const { data } = await getSupabaseAdmin().from('mtm_trading_accounts').select('*').eq('id', id).maybeSingle()
  return data as (Record<string, unknown> & { id: string; estado: string; motor: string; tipo: string }) | null
}

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

  return NextResponse.json({
    conta: {
      ...SEM_PASSWORDS(conta),
      etiqueta: tipoCurto(conta.tipo, m),
      estadoCurto: estadoCurto(conta.estado, m, (conta.pausada_em as string | null) ?? null),
      analise,
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

  const db = getSupabaseAdmin()
  const conta = await lerConta(id)
  if (!conta) return NextResponse.json({ error: 'conta não encontrada' }, { status: 404 })

  // ── 1. a intenção na auditoria, com a chave (única) ──────────────────────
  const pedidoAuditado = Object.fromEntries(Object.entries(pedido).filter(([k]) => k !== 'confirmacao'))
  const { data: linha, error: erroAudit } = await db.from('mtm_funded_admin_audit').insert({
    account_id: id,
    admin_id: g.adminId,
    admin_email: g.adminEmail,
    accao: pedido.accao,
    motivo: 'motivo' in pedido ? pedido.motivo ?? null : null,
    pedido: pedidoAuditado,
    antes: fotografia(conta),
    chave_idempotencia: chave,
  }).select('id').single()

  if (erroAudit) {
    if (erroAudit.code === '23505') {
      const { data: anterior } = await db.from('mtm_funded_admin_audit')
        .select('account_id, accao, estado, resultado').eq('chave_idempotencia', chave).maybeSingle()
      if (!anterior || anterior.account_id !== id || anterior.accao !== pedido.accao) {
        return NextResponse.json({ error: 'chave de idempotência já usada noutra acção' }, { status: 409 })
      }
      if (anterior.estado === 'em_curso') return NextResponse.json({ error: 'esta acção ainda está a correr' }, { status: 409 })
      if (anterior.estado === 'falhou') {
        return NextResponse.json({ error: `já falhou antes: ${(anterior.resultado as { erro?: string } | null)?.erro ?? '—'} (abre a confirmação outra vez para repetir)` }, { status: 409 })
      }
      // Regenerar credenciais não devolve as passwords da primeira vez: não foram guardadas.
      return NextResponse.json({ ok: true, repetido: true, resultado: anterior.resultado })
    }
    // Sem auditoria não se age: uma acção de admin sem registo é uma acção que ninguém pode explicar.
    const falta = /42P01|PGRST205|mtm_funded_admin_audit/i.test(`${erroAudit.code} ${erroAudit.message}`)
    return NextResponse.json(
      { error: falta ? 'auditoria indisponível — aplica a migração 079 antes de gerir contas' : `auditoria falhou: ${erroAudit.message}` },
      { status: 503 },
    )
  }

  // ── 2. a acção ───────────────────────────────────────────────────────────
  const agora = new Date().toISOString()
  let status = 200
  let resposta: Record<string, unknown>
  let paraAuditoria: Record<string, unknown>
  let estado: 'ok' | 'falhou' = 'ok'
  try {
    const r = await executarAccao({ db, adminId: g.adminId, adminEmail: g.adminEmail, conta, agora }, pedido)
    resposta = { ok: true, ...r.resposta }
    paraAuditoria = r.auditoria ?? r.resposta
  } catch (e) {
    estado = 'falhou'
    status = e instanceof ErroAdmin ? e.status : typeof (e as { status?: number }).status === 'number' ? (e as { status: number }).status : 500
    const erro = e instanceof Error ? e.message : String(e)
    if (status === 500) console.error('[admin/mtmfunded/conta]', pedido.accao, id, e)
    resposta = { error: erro }
    paraAuditoria = { erro }
  }

  // ── 3. o depois ──────────────────────────────────────────────────────────
  const depois = estado === 'ok' ? fotografia(await lerConta(id)) : null
  const { error: erroFecho } = await db.from('mtm_funded_admin_audit').update({
    depois, resultado: paraAuditoria, estado, concluido_em: new Date().toISOString(),
  }).eq('id', linha.id)
  if (erroFecho) console.error('[admin/mtmfunded/conta] auditoria não fechou', linha.id, erroFecho.message)

  return NextResponse.json(
    { ...resposta, dinheiro: ACCOES_DE_DINHEIRO.has(pedido.accao) || undefined },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}
