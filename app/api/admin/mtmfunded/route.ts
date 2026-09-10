import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmFundedConfig, setMtmFundedConfig } from '@/lib/mtmfunded/config'
import { decifrar } from '@/lib/mtmfunded/credenciais'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Painel de admin do MTM Funded e dos torneios.
 *
 * GET  ?vista=resumo|participantes|contas|certificados|programas
 * POST { accao: … }
 *
 * As acções são EXPLÍCITAS, uma a uma. Nada de um patch genérico que aceite qualquer campo:
 * um endpoint de admin que escreve o que lhe mandarem é um endpoint que um dia escreve o que
 * não devia — e do outro lado estão contas reais e classificações com prémios.
 */

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const db = getSupabaseAdmin()
  const vista = request.nextUrl.searchParams.get('vista') ?? 'resumo'
  const torneioId = request.nextUrl.searchParams.get('torneio')

  // ── participantes ────────────────────────────────────────────────────────
  if (vista === 'participantes') {
    let q = db
      .from('mtm_tournament_participants')
      .select('id, tournament_id, user_id, account_id, nome_publico, email, estado, posicao, resultado_pct, metricas, inscrito_em')
      .order('posicao', { ascending: true, nullsFirst: false })
      .limit(500)
    if (torneioId) q = q.eq('tournament_id', torneioId)
    const { data } = await q

    const ids = [...new Set((data ?? []).map((p) => p.account_id).filter(Boolean))] as string[]
    const contas = new Map<string, Record<string, unknown>>()
    if (ids.length) {
      const { data: cs } = await db
        .from('mtm_trading_accounts')
        .select('id, mt5_login, estado, quebrou_regra, metricas')
        .in('id', ids)
      for (const c of cs ?? []) contas.set(c.id as string, c)
    }

    return NextResponse.json({
      participantes: (data ?? []).map((p) => {
        const c = p.account_id ? contas.get(p.account_id as string) : null
        return {
          ...p,
          // O email VAI inteiro: isto é o painel de admin, e um admin que não vê o email do
          // participante não consegue resolver nada. A censura é para a página pública.
          conta: c ? { login: c.mt5_login, estado: c.estado, quebrouRegra: c.quebrou_regra } : null,
        }
      }),
    })
  }

  // ── contas ───────────────────────────────────────────────────────────────
  if (vista === 'contas') {
    const { data } = await db
      .from('mtm_trading_accounts')
      .select('id, user_id, tipo, tournament_id, mt5_login, servidor, saldo_inicial, alavancagem, estado, quebrou_regra, quebrada_em, metricas, metricas_lidas_em, metaapi_account_id, created_at')
      .order('created_at', { ascending: false })
      .limit(300)

    const uids = [...new Set((data ?? []).map((c) => c.user_id).filter(Boolean))] as string[]
    const nomes = new Map<string, { nome: string; email: string }>()
    if (uids.length) {
      const { data: ps } = await db.from('profiles').select('id, full_name, email').in('id', uids)
      for (const p of ps ?? []) {
        nomes.set(p.id as string, { nome: (p.full_name as string) ?? '—', email: (p.email as string) ?? '—' })
      }
    }

    const { data: fila } = await db
      .from('mtm_account_requests')
      .select('id, account_id, estado, erro, tentativas, created_at')
      .in('estado', ['em_fila', 'reclamado', 'erro'])

    return NextResponse.json({
      contas: (data ?? []).map((c) => ({
        ...c,
        dono: c.user_id ? nomes.get(c.user_id as string) ?? null : null,
        // A password NUNCA sai daqui. O admin vê que ela existe, não qual é: um painel que
        // a mostra é um painel que a deixa num screenshot, num ecrã partilhado, num print.
        pedido: (fila ?? []).find((f) => f.account_id === c.id) ?? null,
      })),
    })
  }

  // ── certificados ─────────────────────────────────────────────────────────
  if (vista === 'certificados') {
    const { data } = await db
      .from('mtm_certificates')
      .select('id, user_id, tournament_id, tipo, codigo, nome, posicao, emitido_em')
      .order('emitido_em', { ascending: false })
      .limit(300)
    return NextResponse.json({ certificados: data ?? [] })
  }

  // ── programas (MTM Funded) ───────────────────────────────────────────────
  if (vista === 'programas') {
    const { data } = await db
      .from('mtm_funded_programs')
      .select('*')
      .order('ordem', { ascending: true })
    const { data: compras } = await db
      .from('mtm_funded_purchases')
      .select('id, program_id, estado, valor_cents, email, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    return NextResponse.json({ programas: data ?? [], compras: compras ?? [] })
  }

  // ── resumo ───────────────────────────────────────────────────────────────
  const config = await getMtmFundedConfig()
  const { data: torneios } = await db
    .from('mtm_tournaments')
    .select('id, slug, nome, estado, publicado, comeca_em, acaba_em, saldo_inicial, alavancagem, servidor, regras, premios')
    .order('comeca_em', { ascending: false })

  const contagens = new Map<string, number>()
  for (const t of torneios ?? []) {
    const { count } = await db
      .from('mtm_tournament_participants')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', t.id)
    contagens.set(t.id as string, count ?? 0)
  }

  const contar = async (tabela: string, campo: string, valor: string) => {
    const { count } = await db.from(tabela).select('id', { count: 'exact', head: true }).eq(campo, valor)
    return count ?? 0
  }
  const { count: totalContas } = await db.from('mtm_trading_accounts').select('id', { count: 'exact', head: true })
  const { count: certificados } = await db.from('mtm_certificates').select('id', { count: 'exact', head: true })

  return NextResponse.json({
    config,
    torneios: (torneios ?? []).map((t) => ({ ...t, participantes: contagens.get(t.id as string) ?? 0 })),
    contas: {
      total: totalContas ?? 0,
      porEmitir: await contar('mtm_trading_accounts', 'estado', 'pedida'),
      ativas: await contar('mtm_trading_accounts', 'estado', 'ativa'),
      quebradas: await contar('mtm_trading_accounts', 'estado', 'quebrada'),
    },
    fila: {
      emFila: await contar('mtm_account_requests', 'estado', 'em_fila'),
      erro: await contar('mtm_account_requests', 'estado', 'erro'),
    },
    certificados: certificados ?? 0,
  })
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const b = await request.json().catch(() => ({}))
  const db = getSupabaseAdmin()
  const accao = String(b?.accao ?? '')

  // ── interruptores ────────────────────────────────────────────────────────
  if (accao === 'config') {
    const config = await setMtmFundedConfig({
      ...(typeof b.ativo === 'boolean' ? { ativo: b.ativo } : {}),
      ...(typeof b.vendas_abertas === 'boolean' ? { vendas_abertas: b.vendas_abertas } : {}),
      ...(Number.isFinite(Number(b.minutos_entre_leituras))
        ? { minutos_entre_leituras: Number(b.minutos_entre_leituras) }
        : {}),
    })
    return NextResponse.json({ ok: true, config })
  }

  // ── torneio: publicar / estado ───────────────────────────────────────────
  if (accao === 'torneio_publicar' || accao === 'torneio_estado') {
    const id = String(b?.torneioId ?? '')
    if (!id) return NextResponse.json({ error: 'torneioId em falta' }, { status: 400 })
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (accao === 'torneio_publicar') patch.publicado = b.publicado !== false
    if (accao === 'torneio_estado') {
      const ESTADOS = ['draft', 'inscricoes', 'a_decorrer', 'terminado', 'cancelado']
      if (!ESTADOS.includes(String(b.estado))) {
        return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
      }
      patch.estado = b.estado
    }
    await db.from('mtm_tournaments').update(patch).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // ── torneio: regras ──────────────────────────────────────────────────────
  if (accao === 'torneio_regras') {
    const id = String(b?.torneioId ?? '')
    const r = b?.regras
    if (!id || !r || typeof r !== 'object') {
      return NextResponse.json({ error: 'torneioId e regras são obrigatórios' }, { status: 400 })
    }
    /**
     * As regras validam-se ANTES de gravar.
     *
     * Uma perda diária maior do que a máxima é uma regra que nunca dispara: o participante
     * rebentava a conta inteira sem nunca bater no limite do dia. E percentagens fora de
     * 0–100 dão contas que morrem à primeira trade, ou que não morrem nunca.
     */
    const num = (v: unknown, min: number, max: number) => {
      const n = Number(v)
      return Number.isFinite(n) && n >= min && n <= max ? n : null
    }
    const diaria = num(r.perda_diaria_pct, 0.5, 50)
    const maxima = num(r.perda_maxima_pct, 0.5, 90)
    if (diaria == null || maxima == null) {
      return NextResponse.json({ error: 'as perdas têm de estar entre 0,5% e 90%' }, { status: 400 })
    }
    if (diaria > maxima) {
      return NextResponse.json(
        { error: 'a perda diária não pode ser maior do que a máxima — seria uma regra que nunca dispara' },
        { status: 400 },
      )
    }
    const regras = {
      perda_diaria_pct: diaria,
      perda_maxima_pct: maxima,
      dias_minimos: num(r.dias_minimos, 0, 365) ?? 0,
      consistencia_pct: num(r.consistencia_pct, 0, 100) ?? 0,
      dias_maximos: num(r.dias_maximos, 0, 3650) ?? 0,
      criterio: 'retorno_percentual',
      desempate: 'menor_drawdown',
    }
    await db.from('mtm_tournaments').update({ regras, updated_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true, regras })
  }

  // ── participante: validar / desclassificar ───────────────────────────────
  if (accao === 'participante_estado') {
    const id = String(b?.participanteId ?? '')
    const ESTADOS = ['inscrito', 'ativo', 'quebrado', 'terminado', 'desclassificado']
    if (!id || !ESTADOS.includes(String(b?.estado))) {
      return NextResponse.json({ error: 'participanteId e estado válidos são obrigatórios' }, { status: 400 })
    }
    await db
      .from('mtm_tournament_participants')
      .update({ estado: b.estado, updated_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // ── conta: repetir o pedido de criação ───────────────────────────────────
  if (accao === 'conta_repetir') {
    const id = String(b?.contaId ?? '')
    if (!id) return NextResponse.json({ error: 'contaId em falta' }, { status: 400 })
    const { data: conta } = await db
      .from('mtm_trading_accounts')
      .select('id, mt5_login, tipo, servidor, saldo_inicial, alavancagem, user_id')
      .eq('id', id)
      .maybeSingle()
    if (!conta) return NextResponse.json({ error: 'conta desconhecida' }, { status: 404 })
    // Uma conta que JÁ tem login não se volta a pedir: criava uma segunda conta real na
    // corretora para a mesma pessoa, e ninguém saberia qual vale.
    if (conta.mt5_login) {
      return NextResponse.json({ error: 'esta conta já foi emitida' }, { status: 409 })
    }
    const { data: perfil } = conta.user_id
      ? await db.from('profiles').select('full_name, email').eq('id', conta.user_id).maybeSingle()
      : { data: null }
    await db.from('mtm_account_requests').insert({
      account_id: id,
      primeiro_nome: ((perfil?.full_name as string) ?? 'MTM').split(/\s+/)[0],
      sobrenome: conta.tipo === 'torneio' ? 'Torneio' : conta.tipo === 'desafio' ? 'Challenge' : 'Funded',
      email: (perfil?.email as string) ?? '',
      servidor: (conta.servidor as string) ?? 'TheTradingMaster-Live',
      tipo_conta: 'ECN',
      deposito: Number(conta.saldo_inicial ?? 10000),
      alavancagem: Number(conta.alavancagem ?? 100),
      estado: 'em_fila',
    })
    return NextResponse.json({ ok: true })
  }

  // ── conta: reenviar o email das credenciais ──────────────────────────────
  if (accao === 'conta_reenviar') {
    const id = String(b?.contaId ?? '')
    const { data: conta } = await db
      .from('mtm_trading_accounts')
      .select('id, tipo, user_id, mt5_login, mt5_password_cifrada, servidor, saldo_inicial, alavancagem, tournament_id')
      .eq('id', id)
      .maybeSingle()
    if (!conta?.mt5_login) return NextResponse.json({ error: 'conta ainda sem credenciais' }, { status: 409 })

    const { data: perfil } = conta.user_id
      ? await db.from('profiles').select('full_name, email').eq('id', conta.user_id).maybeSingle()
      : { data: null }
    if (!perfil?.email) return NextResponse.json({ error: 'sem email do participante' }, { status: 409 })

    const { data: torneio } = conta.tournament_id
      ? await db.from('mtm_tournaments').select('nome, regras').eq('id', conta.tournament_id).maybeSingle()
      : { data: null }

    const { enviarEmailDaConta } = await import('@/lib/mtmfunded/email-conta')
    const { getSiteUrl } = await import('@/lib/mail-transport')
    const r = await enviarEmailDaConta({
      para: perfil.email as string,
      nome: (perfil.full_name as string) || 'Participante',
      tipo: conta.tipo === 'torneio' ? 'torneio' : 'desafio',
      nomeProva: (torneio?.nome as string) || 'MTM Funded',
      login: conta.mt5_login as string,
      servidor: (conta.servidor as string) || 'TheTradingMaster-Live',
      saldo: Number(conta.saldo_inicial ?? 0),
      alavancagem: Number(conta.alavancagem ?? 100),
      urlPainel: `${getSiteUrl()}/mtmfunded/tradingtournament/dashboard`,
      regras: (torneio?.regras ?? null) as Record<string, number | string> | null,
    })
    return NextResponse.json({ ok: r.success, error: r.success ? undefined : 'o email não saiu' })
  }

  // ── conta: marcar quebrada à mão ─────────────────────────────────────────
  if (accao === 'conta_quebrar') {
    const id = String(b?.contaId ?? '')
    const motivo = String(b?.motivo ?? 'decisão do admin').slice(0, 200)
    if (!id) return NextResponse.json({ error: 'contaId em falta' }, { status: 400 })
    await db
      .from('mtm_trading_accounts')
      .update({ estado: 'quebrada', quebrou_regra: motivo, quebrada_em: new Date().toISOString() })
      .eq('id', id)
    await db
      .from('mtm_tournament_participants')
      .update({ estado: 'quebrado', updated_at: new Date().toISOString() })
      .eq('account_id', id)
    return NextResponse.json({ ok: true })
  }

  // ── conta: ver as credenciais (uma vez, e fica registado) ────────────────
  if (accao === 'conta_credenciais') {
    const id = String(b?.contaId ?? '')
    const { data: conta } = await db
      .from('mtm_trading_accounts')
      .select('mt5_login, mt5_password_cifrada, mt5_investor_cifrada, servidor')
      .eq('id', id)
      .maybeSingle()
    if (!conta) return NextResponse.json({ error: 'conta desconhecida' }, { status: 404 })
    const password = decifrar(conta.mt5_password_cifrada as string | null)
    if (!password) {
      return NextResponse.json({ error: 'sem password guardada (ou chave de cifra em falta)' }, { status: 409 })
    }
    /**
     * Isto devolve uma password de alguém. Fica só nesta resposta — não se guarda em lado
     * nenhum, não vai para logs — e existe porque um admin que não consiga recuperar uma
     * conta bloqueada não consegue ajudar ninguém.
     */
    return NextResponse.json({
      ok: true,
      login: conta.mt5_login,
      servidor: conta.servidor,
      password,
      investor: decifrar(conta.mt5_investor_cifrada as string | null),
    })
  }

  // ── certificados ─────────────────────────────────────────────────────────
  if (accao === 'certificados_emitir') {
    const id = String(b?.torneioId ?? '')
    if (!id) return NextResponse.json({ error: 'torneioId em falta' }, { status: 400 })
    const { emitirCertificadosDoTorneio } = await import('@/lib/mtmfunded/emitir-certificados')
    const r = await emitirCertificadosDoTorneio(id, { enviarEmail: b?.enviarEmail !== false })
    return NextResponse.json({ ok: true, ...r })
  }

  // ── programas MTM Funded ─────────────────────────────────────────────────
  /**
   * Criar e editar um programa de avaliação.
   *
   * O PREÇO valida-se aqui, e com um tecto. Um zero a mais num campo de admin é a diferença
   * entre 199 € e 1990 €, e do outro lado está um checkout Stripe real a cobrar a alguém.
   * O mesmo para as regras: uma perda diária maior do que a máxima é uma regra que nunca
   * dispara — o participante rebentava a conta inteira sem nunca bater no limite do dia.
   */
  if (accao === 'programa_guardar') {
    const slug = String(b?.slug ?? '').trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
      return NextResponse.json({ error: 'slug inválido (letras minúsculas, números e hífens)' }, { status: 400 })
    }
    const nome = String(b?.nome ?? '').trim()
    if (nome.length < 3) return NextResponse.json({ error: 'nome em falta' }, { status: 400 })

    const num = (v: unknown, min: number, max: number) => {
      const n = Number(v)
      return Number.isFinite(n) && n >= min && n <= max ? n : null
    }
    const saldo = num(b?.saldo, 1000, 1_000_000)
    const preco = num(b?.preco_cents, 0, 500_000)      // tecto de 5.000 €
    const fases = num(b?.fases, 1, 3)
    if (saldo == null) return NextResponse.json({ error: 'saldo entre 1.000 e 1.000.000' }, { status: 400 })
    if (preco == null) return NextResponse.json({ error: 'preço entre 0 e 5.000 €' }, { status: 400 })
    if (fases == null) return NextResponse.json({ error: 'fases entre 1 e 3' }, { status: 400 })

    const r = (b?.regras ?? {}) as Record<string, unknown>
    const diaria = num(r.perda_diaria_pct, 0.5, 50)
    const maxima = num(r.perda_maxima_pct, 0.5, 90)
    if (diaria == null || maxima == null) {
      return NextResponse.json({ error: 'perda diária e máxima são obrigatórias' }, { status: 400 })
    }
    if (diaria > maxima) {
      return NextResponse.json(
        { error: 'a perda diária não pode ser maior do que a máxima — seria uma regra que nunca dispara' },
        { status: 400 },
      )
    }
    const regras: Record<string, number> = { perda_diaria_pct: diaria, perda_maxima_pct: maxima }
    const objetivo = num(r.objetivo_pct, 0.5, 100)
    const dias = num(r.dias_minimos, 0, 90)
    const consistencia = num(r.consistencia_pct, 1, 100)
    if (objetivo != null) regras.objetivo_pct = objetivo
    if (dias != null) regras.dias_minimos = dias
    if (consistencia != null) regras.consistencia_pct = consistencia

    const linha = {
      slug,
      nome,
      descricao: b?.descricao ? String(b.descricao).slice(0, 400) : null,
      fases,
      saldo,
      preco_cents: preco,
      moeda: 'eur',
      stripe_price_id: b?.stripe_price_id ? String(b.stripe_price_id).trim() : null,
      regras,
      ativo: b?.ativo !== false,
      ordem: Number.isFinite(Number(b?.ordem)) ? Number(b.ordem) : 0,
      updated_at: new Date().toISOString(),
    }
    const { error } = await db.from('mtm_funded_programs').upsert(linha, { onConflict: 'slug' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, slug })
  }

  if (accao === 'programa_estado') {
    const slug = String(b?.slug ?? '').trim()
    if (!slug) return NextResponse.json({ error: 'slug em falta' }, { status: 400 })
    await db
      .from('mtm_funded_programs')
      .update({ ativo: b?.ativo === true, updated_at: new Date().toISOString() })
      .eq('slug', slug)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'acção desconhecida' }, { status: 400 })
}
