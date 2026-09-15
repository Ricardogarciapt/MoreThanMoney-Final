/**
 * «ENTRAR COM CREDENCIAIS» NO WEBTRADER — TradeLocker e MT5 (MTM Funded usa /api/mtmfunded/simulado/entrar).
 *
 * Travão de tentativas: a mesma tabela e a mesma regra da ligação MTM Funded (074 —
 * mtmfunded_ligacao_tentativas: 5 falhas por utilizador / 10 por login em 15 min), com a chave do
 * login em hash. Passwords: nunca gravadas nem registadas em logs.
 *
 * MT5 e o CUSTO MetaApi (lib/contas/quota-metaapi.ts):
 *   1. a mesma conta (login+servidor) já está ligada ao utilizador (T2T, MTM Auto ou WebTrader)?
 *      → reutiliza-a. Zero custo novo, não se cria nada.
 *   2. senão, a quota do plano tem lugar? não → 402 com o caminho do upgrade (sem compra no iOS).
 *   3. a conta já existe na MetaApi em nome de OUTRA pessoa/ligação → recusa (reaproveitá-la
 *      mudava a password dela e desligava-lhe a cópia).
 *   4. cria a conta MetaApi só de negociação (sem CopyFactory, fiabilidade regular); falhou o login
 *      na corretora → APAGA a conta criada (não fica a pagar) e conta como tentativa falhada.
 */
import { createHash } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { bloqueadoPorTentativas, registarTentativa } from '@/lib/mtmfunded/simulado/ligar-conta'
import { autenticar, listarContas, TradeLockerError, type TLCredenciais } from '@/lib/tradelocker/client'
import { emitirBilhete, envValido, lerBilhete } from '@/lib/tradelocker/ligacao'
import { verificarQuotaMetaApi } from '@/lib/contas/quota-metaapi'
import { criarContaMetaApiDireta, deleteMetaApiAccount } from '@/lib/mtmcopy/metaapi-provision'
import { isMetaApiConfigured } from '@/lib/mtmcopy/metaapi'
import { chaveTentativa } from './corretoras/regras'
import { ErroCorretora } from './corretoras/tipos'
import { emitirSessaoTL } from './tradelocker-sessao'

const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const ESPERA_FALHA_MS = 1200
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

async function travao(userId: string, chave: string) {
  if (await bloqueadoPorTentativas(userId, chave)) {
    throw new ErroCorretora(429, 'Demasiadas tentativas falhadas. Espera 15 minutos e tenta outra vez.', 'tentativas')
  }
}

// ── TradeLocker ──────────────────────────────────────────────────────────────────────────────

export async function entrarTradeLocker(userId: string, corpo: Record<string, unknown>) {
  // Passo 2: escolher a conta com o bilhete do passo 1 (10 min, credenciais cifradas).
  if (corpo.bilhete) {
    const cred = lerBilhete(String(corpo.bilhete))
    if (!cred) throw new ErroCorretora(400, 'O login TradeLocker expirou — volta a introduzir as credenciais.', 'bilhete')
    const accountId = String(corpo.accountId ?? '').trim()
    if (!/^\d{1,20}$/.test(accountId)) throw new ErroCorretora(400, 'Escolhe uma conta.')

    // Já ligada no ligador de contas? Então usa essa ligação (credenciais de lá, sem sessão nova).
    const { data: ligadas } = await getSupabaseAdmin().from('mtmcopy_connections').select('id, tl_account_id, tl_env, tl_server, mt5_status')
      .eq('user_id', userId).eq('mt5_platform', 'tradelocker').neq('mt5_status', 'disconnected')
    const ligada = (ligadas ?? []).find((c) => String(c.tl_account_id) === accountId && c.tl_env === cred.env && String(c.tl_server ?? '').toLowerCase() === cred.server.toLowerCase())
    if (ligada) return { ref: `tradelocker:site:${ligada.id}`, sessao: null }

    try {
      const tokens = await autenticar(cred)
      const conta = (await listarContas(cred.env, tokens.accessToken)).find((c) => c.id === accountId)
      if (!conta) throw new ErroCorretora(400, 'Essa conta não pertence a este login TradeLocker.')
      const s = emitirSessaoTL({ userId, email: cred.email, server: cred.server, env: cred.env, accountId, accNum: conta.accNum, tokens })
      return {
        ref: `tradelocker:sessao:${accountId}`,
        sessao: { token: s.token, expira: s.expira },
        conta: { accNum: conta.accNum, nome: conta.name, moeda: conta.currency, servidor: cred.server, demo: cred.env === 'demo' },
      }
    } catch (e) {
      if (e instanceof TradeLockerError) throw new ErroCorretora(e.codigo === 'credenciais' ? 401 : 502, e.message)
      throw e
    }
  }

  // Passo 1: login + lista de contas. Nada é guardado.
  const email = String(corpo.email ?? '').trim()
  const password = String(corpo.password ?? '')
  const server = String(corpo.servidor ?? corpo.server ?? '').trim()
  const env = envValido(String(corpo.env ?? '').toLowerCase())
  if (!email || !password || !server || !env) throw new ErroCorretora(400, 'Preenche email, password, servidor e escolhe Live ou Demo.')
  const chave = chaveTentativa('tradelocker', email, `${server}|${env}`, hash)
  await travao(userId, chave)
  const cred: TLCredenciais = { email, password, server, env }
  try {
    const tokens = await autenticar(cred)
    const contas = await listarContas(env, tokens.accessToken)
    await registarTentativa(userId, chave, true)
    if (!contas.length) throw new ErroCorretora(404, 'Login aceite, mas não há contas neste servidor/ambiente.')
    return {
      bilhete: emitirBilhete(cred),
      contas: contas.map((c) => ({ id: c.id, accNum: c.accNum, nome: c.name, moeda: c.currency, estado: c.status, saldo: c.accountBalance })),
    }
  } catch (e) {
    if (e instanceof TradeLockerError) {
      if (e.codigo === 'credenciais') {
        await registarTentativa(userId, chave, false)
        await esperar(ESPERA_FALHA_MS)
        throw new ErroCorretora(401, e.message)
      }
      throw new ErroCorretora(e.codigo === 'limite' ? 429 : 502, e.message)
    }
    throw e
  }
}

// ── MT5 ──────────────────────────────────────────────────────────────────────────────────────

const normServidor = (s: unknown) => String(s ?? '').trim().toLowerCase()

export async function entrarMt5(userId: string, corpo: Record<string, unknown>, opcoes: { compraPermitida: boolean }) {
  const login = String(corpo.login ?? '').replace(/\D/g, '')
  const password = String(corpo.password ?? '')
  const servidor = String(corpo.servidor ?? '').trim()
  const plataforma = corpo.plataforma === 'mt4' ? 'mt4' : 'mt5'
  if (!login || !password || !servidor) throw new ErroCorretora(400, 'Preenche login, password e servidor.')
  if (login.length > 20 || servidor.length > 120) throw new ErroCorretora(400, 'Login ou servidor inválido.')

  const db = getSupabaseAdmin()
  // 1) Reutilizar a conta que o utilizador já tem (nenhum custo novo).
  const [{ data: site }, { data: auto }, wt] = await Promise.all([
    db.from('mtmcopy_connections').select('id, metaapi_account_id, mt5_login, mt5_server, mt5_platform, mt5_status').eq('user_id', userId).eq('mt5_login', login).neq('mt5_status', 'disconnected'),
    db.from('mtmauto_accounts').select('id, metaapi_account_id, login, servidor, plataforma').eq('user_id', userId).eq('login', login),
    db.from('webtrader_contas_mt5').select('id, metaapi_account_id, servidor, estado').eq('user_id', userId).eq('login', login),
  ])
  const s = (site ?? []).find((c) => c.metaapi_account_id && normServidor(c.mt5_server) === normServidor(servidor) && ['mt5', 'mt4', ''].includes(String(c.mt5_platform ?? 'mt5')))
  if (s) return { ref: `mt5:site:${s.id}`, reutilizada: true }
  const a = (auto ?? []).find((c) => c.metaapi_account_id && normServidor(c.servidor) === normServidor(servidor) && ['mt5', 'mt4', ''].includes(String(c.plataforma ?? 'mt5')))
  if (a) return { ref: `mt5:auto:${a.id}`, reutilizada: true }
  const tabelaWt = !wt.error
  const w = (wt.data ?? []).find((c) => normServidor(c.servidor) === normServidor(servidor))
  if (w?.metaapi_account_id && w.estado === 'connected') return { ref: `mt5:wt:${w.id}`, reutilizada: true }

  if (!isMetaApiConfigured()) throw new ErroCorretora(503, 'MetaApi indisponível no servidor.')
  if (!tabelaWt) throw new ErroCorretora(503, 'Entrar numa conta MT5 nova no WebTrader ainda não está ligado nesta base (falta a migração 076). As contas MT5 já ligadas continuam a abrir.')

  const chave = chaveTentativa('mt5', login, servidor, hash)
  await travao(userId, chave)

  // 2) Quota MetaApi ANTES de criar — criar e recusar depois deixava contas a pagar.
  const quota = await verificarQuotaMetaApi(userId, { login, servidor })
  if (!quota.ok) {
    throw new ErroCorretora(402, quota.erro ?? 'Limite de contas MetaTrader do teu plano.', 'quota_metaapi', {
      quota: { plano: quota.estado.plano, emUso: quota.estado.emUso, limite: Number.isFinite(quota.estado.limite) ? quota.estado.limite : null },
      compraPermitida: opcoes.compraPermitida,
    })
  }

  // Linha pending primeiro: um segundo pedido em paralelo já a vê na quota.
  let linhaId = w?.id as string | undefined
  if (linhaId) {
    await db.from('webtrader_contas_mt5').update({ estado: 'pending', erro: null, updated_at: new Date().toISOString() }).eq('id', linhaId).eq('user_id', userId)
  } else {
    const { data: nova, error } = await db.from('webtrader_contas_mt5').insert({ user_id: userId, login, servidor, plataforma, estado: 'pending' }).select('id').single()
    if (error || !nova) throw new ErroCorretora(error?.code === '23505' ? 409 : 500, error?.code === '23505' ? 'Esta conta já está a ser ligada — espera um momento.' : 'Não foi possível registar a conta.')
    linhaId = String(nova.id)
  }
  const falhar = async (msg: string) => {
    await db.from('webtrader_contas_mt5').delete().eq('id', linhaId!).eq('user_id', userId)
    return msg
  }

  const r = await criarContaMetaApiDireta({ login, password, server: servidor, platform: plataforma, userId, userLabel: `MTM WebTrader · ${userId.slice(0, 8)}` })
  if (!r.ok) {
    if (r.existente) {
      // 3) Já existe na MetaApi. Só se for uma conta órfã DESTE utilizador se reaproveita (sem mexer na password).
      if (r.existente.mtmUserId === userId) {
        await db.from('webtrader_contas_mt5').update({ metaapi_account_id: r.existente.id, estado: 'connected', erro: null, updated_at: new Date().toISOString() }).eq('id', linhaId).eq('user_id', userId)
        await registarTentativa(userId, chave, true)
        return { ref: `mt5:wt:${linhaId}`, reutilizada: true }
      }
      throw new ErroCorretora(409, await falhar('Esta conta MT5 já está ligada à MTM noutro perfil ou produto. Usa a conta MTM onde a ligaste, ou remove-a lá primeiro.'))
    }
    // 4) Falhou: não fica nenhuma conta MetaApi a pagar.
    if (r.accountId) await deleteMetaApiAccount(r.accountId).catch(() => false)
    if (r.credenciais) {
      await registarTentativa(userId, chave, false)
      await esperar(ESPERA_FALHA_MS)
      throw new ErroCorretora(401, await falhar('A corretora recusou o login — confirma login, password e servidor.'))
    }
    throw new ErroCorretora(502, await falhar(r.erro))
  }

  await db.from('webtrader_contas_mt5').update({ metaapi_account_id: r.accountId, estado: 'connected', erro: null, updated_at: new Date().toISOString() }).eq('id', linhaId).eq('user_id', userId)
  await registarTentativa(userId, chave, true)
  return { ref: `mt5:wt:${linhaId}`, reutilizada: false }
}

/** Remove uma conta aberta só no WebTrader: apaga a conta MetaApi (se nenhuma outra ligação a usa). */
export async function removerContaWebtraderMt5(userId: string, id: string) {
  const db = getSupabaseAdmin()
  const { data: linha, error } = await db.from('webtrader_contas_mt5').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error || !linha) throw new ErroCorretora(404, 'Conta não encontrada.')
  let metaapi: 'apagada' | 'partilhada' | 'pendente' | 'sem_conta' = 'sem_conta'
  if (linha.metaapi_account_id) {
    const [{ data: s }, { data: a }] = await Promise.all([
      db.from('mtmcopy_connections').select('id').eq('metaapi_account_id', linha.metaapi_account_id).neq('mt5_status', 'disconnected').limit(1),
      db.from('mtmauto_accounts').select('id').eq('metaapi_account_id', linha.metaapi_account_id).limit(1),
    ])
    if ((s ?? []).length || (a ?? []).length) metaapi = 'partilhada'
    else {
      const { apagarContaMetaApiConfirmado } = await import('@/lib/contas/metaapi-contas')
      const token = process.env.METAAPI_TOKEN
      const r = token ? await apagarContaMetaApiConfirmado(String(linha.metaapi_account_id), token) : { ok: false }
      metaapi = r.ok ? 'apagada' : 'pendente'
    }
  }
  await db.from('webtrader_contas_mt5').delete().eq('id', id).eq('user_id', userId)
  return { ok: true, metaapi }
}
