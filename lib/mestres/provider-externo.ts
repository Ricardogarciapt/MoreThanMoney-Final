/**
 * PROVIDER EXTERNO — validação dos dados mínimos por tipo (metaapi / telegram / mt5). CÓPIA do bloco
 * «provider externo» de `lib/providers-equipa.ts` do repositório mtm-auto: a regra é uma só nos dois
 * admins (MTM Auto e Centro do site). Mudar aqui = mudar lá.
 */
export type TipoProvider = 'mtm_t2t' | 'metaapi' | 'telegram' | 'mtmfunded' | 'tradelocker' | 'mt5'
export const TIPOS_PROVIDER: TipoProvider[] = ['mtm_t2t', 'metaapi', 'telegram', 'mtmfunded', 'tradelocker', 'mt5']

export function tipoDoPedido(v: unknown): TipoProvider {
  const t = String(v ?? '')
  return (TIPOS_PROVIDER as string[]).includes(t) ? (t as TipoProvider) : 'mtm_t2t'
}

// ── provider externo (05/10): dados mínimos por tipo e canal de chat T2T ────

/**
 * O que cada tipo precisa para nascer. Devolve a linha a gravar (sem a password em claro — quem
 * chama cifra-a) ou o erro a mostrar. Puro: testado em __tests__/providers-externos.check.ts.
 */
export function validarProviderExterno(b: Record<string, unknown>):
  | { ok: true; tipo: TipoProvider; linha: Record<string, unknown>; passwordMt5: string | null; aviso: string | null }
  | { ok: false; erro: string } {
  const tipo = tipoDoPedido(b.tipo)
  const limpo = (v: unknown) => String(v ?? '').trim()
  if (tipo === 'metaapi') {
    const conta = limpo(b.metaapi_account_id)
    if (!/^[0-9a-f-]{36}$/i.test(conta)) return { ok: false, erro: 'Paste the MetaApi account id (36 characters) or pick one from the list.' }
    return { ok: true, tipo, linha: { metaapi_account_id: conta, plataforma: b.plataforma === 'mt4' ? 'mt4' : 'mt5' }, passwordMt5: null, aviso: null }
  }
  if (tipo === 'telegram') {
    const chat = limpo(b.telegram_chat_id)
    // Um chat do Telegram é um inteiro (canais/grupos começam por -100). Um @username não serve para
    // o webhook, que entrega pelo id numérico.
    if (!/^-?\d{5,20}$/.test(chat)) return { ok: false, erro: 'Telegram chat id must be the numeric id (e.g. -1001234567890).' }
    return {
      ok: true, tipo,
      linha: { telegram_chat_id: chat, telegram_bot_id: limpo(b.telegram_bot_id) || null, telegram_chat_titulo: limpo(b.telegram_chat_titulo) || null },
      passwordMt5: null,
      aviso: limpo(b.telegram_bot_id) ? null : 'No bot chosen: nothing listens to this chat until a bot of the team is added to it (Telegram tab).',
    }
  }
  if (tipo === 'mt5') {
    const login = limpo(b.login).replace(/\D/g, '')
    const servidor = limpo(b.servidor)
    const password = typeof b.password === 'string' ? b.password : ''
    if (!login || !servidor) return { ok: false, erro: 'Login and server are required for a direct MT5 account.' }
    if (!password && !b.id) return { ok: false, erro: 'Password is required to connect a direct MT5 account.' }
    return {
      ok: true, tipo,
      linha: { login, servidor, plataforma: b.plataforma === 'mt4' ? 'mt4' : 'mt5', metaapi_account_id: null, mt5_estado: 'por_ligar' },
      passwordMt5: password || null,
      aviso: 'Direct MT5 source saved as «por ligar»: the house has no production path to read a MetaTrader account without MetaApi yet. Nothing is read or executed until the owner connects it.',
    }
  }
  return { ok: true, tipo, linha: {}, passwordMt5: null, aviso: null }
}

