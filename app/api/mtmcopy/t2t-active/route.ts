import { NextRequest, NextResponse } from 'next/server'
import { ehMtmFundedLigacao } from '@/lib/mtmcopy/destino-execucao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { parseSignal } from '@/lib/mtmcopy/signal-parser'
import { isT2TEntrySignal, matchesT2TPrefs } from '@/lib/mtmcopy/t2t-source'
import { tapToTradeEnabledChannels, T2T_SIGNAL_CHANNELS } from '@/lib/mtmcopy/tap-to-trade-channels'

/**
 * Sinais T2T ATIVOS do utilizador — fonte única para o Apple Watch (e reutilizável pelas apps
 * nativas). Devolve só as ENTRADAS negociáveis das fontes que o user escolheu seguir, com o
 * countdown (expira aos 5 min) e o estado da conta configurada. GET, Bearer token da sessão.
 */
export const dynamic = 'force-dynamic'

const supabase = getSupabaseAdmin()
const T2T_MAX_AGE_MS = 5 * 60 * 1000

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  return error || !user ? null : user
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  // 1) Conta + prefs de "o que seguir" do utilizador
  const { data: conns } = await supabase
    .from('mtmcopy_connections')
    .select('id, account_label, metaapi_account_id, is_active, purpose, mt5_status, t2t_sources, t2t_asset_classes, t2t_enabled, mt5_platform')
    .eq('user_id', user.id)
    .neq('mt5_status', 'disconnected')
  // Conta MTM Funded ligada (não só-leitura: essas nascem com t2t_enabled=false) também dá feed.
  const withAccount = (conns ?? []).filter((c) =>
    ehMtmFundedLigacao(c) ? c.t2t_enabled === true && c.mt5_status === 'connected' : Boolean(c.metaapi_account_id))
  // Contas T2T (fan-out): dedicadas (purpose) + marcadas (t2t_enabled). Retrocompat: 1ª ligada.
  let t2tAccounts = withAccount.filter((c) => c.purpose === 'tap_to_trade' || c.t2t_enabled === true)
  if (!t2tAccounts.length && withAccount[0]) t2tAccounts = [withAccount[0]]
  const activeAccounts = t2tAccounts.filter((c) => c.is_active !== false)
  const t2tConn = t2tAccounts.find((c) => c.purpose === 'tap_to_trade') ?? t2tAccounts[0] ?? null
  const hasAccount = activeAccounts.length > 0
  // "O que seguir" — usa as prefs da conta primária (o feed é único para o user).
  const prefsConn = activeAccounts[0] ?? t2tConn
  const prefs = {
    sources: (prefsConn?.t2t_sources as string[] | null) ?? [],
    assetClasses: (prefsConn?.t2t_asset_classes as string[] | null) ?? [],
  }

  // 2) Canais T2T ativos + mensagens recentes
  const enabled = await tapToTradeEnabledChannels()
  const channels = enabled ? Array.from(enabled) : T2T_SIGNAL_CHANNELS
  const sinceIso = new Date(Date.now() - T2T_MAX_AGE_MS).toISOString()
  const { data: rows } = await supabase
    .from('chat_messages')
    .select('id, channel_slug, content, created_at')
    .in('channel_slug', channels)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(60)

  // 3) Só ENTRADAS negociáveis + fontes que o user segue
  const now = Date.now()
  const signals = (rows ?? [])
    .filter((m) => isT2TEntrySignal(m.channel_slug, m.content)) // exclui follow-ups + performance/resumo
    .filter((m) => matchesT2TPrefs(m.channel_slug, m.content as string, prefs))
    .map((m) => {
      const sig = parseSignal(m.content as string)
      const hasTp = Array.isArray(sig?.tp) && sig!.tp.some((t) => typeof t === 'number' && t > 0)
      if (!sig || !sig.symbol || !sig.direction || !hasTp) return null
      const ageMs = m.created_at ? now - new Date(m.created_at as string).getTime() : 0
      const expiresInSec = Math.max(0, Math.round((T2T_MAX_AGE_MS - ageMs) / 1000))
      return {
        id: m.id,
        channel: m.channel_slug,
        symbol: sig.symbol,
        direction: sig.direction, // buy|sell
        entry: sig.entry ?? null,
        sl: sig.sl ?? null,
        tps: Array.isArray(sig.tp) ? sig.tp : [],
        createdAt: m.created_at,
        expiresInSec,
      }
    })
    .filter((s): s is NonNullable<typeof s> => s != null && s.expiresInSec > 0)

  return NextResponse.json({
    hasAccount,
    accountLabel: activeAccounts[0]?.account_label ?? null,
    accountCount: activeAccounts.length,
    accounts: activeAccounts.map((c) => ({ id: c.id, label: c.account_label ?? null })),
    ttlSec: T2T_MAX_AGE_MS / 1000,
    signals,
  })
}
