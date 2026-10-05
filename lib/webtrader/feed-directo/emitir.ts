/**
 * EMISSÃO DAS CREDENCIAIS CURTAS DO FEED DIRECTO — só no servidor.
 *
 *   MT4/MT5 (MetaApi): `autorizarMt5(ref)` decide posse + quota + chave (casa/equipa) — a MESMA
 *   regra das ordens, chamada e não copiada. Com a chave certa pede-se à MetaApi um token restrito
 *   à conta (papel `reader`, 2 h) e é ESSE que vai para o browser. A chave mestra nunca sai daqui.
 *
 *   TradeLocker: resolve-se a ligação como o adaptador do WebTrader (sessão do separador, ligação
 *   do site ou conta da app MTM Auto) e devolve-se o accessToken + accNum + baseUrl. O refreshToken
 *   fica no servidor (cofre) — ver TradeLockerSessao.fichaSoLeitura.
 *
 * Cache (webtrader_feed_tokens, migração 180): a mesma credencial serve enquanto faltar mais de
 * 10 min para expirar — abrir o WebTrader três vezes não pede três narrow-downs. O token fica
 * cifrado com a chave das passwords. Sem tabela ou sem cifra, emite-se sempre fresco (nunca trava).
 * Auditoria: quem, quando, ref, ip, user-agent — na mesma linha.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cifrar, decifrar, cifraDisponivel } from '@/lib/mtmfunded/credenciais'
import { ligarCofreTradeLocker, semearDoCofre } from '@/lib/tradelocker/cofre-tokens'
import { TL_BASE_URL, TradeLockerSessao } from '@/lib/tradelocker/client'
import { envValido, sessaoDaLigacao } from '@/lib/tradelocker/ligacao'
import { tradeLockerAutoListavel } from '@/lib/webtrader/contas-auto-regras'
import { CABECALHO_SESSAO_TL, autorizarMt5 } from '@/lib/webtrader/contas'
import { lerRefConta } from '@/lib/webtrader/corretoras/regras'
import { ErroCorretora } from '@/lib/webtrader/corretoras/tipos'
import { lerSessaoTL } from '@/lib/webtrader/tradelocker-sessao'
import { NARROW_DOWN_URL, VALIDADE_TOKEN_HORAS, corpoNarrowDown, corpoSoLeitura, lerTokenDaResposta } from './narrow-down'
import type { CredenciaisFeed } from './tipos'

const TABELA = 'webtrader_feed_tokens'
/** Uma credencial em cache só se reentrega com esta folga até expirar. */
const FOLGA_REUTILIZACAO_MS = 10 * 60_000
const PROVISIONING = process.env.METAAPI_PROVISIONING_URL ?? 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

export interface ContextoPedido {
  ip: string | null
  userAgent: string | null
  /** O bilhete cifrado da sessão TradeLocker do separador (header x-webtrader-tl), se houver. */
  sessaoTL: string | null
}

function semTabela(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === '42P01' || /does not exist|schema cache/i.test(e.message ?? ''))
}

// ── cache ────────────────────────────────────────────────────────────────────────────────────

async function daCache(userId: string, ref: string): Promise<CredenciaisFeed | null> {
  if (!cifraDisponivel()) return null
  try {
    const { data, error } = await getSupabaseAdmin().from(TABELA)
      .select('id, token_cifrado, expira_em').eq('user_id', userId).eq('ref', ref).eq('revogado', false)
      .gt('expira_em', new Date(Date.now() + FOLGA_REUTILIZACAO_MS).toISOString())
      .order('expira_em', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) { if (error && !semTabela(error)) console.error('[feed-directo] cache ler:', error.message); return null }
    const claro = decifrar(String(data.token_cifrado))
    if (!claro) return null
    const c = JSON.parse(claro) as CredenciaisFeed
    void getSupabaseAdmin().from(TABELA).update({ reutilizado_em: new Date().toISOString() }).eq('id', data.id)
    return c
  } catch (e) {
    console.error('[feed-directo] cache ler:', e instanceof Error ? e.message : e)
    return null
  }
}

async function paraCache(userId: string, ref: string, c: CredenciaisFeed, ctx: ContextoPedido): Promise<void> {
  if (!cifraDisponivel()) return
  try {
    const { error } = await getSupabaseAdmin().from(TABELA).insert({
      user_id: userId, ref, plataforma: c.plataforma, conta_id: c.accountId,
      token_cifrado: cifrar(JSON.stringify(c)), expira_em: c.expiraEm, ip: ctx.ip, user_agent: ctx.userAgent?.slice(0, 300) ?? null,
    })
    if (error && !semTabela(error)) console.error('[feed-directo] cache guardar:', error.message)
  } catch (e) {
    console.error('[feed-directo] cache guardar:', e instanceof Error ? e.message : e)
  }
}

/** Corta todas as credenciais vivas de uma conta (conta removida, admin). */
export async function revogarCredenciais(userId: string, ref: string): Promise<void> {
  try {
    await getSupabaseAdmin().from(TABELA).update({ revogado: true }).eq('user_id', userId).eq('ref', ref).eq('revogado', false)
  } catch { /* sem tabela: nada a revogar */ }
}

// ── MetaApi ──────────────────────────────────────────────────────────────────────────────────

async function contaNaProvisioning(accountId: string, tokenMestre: string): Promise<{ region: string; platform: 'mt4' | 'mt5'; ligada: boolean }> {
  const r = await fetch(`${PROVISIONING}/users/current/accounts/${accountId}`, { headers: { 'auth-token': tokenMestre }, cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (r.status === 404) throw new ErroCorretora(404, 'Esta conta já não existe na MetaApi. Remove-a e liga-a de novo.')
  if (!r.ok) throw new ErroCorretora(502, 'A MetaApi não respondeu. Tenta daqui a pouco.')
  const j = (await r.json().catch(() => ({}))) as { region?: string; platform?: string; state?: string; connectionStatus?: string }
  return {
    region: String(j.region ?? 'london'),
    platform: String(j.platform ?? 'mt5').toLowerCase() === 'mt4' ? 'mt4' : 'mt5',
    ligada: String(j.state ?? '').toUpperCase() === 'DEPLOYED' && String(j.connectionStatus ?? '').toUpperCase() === 'CONNECTED',
  }
}

async function tokenRestrito(accountId: string, tokenMestre: string): Promise<string> {
  const corpo = corpoNarrowDown(accountId)
  // A guarda em runtime: mesmo que alguém mude corpoNarrowDown, nada com escrita sai daqui.
  if (!corpoSoLeitura(corpo)) throw new ErroCorretora(500, 'Pedido de token do feed recusado: não é só de leitura.')
  let r: Response
  try {
    r = await fetch(`${NARROW_DOWN_URL}?validity-in-hours=${VALIDADE_TOKEN_HORAS}`, {
      method: 'POST', headers: { 'auth-token': tokenMestre, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      cache: 'no-store', signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ErroCorretora(504, 'A MetaApi demorou demasiado a emitir a credencial do feed.')
  }
  const txt = await r.text()
  if (!r.ok) throw new ErroCorretora(502, `A MetaApi recusou a credencial do feed (${r.status}).`)
  let corpoResp: unknown = txt
  try { corpoResp = JSON.parse(txt) } catch { /* texto puro */ }
  const token = lerTokenDaResposta(corpoResp)
  if (!token) throw new ErroCorretora(502, 'A MetaApi devolveu uma credencial que não se percebe.')
  return token
}

async function emitirMetaApi(userId: string, origem: 'site' | 'auto' | 'wt', id: string): Promise<CredenciaisFeed> {
  // Posse + quota + chave onde a conta vive — a regra única, chamada e não copiada.
  const { accountId, token } = await autorizarMt5(userId, origem, id)
  const [conta, restrito] = await Promise.all([contaNaProvisioning(accountId, token.token), tokenRestrito(accountId, token.token)])
  return {
    plataforma: 'metaapi', token: restrito, accountId, regiao: conta.region, versao: conta.platform,
    estadoConta: conta.ligada ? 'ligada' : 'desligada',
    expiraEm: new Date(Date.now() + VALIDADE_TOKEN_HORAS * 3_600_000).toISOString(),
  }
}

// ── TradeLocker ──────────────────────────────────────────────────────────────────────────────

/**
 * Conta TradeLocker ligada na app MTM Auto. É o mesmo caminho de lib/webtrader/contas.ts
 * (sessaoTradeLockerAuto, que é privada daquele ficheiro): a posse verifica-se com o user_id no
 * filtro da tabela, as credenciais vêm cifradas de tradelocker_credenciais e o cofre poupa logins.
 */
async function sessaoTLAuto(userId: string, contaId: string): Promise<TradeLockerSessao> {
  const db = getSupabaseAdmin()
  const { data: conta } = await db.from('mtmauto_accounts').select('id, plataforma, tl_account_id, tl_acc_num').eq('id', contaId).eq('user_id', userId).maybeSingle()
  if (!conta || !tradeLockerAutoListavel(conta)) throw new ErroCorretora(404, 'Conta TradeLocker não encontrada.')
  const { data: cred } = await db.from('tradelocker_credenciais').select('tl_email, tl_password_cifrada, tl_server, tl_env').eq('mtmauto_account_id', contaId).maybeSingle()
  const password = cred ? decifrar(String(cred.tl_password_cifrada)) : null
  const env = envValido(cred?.tl_env)
  if (!cred || !password || !env) throw new ErroCorretora(409, 'Conta TradeLocker sem credenciais — volta a ligá-la na app MTM Auto.')
  const c = { email: String(cred.tl_email), password, server: String(cred.tl_server), env }
  ligarCofreTradeLocker()
  await semearDoCofre(c)
  return new TradeLockerSessao(c, String(conta.tl_account_id), String(conta.tl_acc_num))
}

async function sessaoTL(userId: string, origem: 'site' | 'auto' | 'sessao', id: string, ctx: ContextoPedido): Promise<TradeLockerSessao> {
  if (origem === 'sessao') {
    const s = lerSessaoTL(ctx.sessaoTL, userId, id)
    if (!s) throw new ErroCorretora(401, 'A sessão TradeLocker expirou — entra outra vez.', 'sessao_tl')
    return s.sessao
  }
  if (origem === 'auto') return sessaoTLAuto(userId, id)
  const { data: conn } = await getSupabaseAdmin().from('mtmcopy_connections').select('*').eq('id', id).eq('user_id', userId).eq('mt5_platform', 'tradelocker').neq('mt5_status', 'disconnected').maybeSingle()
  if (!conn) throw new ErroCorretora(404, 'Conta TradeLocker não encontrada.')
  const { sessao, erro } = await sessaoDaLigacao(conn)
  if (!sessao) throw new ErroCorretora(409, erro ?? 'Conta TradeLocker sem sessão.')
  return sessao
}

async function emitirTradeLocker(userId: string, origem: 'site' | 'auto' | 'sessao', id: string, ctx: ContextoPedido): Promise<CredenciaisFeed> {
  const s = await sessaoTL(userId, origem, id, ctx)
  const [ficha, instrumentos] = await Promise.all([s.fichaSoLeitura(), s.instrumentos().catch(() => [])])
  const info = new Set<number>()
  for (const i of instrumentos) for (const r of i.routes) if (String(r.type).toUpperCase() === 'INFO') info.add(r.id)
  return {
    plataforma: 'tradelocker', accessToken: ficha.accessToken, accountId: s.accountId, accNum: s.accNum,
    baseUrl: TL_BASE_URL[s.env], routeIds: { info: [...info] }, expiraEm: ficha.expiraEm,
  }
}

// ── entrada ──────────────────────────────────────────────────────────────────────────────────

/**
 * A credencial do feed para uma ref do WebTrader, SÓ se a conta for do utilizador. Uma ref de
 * outra pessoa dá 403/404 pelas mesmas funções que recusam as ordens — não há caminho novo.
 */
export async function emitirCredenciaisFeed(userId: string, refBruta: unknown, ctx: ContextoPedido): Promise<CredenciaisFeed> {
  const refTxt = String(refBruta ?? '')
  const plataforma = refTxt.split(':')[0]
  const ref = lerRefConta(plataforma, refTxt)
  if (!ref || ref.plataforma === 'mtmfunded') throw new ErroCorretora(400, 'O feed directo só existe em contas de corretora (MT4/MT5 e TradeLocker).')

  // A sessão do separador TradeLocker muda de token: nunca se guarda em cache (o bilhete já é dela).
  const cacheavel = !(ref.plataforma === 'tradelocker' && ref.origem === 'sessao')
  if (cacheavel) {
    const c = await daCache(userId, refTxt)
    if (c) return c
  }
  const c = ref.plataforma === 'mt5'
    ? await emitirMetaApi(userId, ref.origem, ref.id)
    : await emitirTradeLocker(userId, ref.origem, ref.id, ctx)
  // Uma conta MT desligada não fica em cache: depois de «Ligar conta» o pedido seguinte tem de ver o estado novo.
  if (cacheavel && !(c.plataforma === 'metaapi' && c.estadoConta === 'desligada')) await paraCache(userId, refTxt, c, ctx)
  return c
}

export { CABECALHO_SESSAO_TL }
