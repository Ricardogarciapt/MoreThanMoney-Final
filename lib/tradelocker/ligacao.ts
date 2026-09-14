/**
 * Onde vivem as credenciais TradeLocker de uma ligação e como se abre uma sessão a partir dela.
 *
 * A password guarda-se CIFRADA (AES-256-GCM, lib/mtmfunded/credenciais.ts — chave
 * MTMFUNDED_CRED_KEY) numa tabela só do servidor, `tradelocker_credenciais`. Ao contrário do MT5
 * — onde a password vai para a MetaApi e não fica connosco — a TradeLocker não tem intermediário:
 * cada renovação de sessão caducada precisa do login outra vez, por isso tem de se guardar.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cifrar, decifrar } from '@/lib/mtmfunded/credenciais'
import { TradeLockerSessao, type TLCredenciais, type TLEnv } from './client'

export const PLATAFORMA_TRADELOCKER = 'tradelocker'

export interface LigacaoTL {
  id: string
  mt5_platform?: string | null
  tl_account_id?: string | null
  tl_acc_num?: string | null
  tl_env?: string | null
  tl_server?: string | null
}

export function ehTradeLocker(c: { mt5_platform?: string | null } | null | undefined): boolean {
  return (c?.mt5_platform ?? '').toLowerCase() === PLATAFORMA_TRADELOCKER
}

export function envValido(v: unknown): TLEnv | null {
  return v === 'live' || v === 'demo' ? v : null
}

/**
 * "Bilhete" entre o passo 1 (login + lista de contas) e o passo 2 (escolher a conta): as
 * credenciais cifradas com validade de 10 minutos. Assim o cliente não volta a mandar a
 * password e o servidor não guarda nada antes de o utilizador escolher.
 */
export function emitirBilhete(c: TLCredenciais): string {
  return cifrar(JSON.stringify({ ...c, exp: Date.now() + 10 * 60_000 }))
}

export function lerBilhete(bilhete: string | null | undefined): TLCredenciais | null {
  const txt = decifrar(bilhete)
  if (!txt) return null
  try {
    const o = JSON.parse(txt) as TLCredenciais & { exp?: number }
    if (!o.exp || o.exp < Date.now()) return null
    const env = envValido(o.env)
    if (!env || !o.email || !o.password || !o.server) return null
    return { email: o.email, password: o.password, server: o.server, env }
  } catch {
    return null
  }
}

export async function guardarCredenciais(p: {
  userId: string
  mtmcopyConnectionId: string
  cred: TLCredenciais
}): Promise<{ ok: boolean; erro?: string }> {
  const db = getSupabaseAdmin()
  // Apaga e insere (o índice único é parcial e o upsert do PostgREST não o aceita como alvo).
  await db.from('tradelocker_credenciais').delete().eq('mtmcopy_connection_id', p.mtmcopyConnectionId)
  const { error } = await db.from('tradelocker_credenciais').insert({
    user_id: p.userId,
    mtmcopy_connection_id: p.mtmcopyConnectionId,
    tl_email: p.cred.email,
    tl_password_cifrada: cifrar(p.cred.password),
    tl_server: p.cred.server,
    tl_env: p.cred.env,
  })
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Sessão pronta a usar para uma ligação de mtmcopy_connections, ou null com o motivo. */
export async function sessaoDaLigacao(
  conn: LigacaoTL,
): Promise<{ sessao: TradeLockerSessao | null; erro?: string }> {
  if (!conn.tl_account_id || !conn.tl_acc_num) {
    return { sessao: null, erro: 'Conta TradeLocker sem conta escolhida — volta a ligá-la.' }
  }
  const { data } = await getSupabaseAdmin()
    .from('tradelocker_credenciais')
    .select('tl_email, tl_password_cifrada, tl_server, tl_env')
    .eq('mtmcopy_connection_id', conn.id)
    .maybeSingle()
  if (!data) return { sessao: null, erro: 'Credenciais TradeLocker em falta — volta a ligar a conta.' }
  const password = decifrar(data.tl_password_cifrada as string)
  const env = envValido(data.tl_env)
  if (!password || !env) {
    return { sessao: null, erro: 'Não foi possível ler as credenciais TradeLocker — volta a ligar a conta.' }
  }
  return {
    sessao: new TradeLockerSessao(
      { email: data.tl_email as string, password, server: data.tl_server as string, env },
      String(conn.tl_account_id),
      String(conn.tl_acc_num),
    ),
  }
}

/**
 * A ligação é demo? Numa conta TradeLocker decide o AMBIENTE escolhido (demo.tradelocker.com),
 * não o nome do servidor — o servidor é o nome da corretora e raramente diz "demo".
 * Mantém a regra "1 real + 1 demo por produto" (lib/entitlements) igual para as duas plataformas.
 */
export function ligacaoEhDemo(
  c: { mt5_platform?: string | null; tl_env?: string | null; mt5_server?: string | null },
  pareceDemo: (servidor?: string | null) => boolean,
): boolean {
  if (ehTradeLocker(c)) return c.tl_env === 'demo'
  return pareceDemo(c.mt5_server)
}
