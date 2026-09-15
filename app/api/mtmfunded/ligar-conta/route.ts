import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cifraDisponivel } from '@/lib/mtmfunded/credenciais'
import { invalidateCopyConnectionsCache } from '@/lib/mtmcopy/db'
import { PLATAFORMA_MTMFUNDED } from '@/lib/mtmcopy/destino-execucao'
import { SERVIDOR_SIMULADO } from '@/lib/mtmfunded/simulado/motor'
import { loginLimpo, servidorValido } from '@/lib/mtmfunded/simulado/ligar-conta-regras'
import {
  bloqueadoPorTentativas,
  juntarSaldosMtmFunded,
  lerContaFunded,
  registarTentativa,
  resumoDaConta,
  verificarParaLigar,
} from '@/lib/mtmfunded/simulado/ligar-conta'

export const dynamic = 'force-dynamic'

/**
 * Ligar uma conta MTM Funded (as nossas, simuladas) ao Tap to Trade — site, app-mobile e iOS.
 *
 *   POST { login, password, servidor?: 'MTM Funded', produto: 'tap_to_trade'|'mtmauto', account_label?, t2t_lot_value? }
 *     → { success, somente_leitura, modo, connection?, mtmauto_account_id?, conta }
 *     401 credenciais (genérico) · 403 conta_de_outro · 409 ja_ligada · 429 limite_tentativas
 *   GET ?id=<ligação>    → estado da conta (saldo, equity, posições, etiquetas)
 *   DELETE ?id=<ligação> → remove a ligação (a conta simulada fica intacta)
 *
 * Password master + conta do próprio = execução pelo motor simulado; password investor = só
 * leitura. A password nunca é gravada, devolvida nem escrita em logs: grava-se `funded_account_id`.
 * Não ocupa vagas de contas (lib/entitlements): é produto nosso, já pago no MTM Funded.
 */

const supabase = getSupabaseAdmin()
const ESPERA_FALHA_MS = 1000

async function autenticar(request: NextRequest) {
  const h = request.headers.get('Authorization')
  if (!h?.startsWith('Bearer ')) return null
  const { data: { user }, error } = await supabase.auth.getUser(h.replace('Bearer ', ''))
  return error || !user ? null : user
}

const falha = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status })

export async function POST(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return falha('Autenticação necessária', 'sessao', 401)
  if (!cifraDisponivel()) return falha('Ligação MTM Funded indisponível de momento.', 'indisponivel', 503)

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const password = typeof body.password === 'string' ? body.password : ''
  const login = loginLimpo(body.login)
  if (!servidorValido(body.servidor, SERVIDOR_SIMULADO)) {
    return falha(`Servidor desconhecido — usa «${SERVIDOR_SIMULADO}».`, 'servidor', 400)
  }
  if (!password || !String(body.login ?? '').trim()) return falha('Preenche login e password.', 'campos', 400)
  const produto = body.produto === 'mtmauto' ? 'mtmauto' : 'tap_to_trade'

  // Login com formato errado conta como tentativa falhada (mas não vai à base).
  const chaveLogin = login ?? String(body.login ?? '').replace(/\D/g, '').slice(0, 12)
  if (await bloqueadoPorTentativas(user.id, chaveLogin)) {
    return falha('Demasiadas tentativas. Espera 15 minutos e tenta outra vez.', 'limite_tentativas', 429)
  }

  const { decisao, conta } = login
    ? await verificarParaLigar(user.id, login, password)
    : { decisao: { ok: false as const, codigo: 'credenciais' as const }, conta: null }
  await registarTentativa(user.id, chaveLogin, decisao.ok)

  if (!decisao.ok) {
    if (decisao.codigo === 'conta_de_outro') {
      return falha('Esta conta MTM Funded pertence a outro utilizador. Para a acompanhar, usa a password investor.', 'conta_de_outro', 403)
    }
    await new Promise((ok) => setTimeout(ok, ESPERA_FALHA_MS))
    return falha('Login ou password errados.', 'credenciais', 401)
  }
  if (!conta) return falha('Login ou password errados.', 'credenciais', 401)

  const somenteLeitura = decisao.somenteLeitura
  const rotulo = String(body.account_label ?? '').trim().slice(0, 60) || `MTM Funded ${conta.mt5_login}`
  const agora = new Date().toISOString()

  if (produto === 'mtmauto') {
    const { data: ja } = await supabase.from('mtmauto_accounts').select('id')
      .eq('user_id', user.id).eq('funded_account_id', conta.id).maybeSingle()
    if (ja) return falha('Esta conta MTM Funded já está ligada.', 'ja_ligada', 409)
    const { data: auto, error } = await supabase.from('mtmauto_accounts').insert({
      user_id: user.id, funded_account_id: conta.id, plataforma: PLATAFORMA_MTMFUNDED,
      login: conta.mt5_login, servidor: SERVIDOR_SIMULADO, corretora: 'MTM Funded', estado: 'connected',
      copia_ativa: !somenteLeitura, demo: false, paga: false, principal: false,
      rotulo, nome_exibicao: rotulo, metaapi_account_id: null,
      funded_somente_leitura: somenteLeitura, funded_ligada_pelo_cliente: true,
    }).select('id').single()
    if (error || !auto) {
      console.error('[mtmfunded/ligar-conta] mtmauto insert:', error?.code, error?.message)
      return falha(error?.code === '23505' ? 'Esta conta MTM Funded já está ligada.' : 'Não foi possível ligar a conta.', error?.code === '23505' ? 'ja_ligada' : 'erro', error?.code === '23505' ? 409 : 500)
    }
    return NextResponse.json({ success: true, produto, somente_leitura: somenteLeitura, modo: decisao.modo, mtmauto_account_id: auto.id, conta: resumoDaConta(conta) })
  }

  const { data: existentes } = await supabase.from('mtmcopy_connections').select('*')
    .eq('user_id', user.id).neq('mt5_status', 'disconnected')
  if ((existentes ?? []).some((c) => c.funded_account_id === conta.id)) {
    return falha('Esta conta MTM Funded já está ligada.', 'ja_ligada', 409)
  }

  const risco = Number(body.t2t_lot_value)
  const payload: Record<string, unknown> = {
    user_id: user.id,
    account_role: 'slave',
    sender_mode: 'telegram',
    copy_method: 'telegram_group',
    purpose: 'tap_to_trade',
    mt5_platform: PLATAFORMA_MTMFUNDED,
    // Sem login MT5 nem conta MetaApi: os fluxos MetaApi/CopyFactory só tocam em linhas com eles.
    mt5_login: null,
    metaapi_account_id: null,
    mt5_login_last4: String(conta.mt5_login ?? '').slice(-4),
    mt5_server: SERVIDOR_SIMULADO,
    mt5_status: 'connected',
    telegram_status: 'pending',
    account_label: rotulo,
    // Só leitura nasce em pausa: nada executa nela, nem por engano.
    is_active: !somenteLeitura,
    t2t_enabled: !somenteLeitura,
    funded_account_id: conta.id,
    funded_somente_leitura: somenteLeitura,
    lot_mode: 'risk_percent',
    lot_value: 1,
    t2t_lot_mode: 'risk_percent',
    t2t_lot_value: Number.isFinite(risco) && risco > 0 ? Math.min(5, Math.max(0.1, risco)) : 1,
    baseline_balance: conta.saldo_inicial ?? conta.sim_saldo,
    updated_at: agora,
  }
  const { data: ligacao, error: insErr } = await supabase.from('mtmcopy_connections').insert(payload).select().single()
  if (insErr || !ligacao) {
    console.error('[mtmfunded/ligar-conta] insert ligação:', insErr?.code, insErr?.message)
    if (insErr?.code === '23505') return falha('Esta conta MTM Funded já está ligada.', 'ja_ligada', 409)
    return falha('Não foi possível ligar a conta.', 'erro', 500)
  }
  invalidateCopyConnectionsCache()
  const [comSaldo] = await juntarSaldosMtmFunded([ligacao])
  return NextResponse.json({
    success: true,
    produto,
    somente_leitura: somenteLeitura,
    modo: decisao.modo,
    message: somenteLeitura ? 'Conta MTM Funded ligada só para ver (password investor).' : 'Conta MTM Funded ligada.',
    connection: comSaldo,
    conta: resumoDaConta(conta),
  })
}

async function ligacaoDoUtilizador(userId: string, id: string | null) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabase.from('mtmcopy_connections').select('*')
    .eq('id', id).eq('user_id', userId).eq('mt5_platform', PLATAFORMA_MTMFUNDED).maybeSingle()
  return data
}

export async function GET(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return falha('Autenticação necessária', 'sessao', 401)
  const lig = await ligacaoDoUtilizador(user.id, new URL(request.url).searchParams.get('id'))
  if (!lig?.funded_account_id) return falha('Conta MTM Funded não encontrada', 'nao_encontrada', 404)
  const conta = await lerContaFunded(String(lig.funded_account_id))
  if (!conta) return falha('Conta MTM Funded não encontrada', 'nao_encontrada', 404)
  // Ligação completa exige que a conta continue a ser dele; a investor mostra na mesma (foi-lhe dada).
  const somenteLeitura = lig.funded_somente_leitura === true || conta.user_id !== user.id
  const { count } = await supabase.from('funded_positions').select('id', { count: 'exact', head: true })
    .eq('account_id', conta.id).eq('estado', 'aberta')
  const r = resumoDaConta(conta)
  return NextResponse.json({ ...r, posicoes: count ?? 0, somente_leitura: somenteLeitura })
}

export async function DELETE(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return falha('Autenticação necessária', 'sessao', 401)
  const lig = await ligacaoDoUtilizador(user.id, new URL(request.url).searchParams.get('id'))
  if (!lig) return falha('Conta MTM Funded não encontrada', 'nao_encontrada', 404)
  const { error } = await supabase.from('mtmcopy_connections').delete().eq('id', lig.id).eq('user_id', user.id)
  if (error) return falha('Erro ao remover conta', 'erro', 500)
  invalidateCopyConnectionsCache()
  return NextResponse.json({ success: true })
}
