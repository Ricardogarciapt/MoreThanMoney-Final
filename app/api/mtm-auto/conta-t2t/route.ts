import { NextRequest, NextResponse } from 'next/server'
import { ehMtmFundedLigacao } from '@/lib/mtmcopy/destino-execucao'
import { juntarSaldosMtmFunded } from '@/lib/mtmfunded/simulado/ligar-conta'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { carregarDireitos, pareceDemo, resumoDeContas, type ContaLigada } from '@/lib/entitlements'
import { PRESETS, preset, presetDosValores, presetParaLigacao } from '@/lib/risk-presets'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * A conta de Tap to Trade: ver e mudar as definições dela sem sair do separador.
 *
 * O ecrã Conta mostrava as definições do MTM Auto e nada mais, e quem só tem Tap to Trade — que
 * é a maioria dos membros — abria-o para encontrar uma folha sobre um produto que não usa. As
 * definições que mandam nas trades DELE (o risco, se copia o stop e o alvo, o lote) viviam num
 * modal noutro sítio da app.
 *
 * Escreve em `mtmcopy_connections`, a MESMA tabela que o `/admin/mtmcopy` lê e que o motor do
 * T2T consulta ao abrir uma ordem. Não há cópia nem cache: mudar aqui muda no admin e na próxima
 * trade.
 */

const CAMPOS_T2T = new Set([
  't2t_lot_mode',
  't2t_lot_value',
  'max_risk_percent',
  'copy_sl',
  'copy_tp',
  'account_label',
  'exit_pct_tp1',
  'exit_pct_tp2',
  'exit_pct_tp3',
  'auto_trailing_stop',
  'trailing_stop_points',
  'symbol_suffix',
  'reverse_signals',
  'prop_firm_type',
])

async function contasT2T(userId: string) {
  const { data } = await getSupabaseAdmin()
    .from('mtmcopy_connections')
    // '*': funded_account_id/funded_somente_leitura só existem depois da 074.
    .select('*')
    .eq('user_id', userId)
    .neq('mt5_status', 'disconnected')
    .order('created_at')

  const linhas = await juntarSaldosMtmFunded((data ?? []) as Array<Record<string, unknown> & { mt5_platform?: string | null; funded_account_id?: string | null }>)
  return linhas.map((c) => {
    const riscoPct = Number(c.t2t_lot_value ?? c.lot_value ?? 1)
    const riscoMaxPct = Number(c.max_risk_percent ?? 2)
    const saidasPct = [
      Number(c.exit_pct_tp1 ?? 33),
      Number(c.exit_pct_tp2 ?? 33),
      Number(c.exit_pct_tp3 ?? 34),
    ]
    return {
      id: c.id as string,
      rotulo: (c.account_label as string) ?? null,
      login: (c.mt5_login as string) ?? (c.mt5_login_last4 ? `****${c.mt5_login_last4}` : null),
      servidor: (c.mt5_server as string) ?? null,
      plataforma: ((c.mt5_platform as string) ?? 'mt5').toLowerCase(),
      estado: (c.mt5_status as string) ?? 'unknown',
      // MTM Funded nunca é «demo»: as etiquetas são F1/F2/Funded/Torneio + Active/… (lib/mtmfunded/etiquetas).
      demo: ehMtmFundedLigacao(c) ? false : pareceDemo(c.mt5_server as string),
      fundedAccountId: ehMtmFundedLigacao(c) ? ((c.funded_account_id as string) ?? null) : null,
      somenteLeitura: ehMtmFundedLigacao(c) ? c.funded_somente_leitura === true : false,
      fundedTipo: ehMtmFundedLigacao(c) ? ((c as Record<string, unknown>).funded_tipo ?? null) : null,
      fundedEstado: ehMtmFundedLigacao(c) ? ((c as Record<string, unknown>).funded_estado ?? null) : null,
      saldo: ehMtmFundedLigacao(c) ? ((c as Record<string, unknown>).account_balance ?? null) : undefined,
      equity: ehMtmFundedLigacao(c) ? ((c as Record<string, unknown>).account_equity ?? null) : undefined,
      // Uma ligação de MTM Copy pode ter o T2T ligado por cima: é a mesma conta a fazer as duas
      // coisas, e é por isso que a bandeira é própria e não se deduz do `purpose`.
      t2t: c.purpose === 'tap_to_trade' || c.t2t_enabled === true,
      ehMtmCopy: c.purpose !== 'tap_to_trade',
      // O sizing do T2T é o dele; só cai no da cópia quando não foi definido.
      modoLote: (c.t2t_lot_mode as string) ?? (c.lot_mode as string) ?? 'risk_percent',
      loteValor: riscoPct,
      riscoMaxPct,
      saidasPct,
      copiarSl: c.copy_sl !== false,
      copiarTp: c.copy_tp !== false,
      trailingAtivo: c.auto_trailing_stop === true,
      trailingPontos: c.trailing_stop_points != null ? Number(c.trailing_stop_points) : null,
      sufixo: (c.symbol_suffix as string) ?? null,
      inverterSinais: c.reverse_signals === true,
      propFirm: (c.prop_firm_type as string) ?? null,
      simbolos: (c.symbols_whitelist as string[]) ?? [],
      // O preset é DEDUZIDO dos valores, não guardado: guardar o nome deixava-o a dizer
      // "Equilibrado" depois de a pessoa mexer no risco à mão.
      preset: presetDosValores({ riscoPct, riscoMaxPct, saidasPct }),
      ativa: c.is_active !== false,
    }
  })
}

export async function GET(request: NextRequest) {
  const { erro, userId } = await autorizarMtmAuto(request)
  if (erro) return erro

  const db = getSupabaseAdmin()
  const [contas, direitos, { data: doAuto }] = await Promise.all([
    contasT2T(userId!),
    carregarDireitos(userId!),
    // Contas MTM Funded atribuídas pelo admin (plataforma 'mtmfunded') não ocupam vagas.
    db.from('mtmauto_accounts').select('demo').eq('user_id', userId!).neq('plataforma', 'mtmfunded'),
  ])

  // O resumo conta as contas dos TRÊS produtos — as extras vêm de um saco comum, e mostrar só
  // as de um lado dava um "ainda tens uma incluída" que o servidor depois recusava.
  const ligadas: ContaLigada[] = [
    // Contas MTM Funded ligadas (074) não ocupam vagas.
    ...contas.filter((c) => c.plataforma !== 'mtmfunded').map((c) => ({ superficie: c.t2t ? ('t2t' as const) : ('mtmcopy' as const), demo: c.demo })),
    ...(doAuto ?? []).map((c) => ({ superficie: 'mtmauto' as const, demo: Boolean(c.demo) })),
  ]

  return NextResponse.json({
    ok: true,
    contas,
    direitos: resumoDeContas(direitos, ligadas),
    presets: PRESETS.map((p) => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      riscoPct: p.riscoPct,
      riscoMaxPct: p.riscoMaxPct,
      saidasPct: p.saidasPct,
    })),
  })
}

export async function PATCH(request: NextRequest) {
  const { erro, userId } = await autorizarMtmAuto(request)
  if (erro) return erro

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const contaId = String(corpo.contaId ?? '')
  if (!contaId) return NextResponse.json({ error: 'contaId obrigatório' }, { status: 400 })

  const db = getSupabaseAdmin()

  // A conta tem de ser DESTA pessoa. Sem esta verificação, o id de outra pessoa no corpo do
  // pedido chegava para lhe mudar o risco.
  const { data: minha } = await db
    .from('mtmcopy_connections')
    .select('*')
    .eq('id', contaId)
    .eq('user_id', userId!)
    .maybeSingle()
  if (!minha) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })
  // Conta MTM Funded ligada com a password investor: só leitura, nada se muda nela.
  if (ehMtmFundedLigacao(minha) && minha.funded_somente_leitura === true) {
    return NextResponse.json({ error: 'Conta ligada só para ver (password investor).' }, { status: 403 })
  }

  const patch: Record<string, unknown> = {}

  /**
   * O preset escreve os NÚMEROS, não o nome.
   *
   * Guardar só "MTM II · Equilibrado" numa coluna e deixar o risco como estava era a pior
   * versão disto: o cliente escolhia um perfil, via-o marcado, e continuava a arriscar o mesmo.
   * Aplica-se primeiro para que um valor mexido à mão no mesmo pedido ainda mande por cima.
   */
  const escolhido = preset(String(corpo.preset ?? ''))
  if (escolhido) Object.assign(patch, presetParaLigacao(escolhido))

  for (const [chave, valor] of Object.entries(corpo)) {
    if (!CAMPOS_T2T.has(chave)) continue
    patch[chave] = valor
  }

  if (patch.t2t_lot_mode !== undefined) {
    const m = String(patch.t2t_lot_mode)
    patch.t2t_lot_mode = ['fixed', 'risk_percent', 'multiplier'].includes(m) ? m : null
  }
  if (patch.t2t_lot_value !== undefined) {
    const v = Number(patch.t2t_lot_value)
    patch.t2t_lot_value = Number.isFinite(v) && v > 0 ? v : null
  }
  if (patch.max_risk_percent !== undefined) {
    const v = Number(patch.max_risk_percent)
    // O teto tem de ficar ACIMA do risco por trade: um teto mais baixo bloqueia todas as ordens
    // em silêncio, e o cliente fica à espera de trades que nunca abrem.
    const risco = Number(patch.t2t_lot_value ?? 0)
    patch.max_risk_percent = Number.isFinite(v) && v > 0 ? Math.max(v, risco) : 2
  }
  for (const b of ['copy_sl', 'copy_tp'] as const) {
    if (patch[b] !== undefined) patch[b] = Boolean(patch[b])
  }
  // As saídas parciais têm de fechar em 100: 50/30/10 deixava 10% da posição sem regra nenhuma,
  // e essa fatia ficava aberta para sempre à espera de uma ordem que nunca vem.
  const saidas = ['exit_pct_tp1', 'exit_pct_tp2', 'exit_pct_tp3'] as const
  if (saidas.some((k) => patch[k] !== undefined)) {
    const atual = await db
      .from('mtmcopy_connections')
      .select('exit_pct_tp1, exit_pct_tp2, exit_pct_tp3')
      .eq('id', contaId)
      .maybeSingle()
    const valores = saidas.map((k, i) => {
      const v = Number(patch[k] ?? [atual.data?.exit_pct_tp1, atual.data?.exit_pct_tp2, atual.data?.exit_pct_tp3][i] ?? 0)
      return Math.max(0, Math.min(100, Math.round(v) || 0))
    })
    if (valores.reduce((a, b) => a + b, 0) !== 100) {
      return NextResponse.json({ error: 'As saídas parciais têm de somar 100%.' }, { status: 400 })
    }
    saidas.forEach((k, i) => { patch[k] = valores[i] })
  }

  if (patch.trailing_stop_points !== undefined) {
    const v = Number(patch.trailing_stop_points)
    patch.trailing_stop_points = Number.isFinite(v) && v > 0 ? Math.round(v) : null
  }
  if (patch.auto_trailing_stop !== undefined) patch.auto_trailing_stop = Boolean(patch.auto_trailing_stop)
  if (patch.reverse_signals !== undefined) patch.reverse_signals = Boolean(patch.reverse_signals)
  if (patch.symbol_suffix !== undefined) {
    const t = String(patch.symbol_suffix).trim()
    patch.symbol_suffix = t.slice(0, 12) || null
  }
  if (patch.prop_firm_type !== undefined) {
    const t = String(patch.prop_firm_type).trim()
    patch.prop_firm_type = t ? t.slice(0, 40) : null
  }

  if (patch.account_label !== undefined) {
    const t = String(patch.account_label).trim()
    patch.account_label = t.slice(0, 60) || null
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nada para guardar' }, { status: 400 })
  }

  patch.updated_at = new Date().toISOString()
  const { error } = await db.from('mtmcopy_connections').update(patch).eq('id', contaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, contas: await contasT2T(userId!) })
}
