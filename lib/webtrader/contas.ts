/**
 * AS CONTAS DO WEBTRADER e o ADAPTADOR de cada pedido — com o dono verificado no servidor.
 *
 * Toda a rota /api/webtrader/[plataforma]/… passa por `resolverAdaptador`:
 *   · mtmfunded   → autorizarConta (sessão MTM do dono ou sessão da conta por login+password).
 *   · tradelocker → ligação do próprio (mtmcopy_connections.user_id) OU sessão do WebTrader presa ao
 *                   utilizador e à conta (lib/webtrader/tradelocker-sessao.ts).
 *   · mt5         → linha do próprio numa das três tabelas (T2T/MTM Copy, MTM Auto, WebTrader) E
 *                   dentro da quota MetaApi do plano (regras.decidirAcessoMt5).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { autorizarConta, ErroOrdem } from '@/lib/mtmfunded/simulado/execucao'
import { sessaoDaLigacao } from '@/lib/tradelocker/ligacao'
import { carregarDireitos } from '@/lib/entitlements'
import { estadoDaQuota, contarContasMetaApi, linhasDeContas, mensagemQuota } from '@/lib/contas/quota-metaapi'
import { adaptadorMtmFunded } from './corretoras/mtmfunded'
import { adaptadorTradeLocker } from './corretoras/tradelocker'
import { adaptadorMt5 } from './corretoras/mt5'
import { decidirAcessoMt5, lerRefConta, type ContaMetaApiDoUtilizador } from './corretoras/regras'
import { ErroCorretora, type AdaptadorCorretora, type PlataformaWT } from './corretoras/tipos'
import { lerSessaoTL } from './tradelocker-sessao'

export const CABECALHO_SESSAO_TL = 'x-webtrader-tl'

export interface ContaListadaWT {
  ref: string
  plataforma: PlataformaWT
  rotulo: string | null
  login: string | null
  servidor: string | null
  demo: boolean
  /** true = corretora real (dinheiro a sério). */
  real: boolean
  /** Motivo por que não abre no WebTrader (quota), ou null. */
  bloqueada: string | null
  origem: 'ligador' | 'webtrader'
}

const txt = (v: unknown) => (v == null || v === '' ? null : String(v))
const demoPeloNome = (s: unknown) => /\b(demo|trial|practice|paper|contest)\b/i.test(String(s ?? ''))

/** A tabela da 076 pode ainda não existir: sem ela, lista vazia (e o resto funciona). */
async function contasWebtraderMt5(userId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await getSupabaseAdmin().from('webtrader_contas_mt5').select('*').eq('user_id', userId).order('created_at')
  return error ? [] : ((data ?? []) as Record<string, unknown>[])
}

/** Todas as linhas MetaApi do utilizador com data (para a ordem da quota no WebTrader). */
async function contasMetaApiDatadas(userId: string): Promise<ContaMetaApiDoUtilizador[]> {
  const db = getSupabaseAdmin()
  const [{ data: site }, { data: auto }, wt] = await Promise.all([
    db.from('mtmcopy_connections').select('metaapi_account_id, mt5_login, mt5_server, mt5_platform, mt5_status, created_at').eq('user_id', userId).neq('mt5_status', 'disconnected'),
    db.from('mtmauto_accounts').select('metaapi_account_id, login, servidor, plataforma, created_at').eq('user_id', userId),
    contasWebtraderMt5(userId),
  ])
  const mt = (p: unknown) => ['mt5', 'mt4', ''].includes(String(p ?? '').toLowerCase())
  return [
    ...(site ?? []).filter((c) => c.metaapi_account_id && mt(c.mt5_platform)).map((c) => ({ metaapi_account_id: String(c.metaapi_account_id), login: txt(c.mt5_login), servidor: txt(c.mt5_server), created_at: txt(c.created_at) })),
    ...(auto ?? []).filter((c) => c.metaapi_account_id && mt(c.plataforma)).map((c) => ({ metaapi_account_id: String(c.metaapi_account_id), login: txt(c.login), servidor: txt(c.servidor), created_at: txt(c.created_at) })),
    ...wt.filter((c) => c.metaapi_account_id).map((c) => ({ metaapi_account_id: String(c.metaapi_account_id), login: txt(c.login), servidor: txt(c.servidor), created_at: txt(c.created_at) })),
  ]
}

async function quotaDoUtilizador(userId: string) {
  const [d, linhas] = await Promise.all([carregarDireitos(userId), linhasDeContas(userId)])
  return estadoDaQuota(d, contarContasMetaApi(linhas))
}

/** Contas TradeLocker e MT5 do utilizador (as MTM Funded vêm de /api/mtmfunded/simulado/contas). */
export async function listarContasReais(userId: string): Promise<ContaListadaWT[]> {
  const db = getSupabaseAdmin()
  const [{ data: site }, { data: auto }, wt, datadas, quota] = await Promise.all([
    db.from('mtmcopy_connections').select('*').eq('user_id', userId).neq('mt5_status', 'disconnected').order('created_at'),
    db.from('mtmauto_accounts').select('*').eq('user_id', userId).order('created_at'),
    contasWebtraderMt5(userId),
    contasMetaApiDatadas(userId),
    quotaDoUtilizador(userId),
  ])
  const out: ContaListadaWT[] = []
  const vistos = new Set<string>()
  const acesso = (id: string) => {
    const d = decidirAcessoMt5(quota, datadas, id)
    return d.ok ? null : d.erro
  }

  for (const c of (site ?? []) as Record<string, unknown>[]) {
    const p = String(c.mt5_platform ?? 'mt5').toLowerCase()
    if (p === 'tradelocker' && c.tl_account_id) {
      out.push({ ref: `tradelocker:site:${c.id}`, plataforma: 'tradelocker', rotulo: txt(c.account_label), login: txt(c.tl_acc_num) ?? txt(c.tl_account_id), servidor: txt(c.tl_server), demo: c.tl_env === 'demo', real: true, bloqueada: null, origem: 'ligador' })
    } else if ((p === 'mt5' || p === 'mt4') && c.metaapi_account_id && !vistos.has(String(c.metaapi_account_id))) {
      vistos.add(String(c.metaapi_account_id))
      out.push({ ref: `mt5:site:${c.id}`, plataforma: 'mt5', rotulo: txt(c.account_label), login: txt(c.mt5_login) ?? (c.mt5_login_last4 ? `••••${c.mt5_login_last4}` : null), servidor: txt(c.mt5_server), demo: demoPeloNome(c.mt5_server), real: true, bloqueada: acesso(String(c.metaapi_account_id)), origem: 'ligador' })
    }
  }
  for (const c of (auto ?? []) as Record<string, unknown>[]) {
    const p = String(c.plataforma ?? 'mt5').toLowerCase()
    if ((p === 'mt5' || p === 'mt4') && c.metaapi_account_id && !vistos.has(String(c.metaapi_account_id))) {
      vistos.add(String(c.metaapi_account_id))
      out.push({ ref: `mt5:auto:${c.id}`, plataforma: 'mt5', rotulo: txt(c.rotulo) ?? txt(c.corretora), login: txt(c.login), servidor: txt(c.servidor), demo: Boolean(c.demo), real: true, bloqueada: acesso(String(c.metaapi_account_id)), origem: 'ligador' })
    }
  }
  for (const c of wt) {
    if (!c.metaapi_account_id || vistos.has(String(c.metaapi_account_id)) || c.estado !== 'connected') continue
    vistos.add(String(c.metaapi_account_id))
    out.push({ ref: `mt5:wt:${c.id}`, plataforma: 'mt5', rotulo: txt(c.rotulo), login: txt(c.login), servidor: txt(c.servidor), demo: demoPeloNome(c.servidor), real: true, bloqueada: acesso(String(c.metaapi_account_id)), origem: 'webtrader' })
  }
  return out
}

/** A conta MT5 (id MetaApi) de uma referência, SÓ se for do utilizador. */
export async function metaApiDaRef(userId: string, origem: 'site' | 'auto' | 'wt', id: string): Promise<string | null> {
  const db = getSupabaseAdmin()
  if (origem === 'site') {
    const { data } = await db.from('mtmcopy_connections').select('metaapi_account_id, mt5_platform, mt5_status').eq('id', id).eq('user_id', userId).maybeSingle()
    if (!data || data.mt5_status === 'disconnected' || !['mt5', 'mt4', ''].includes(String(data.mt5_platform ?? 'mt5').toLowerCase())) return null
    return txt(data.metaapi_account_id)
  }
  if (origem === 'auto') {
    const { data } = await db.from('mtmauto_accounts').select('metaapi_account_id, plataforma').eq('id', id).eq('user_id', userId).maybeSingle()
    if (!data || !['mt5', 'mt4', ''].includes(String(data.plataforma ?? 'mt5').toLowerCase())) return null
    return txt(data.metaapi_account_id)
  }
  const { data, error } = await db.from('webtrader_contas_mt5').select('metaapi_account_id, estado').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error || !data || data.estado !== 'connected') return null
  return txt(data.metaapi_account_id)
}

export async function resolverAdaptador(request: Request, plataforma: PlataformaWT, refBruta: unknown): Promise<AdaptadorCorretora> {
  const ref = lerRefConta(plataforma, refBruta)
  if (!ref) throw new ErroCorretora(400, 'conta inválida')

  if (ref.plataforma === 'mtmfunded') {
    try {
      const { conta, modo } = await autorizarConta(request, ref.id)
      return adaptadorMtmFunded(conta, modo)
    } catch (e) {
      if (e instanceof ErroOrdem) throw new ErroCorretora(e.status, e.message)
      throw e
    }
  }

  const userId = await userIdDoPedido(request)
  if (!userId) throw new ErroCorretora(401, 'Entra com a tua conta MTM para usar contas reais no WebTrader.')

  if (ref.plataforma === 'tradelocker') {
    if (ref.origem === 'sessao') {
      const s = lerSessaoTL(request.headers.get(CABECALHO_SESSAO_TL), userId, ref.id)
      if (!s) throw new ErroCorretora(401, 'A sessão TradeLocker expirou — entra outra vez.', 'sessao_tl')
      return adaptadorTradeLocker(s.sessao, { podeNegociar: true })
    }
    const { data: conn } = await getSupabaseAdmin().from('mtmcopy_connections').select('*').eq('id', ref.id).eq('user_id', userId).eq('mt5_platform', 'tradelocker').neq('mt5_status', 'disconnected').maybeSingle()
    if (!conn) throw new ErroCorretora(404, 'Conta TradeLocker não encontrada.')
    const { sessao, erro } = await sessaoDaLigacao(conn)
    if (!sessao) throw new ErroCorretora(409, erro ?? 'Conta TradeLocker sem sessão.')
    return adaptadorTradeLocker(sessao, { podeNegociar: true })
  }

  const metaapiId = await metaApiDaRef(userId, ref.origem, ref.id)
  if (!metaapiId) throw new ErroCorretora(404, 'Conta MT5 não encontrada.')
  const [quota, datadas] = await Promise.all([quotaDoUtilizador(userId), contasMetaApiDatadas(userId)])
  const acesso = decidirAcessoMt5(quota, datadas, metaapiId)
  if (!acesso.ok) throw new ErroCorretora(402, acesso.erro, 'quota_metaapi', { quota: { plano: quota.plano, emUso: quota.emUso, limite: Number.isFinite(quota.limite) ? quota.limite : null, mensagem: mensagemQuota(quota) } })
  return adaptadorMt5(metaapiId, { podeNegociar: true })
}
