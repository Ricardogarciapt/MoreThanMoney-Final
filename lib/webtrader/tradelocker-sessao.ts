/**
 * ⚠ CANDIDATO A MORTO (05/10) — NÃO APAGADO por dependência cruzada.
 *
 * `emitirSessaoTL` já não é chamado por ninguém: `entrarTradeLocker` (entrar.ts) liga a conta pelo
 * ligador e devolve `sessao: null`. Sem emissão, `lerSessaoTL` nunca encontra uma sessão válida e
 * as refs `tradelocker:sessao:<id>` não abrem. Fica porque o feed directo (lib/webtrader/feed-directo/
 * emitir.ts, de outra frente) ainda importa `lerSessaoTL` e `CABECALHO_SESSAO_TL`. Para apagar:
 * tirar o ramo `origem === 'sessao'` de lá, de contas.ts e de corretoras/regras.ts no mesmo commit.
 */
/**
 * SESSÃO TRADELOCKER DO WEBTRADER — entrar numa conta TradeLocker sem a ligar ao Tap to Trade.
 *
 * O que NÃO se guarda: a password. Nem na base, nem no browser. Depois do login devolve-se ao
 * browser um token CIFRADO (AES-256-GCM, a chave MTMFUNDED_CRED_KEY de lib/mtmfunded/credenciais)
 * com o email, servidor, ambiente, conta escolhida e os JWT da TradeLocker (access + refresh), preso
 * ao utilizador MTM que entrou e com validade de 12 h. Quando a TradeLocker deixa de aceitar o
 * refresh, a sessão cai e pede-se o login outra vez.
 *
 * Contas TradeLocker já ligadas no ligador de contas não passam por aqui: usam as credenciais
 * cifradas da ligação (lib/tradelocker/ligacao.ts) sem novo login.
 */
import { cifrar, decifrar } from '@/lib/mtmfunded/credenciais'
import { semearTokensTradeLocker, TradeLockerSessao, type TLEnv, type TLTokens } from '@/lib/tradelocker/client'

export const VALIDADE_SESSAO_TL_MS = 12 * 60 * 60_000

interface Carga {
  u: string
  e: string
  s: string
  env: TLEnv
  a: string
  n: string
  t: TLTokens
  exp: number
}

export function emitirSessaoTL(p: { userId: string; email: string; server: string; env: TLEnv; accountId: string; accNum: string; tokens: TLTokens }): { token: string; expira: string } {
  const exp = Date.now() + VALIDADE_SESSAO_TL_MS
  const carga: Carga = { u: p.userId, e: p.email, s: p.server, env: p.env, a: p.accountId, n: p.accNum, t: { accessToken: p.tokens.accessToken, refreshToken: p.tokens.refreshToken, expireDate: p.tokens.expireDate ?? null }, exp }
  return { token: cifrar(JSON.stringify(carga)), expira: new Date(exp).toISOString() }
}

/** A sessão, se o token for válido, não expirou, é deste utilizador e desta conta. */
export function lerSessaoTL(token: string | null | undefined, userId: string, accountId: string): { sessao: TradeLockerSessao; email: string; server: string; env: TLEnv } | null {
  let txt: string | null = null
  try { txt = decifrar(token) } catch { txt = null }
  if (!txt) return null
  try {
    const c = JSON.parse(txt) as Carga
    if (!c.exp || c.exp < Date.now() || c.u !== userId || c.a !== accountId) return null
    if ((c.env !== 'live' && c.env !== 'demo') || !c.e || !c.s || !c.t?.accessToken) return null
    semearTokensTradeLocker({ email: c.e, server: c.s, env: c.env }, c.t)
    // Password vazia de propósito: sem refresh válido, o login completo falha e pede-se novo login.
    return { sessao: new TradeLockerSessao({ email: c.e, password: '', server: c.s, env: c.env }, c.a, c.n), email: c.e, server: c.s, env: c.env }
  } catch {
    return null
  }
}
