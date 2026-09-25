/**
 * AS CONTAS DO WEBTRADER e o ADAPTADOR de cada pedido — com o dono verificado no servidor.
 *
 * Toda a rota /api/webtrader/[plataforma]/… passa por `resolverAdaptador`:
 *   · mtmfunded   → autorizarConta (sessão MTM do dono ou sessão da conta por login+password).
 *   · tradelocker → ligação do próprio (mtmcopy_connections.user_id), conta TradeLocker ligada na app
 *                   MTM Auto (mtmauto_accounts.user_id, credenciais em tradelocker_credenciais) OU sessão
 *                   do WebTrader presa ao utilizador e à conta (lib/webtrader/tradelocker-sessao.ts).
 *   · mt5         → linha do próprio numa das três tabelas (T2T/MTM Copy, MTM Auto, WebTrader) E
 *                   dentro da quota MetaApi do plano (regras.decidirAcessoMt5), aberta com a chave MetaApi
 *                   ONDE a conta vive (casa ou equipa — contas-auto-regras.chaveMetaApiDaConta).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { autorizarConta, ErroOrdem } from '@/lib/mtmfunded/simulado/execucao'
import { sessaoDaLigacao } from '@/lib/tradelocker/ligacao'
import { carregarDireitos } from '@/lib/entitlements'
import { estadoDaQuota, contarContasMetaApi, linhasDeContas, mensagemQuota } from '@/lib/contas/quota-metaapi'
import { adaptadorMtmFunded } from './corretoras/mtmfunded'
import { adaptadorTradeLocker } from './corretoras/tradelocker'
import { DEPS_MT5, adaptadorMt5, restMt5ComToken, type DepsMt5 } from './corretoras/mt5'
import { decifrar } from '@/lib/mtmfunded/credenciais'
import { envValido } from '@/lib/tradelocker/ligacao'
import { TradeLockerSessao } from '@/lib/tradelocker/client'
import { neutralizarErroDeEquipa, type TokenResolvido } from '@/lib/copia-contas/tokens'
import { chaveContaTL, chaveMetaApiDaConta, tradeLockerAutoListavel } from './contas-auto-regras'
import { decidirAcessoMt5, lerRefConta, type ContaMetaApiDoUtilizador } from './corretoras/regras'
import { ErroCorretora, type AdaptadorCorretora, type PlataformaWT } from './corretoras/tipos'
import { lerSessaoTL } from './tradelocker-sessao'
import { etiquetaDaLinha } from '@/lib/contas/etiqueta'

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
  /** MetaTrader: 'mt4' quando a conta é MT4 (o adaptador é o mesmo, a etiqueta não). */
  versao?: 'mt4' | 'mt5'
  origem: 'ligador' | 'webtrader'
  /** 113 — a etiqueta que o DONO pôs nesta conta (null = sem etiqueta, mostra-se o nome de sempre). */
  etiquetaDoDono: string | null
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

  const tlVistas = new Set<string>()
  for (const c of (site ?? []) as Record<string, unknown>[]) {
    const p = String(c.mt5_platform ?? 'mt5').toLowerCase()
    if (p === 'tradelocker' && c.tl_account_id) {
      tlVistas.add(chaveContaTL(c.tl_env, c.tl_account_id))
      out.push({ ref: `tradelocker:site:${c.id}`, plataforma: 'tradelocker', etiquetaDoDono: etiquetaDaLinha(c), rotulo: txt(c.account_label), login: txt(c.tl_acc_num) ?? txt(c.tl_account_id), servidor: txt(c.tl_server), demo: c.tl_env === 'demo', real: true, bloqueada: null, origem: 'ligador' })
    } else if ((p === 'mt5' || p === 'mt4') && c.metaapi_account_id && !vistos.has(String(c.metaapi_account_id))) {
      vistos.add(String(c.metaapi_account_id))
      out.push({ ref: `mt5:site:${c.id}`, plataforma: 'mt5', versao: p === 'mt4' ? 'mt4' : 'mt5', etiquetaDoDono: etiquetaDaLinha(c), rotulo: txt(c.account_label), login: txt(c.mt5_login) ?? (c.mt5_login_last4 ? `••••${c.mt5_login_last4}` : null), servidor: txt(c.mt5_server), demo: demoPeloNome(c.mt5_server), real: true, bloqueada: acesso(String(c.metaapi_account_id)), origem: 'ligador' })
    }
  }
  for (const c of (auto ?? []) as Record<string, unknown>[]) {
    const p = String(c.plataforma ?? 'mt5').toLowerCase()
    // TradeLocker ligada na app MTM Auto. Se a mesma conta também está no ligador do site, fica a do site.
    if (tradeLockerAutoListavel(c)) {
      const chave = chaveContaTL(c.tl_env, c.tl_account_id)
      if (tlVistas.has(chave)) continue
      tlVistas.add(chave)
      out.push({ ref: `tradelocker:auto:${c.id}`, plataforma: 'tradelocker', etiquetaDoDono: etiquetaDaLinha(c), rotulo: txt(c.rotulo) ?? txt(c.corretora), login: txt(c.tl_acc_num) ?? txt(c.tl_account_id), servidor: txt(c.tl_server) ?? txt(c.servidor), demo: c.tl_env === 'demo' || Boolean(c.demo), real: true, bloqueada: null, origem: 'ligador' })
      continue
    }
    if ((p === 'mt5' || p === 'mt4') && c.metaapi_account_id && !vistos.has(String(c.metaapi_account_id))) {
      vistos.add(String(c.metaapi_account_id))
      out.push({ ref: `mt5:auto:${c.id}`, plataforma: 'mt5', versao: p === 'mt4' ? 'mt4' : 'mt5', etiquetaDoDono: etiquetaDaLinha(c), rotulo: txt(c.rotulo) ?? txt(c.corretora), login: txt(c.login), servidor: txt(c.servidor), demo: Boolean(c.demo), real: true, bloqueada: acesso(String(c.metaapi_account_id)), origem: 'ligador' })
    }
  }
  for (const c of wt) {
    if (!c.metaapi_account_id || vistos.has(String(c.metaapi_account_id)) || c.estado !== 'connected') continue
    vistos.add(String(c.metaapi_account_id))
    out.push({ ref: `mt5:wt:${c.id}`, plataforma: 'mt5', versao: c.plataforma === 'mt4' ? 'mt4' : 'mt5', etiquetaDoDono: etiquetaDaLinha(c), rotulo: txt(c.rotulo), login: txt(c.login), servidor: txt(c.servidor), demo: demoPeloNome(c.servidor), real: true, bloqueada: acesso(String(c.metaapi_account_id)), origem: 'webtrader' })
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
  return (await resolverAdaptadorComDono(request, plataforma, refBruta)).adaptador
}

/**
 * O MESMO adaptador, mais o dono já resolvido. A gestão automática das posições precisa de saber de
 * quem é a conta para gravar a configuração na linha certa — e pedir a sessão outra vez só para
 * descobrir o user_id era um `getUser` a mais em cada leitura do WebTrader.
 */
export async function resolverAdaptadorComDono(
  request: Request, plataforma: PlataformaWT, refBruta: unknown,
): Promise<{ adaptador: AdaptadorCorretora; userId: string | null }> {
  const ref = lerRefConta(plataforma, refBruta)
  if (!ref) throw new ErroCorretora(400, 'conta inválida')

  if (ref.plataforma === 'mtmfunded') {
    try {
      const { conta, modo } = await autorizarConta(request, ref.id)
      return { adaptador: adaptadorMtmFunded(conta, modo), userId: (conta as { user_id?: string | null }).user_id ?? null }
    } catch (e) {
      if (e instanceof ErroOrdem) throw new ErroCorretora(e.status, e.message)
      throw e
    }
  }

  const userId = await userIdDoPedido(request)
  if (!userId) throw new ErroCorretora(401, 'Entra com a tua conta MTM para usar contas reais no WebTrader.')
  return { adaptador: await adaptadorReal(userId, ref, request), userId }
}

/**
 * O adaptador de uma conta de corretora SEM pedido — para quem corre em segundo plano (o executor da
 * gestão automática). A posse verifica-se exactamente da mesma maneira: o `userId` entra nos filtros
 * das tabelas, como quando vem de uma sessão.
 *
 * A única conta que não abre por aqui é a TradeLocker por SESSÃO do separador: as credenciais nunca
 * chegam ao servidor (o bilhete vive no separador), e por isso ela só se gere com o WebTrader aberto.
 */
export async function adaptadorDoDono(userId: string, plataforma: PlataformaWT, refBruta: unknown): Promise<AdaptadorCorretora> {
  const ref = lerRefConta(plataforma, refBruta)
  if (!ref) throw new ErroCorretora(400, 'conta inválida')
  if (ref.plataforma === 'mtmfunded') throw new ErroCorretora(400, 'Contas MTM Funded abrem pelo motor simulado.')
  return adaptadorReal(userId, ref, null)
}

type RefReal = Extract<Exclude<ReturnType<typeof lerRefConta>, null>, { plataforma: 'tradelocker' | 'mt5' }>

async function adaptadorReal(userId: string, ref: Exclude<ReturnType<typeof lerRefConta>, null>, request: Request | null): Promise<AdaptadorCorretora> {
  if (ref.plataforma === 'mtmfunded') throw new ErroCorretora(400, 'conta inválida')
  const r = ref as RefReal

  if (r.plataforma === 'tradelocker') {
    if (r.origem === 'sessao') {
      if (!request) throw new ErroCorretora(409, 'Esta conta TradeLocker só abre com o WebTrader aberto (entrou por sessão do separador).', 'sessao_tl')
      const s = lerSessaoTL(request.headers.get(CABECALHO_SESSAO_TL), userId, r.id)
      if (!s) throw new ErroCorretora(401, 'A sessão TradeLocker expirou — entra outra vez.', 'sessao_tl')
      return adaptadorTradeLocker(s.sessao, { podeNegociar: true })
    }
    if (r.origem === 'auto') return adaptadorTradeLocker(await sessaoTradeLockerAuto(userId, r.id), { podeNegociar: true })
    const { data: conn } = await getSupabaseAdmin().from('mtmcopy_connections').select('*').eq('id', r.id).eq('user_id', userId).eq('mt5_platform', 'tradelocker').neq('mt5_status', 'disconnected').maybeSingle()
    if (!conn) throw new ErroCorretora(404, 'Conta TradeLocker não encontrada.')
    const { sessao, erro } = await sessaoDaLigacao(conn)
    if (!sessao) throw new ErroCorretora(409, erro ?? 'Conta TradeLocker sem sessão.')
    return adaptadorTradeLocker(sessao, { podeNegociar: true })
  }

  const { accountId, deps } = await autorizarMt5(userId, r.origem, r.id)
  return adaptadorMt5(accountId, { podeNegociar: true }, deps)
}

// ── TradeLocker ligada no MTM Auto ───────────────────────────────────────────────────────────

/**
 * Sessão partilhada 10 min por conta: o WebTrader relê posições a cada poucos segundos, e ler e
 * decifrar as credenciais (e voltar a autenticar na TradeLocker) em cada leitura seria um login por
 * sondagem. A chave inclui o utilizador — a posse foi verificada quando a sessão entrou na cache.
 */
const sessoesTLAuto = new Map<string, { s: TradeLockerSessao; em: number }>()

async function sessaoTradeLockerAuto(userId: string, contaId: string): Promise<TradeLockerSessao> {
  const k = `${userId}:${contaId}`
  const c = sessoesTLAuto.get(k)
  if (c && Date.now() - c.em < 10 * 60_000) return c.s
  const db = getSupabaseAdmin()
  const { data: conta } = await db.from('mtmauto_accounts').select('id, plataforma, tl_account_id, tl_acc_num').eq('id', contaId).eq('user_id', userId).maybeSingle()
  if (!conta || !tradeLockerAutoListavel(conta)) throw new ErroCorretora(404, 'Conta TradeLocker não encontrada.')
  const { data: cred } = await db.from('tradelocker_credenciais').select('tl_email, tl_password_cifrada, tl_server, tl_env').eq('mtmauto_account_id', contaId).maybeSingle()
  const password = cred ? decifrar(String(cred.tl_password_cifrada)) : null
  const env = envValido(cred?.tl_env)
  if (!cred || !password || !env) throw new ErroCorretora(409, 'Conta TradeLocker sem credenciais — volta a ligá-la na app MTM Auto.')
  const s = new TradeLockerSessao({ email: String(cred.tl_email), password, server: String(cred.tl_server), env }, String(conta.tl_account_id), String(conta.tl_acc_num))
  if (sessoesTLAuto.size > 500) sessoesTLAuto.clear()
  sessoesTLAuto.set(k, { s, em: Date.now() })
  return s
}

// ── chave MetaApi da conta ───────────────────────────────────────────────────────────────────

const tokensEquipa = new Map<string, { token: string | null; em: number }>()

/** Equipa do dono (só contas `auto:`) e a chave dessa equipa, 5 min em memória. Nunca vai para logs. */
async function tokenDaEquipaDoDono(userId: string): Promise<{ tenantId: string | null; token: string | null }> {
  const db = getSupabaseAdmin()
  const { data: u } = await db.from('mtmauto_users').select('tenant_id').eq('user_id', userId).maybeSingle()
  const tenantId = txt(u?.tenant_id)
  if (!tenantId) return { tenantId: null, token: null }
  const c = tokensEquipa.get(tenantId)
  if (c && Date.now() - c.em < 300_000) return { tenantId, token: c.token }
  const { data } = await db.from('mtmauto_tenants').select('metaapi_token').eq('id', tenantId).maybeSingle()
  const token = txt(data?.metaapi_token)
  tokensEquipa.set(tenantId, { token, em: Date.now() })
  return { tenantId, token }
}

/** Dependências REST na chave certa. Erros de limite de uma equipa não travam a chave da casa. */
function depsDaChave(t: TokenResolvido): DepsMt5 {
  if (t.chave === 'casa') return DEPS_MT5
  const rest = restMt5ComToken(t.token)
  return {
    rest: async (id, caminho, init) => {
      try { return await rest(id, caminho, init) } catch (e) { throw neutralizarErroDeEquipa(e, t.chave) }
    },
    // A fotografia de streaming só existe para contas da casa.
    snapshot: async () => null,
  }
}

async function chaveDaContaMt(userId: string, origem: 'site' | 'auto' | 'wt', id: string): Promise<TokenResolvido> {
  const equipa = origem === 'auto' ? await tokenDaEquipaDoDono(userId) : { tenantId: null, token: null }
  const t = chaveMetaApiDaConta({ origem, contaId: id, tenantId: equipa.tenantId, tokenEquipa: equipa.token, tokenCasa: process.env.METAAPI_TOKEN ?? null })
  if (!t) throw new ErroCorretora(503, 'MetaApi indisponível no servidor.')
  return t
}

/**
 * Id MetaApi de uma conta MT5/MT4 SÓ se for do utilizador E estiver dentro da quota do plano, com a
 * chave MetaApi onde ela vive. A quota decide-se primeiro e da mesma forma para casa e equipas.
 */
export async function autorizarMt5(userId: string, origem: 'site' | 'auto' | 'wt', id: string): Promise<{ accountId: string; token: TokenResolvido; deps: DepsMt5 }> {
  const metaapiId = await metaApiDaRef(userId, origem, id)
  if (!metaapiId) throw new ErroCorretora(404, 'Conta MT5 não encontrada.')
  const [quota, datadas] = await Promise.all([quotaDoUtilizador(userId), contasMetaApiDatadas(userId)])
  const acesso = decidirAcessoMt5(quota, datadas, metaapiId)
  if (!acesso.ok) throw new ErroCorretora(402, acesso.erro, 'quota_metaapi', { quota: { plano: quota.plano, emUso: quota.emUso, limite: Number.isFinite(quota.limite) ? quota.limite : null, mensagem: mensagemQuota(quota) } })
  const token = await chaveDaContaMt(userId, origem, id)
  return { accountId: metaapiId, token, deps: depsDaChave(token) }
}
