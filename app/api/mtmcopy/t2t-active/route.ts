import { NextRequest, NextResponse } from 'next/server'
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
    .select('id, account_label, metaapi_account_id, is_active, purpose, mt5_status, t2t_sources, t2t_asset_classes')
    .eq('user_id', user.id)
    .neq('mt5_status', 'disconnected')
  const withAccount = (conns ?? []).filter((c) => c.metaapi_account_id)
  const t2tConn = withAccount.find((c) => c.purpose === 'tap_to_trade') ?? withAccount[0] ?? null
  const activeAccount = t2tConn && t2tConn.is_active !== false ? t2tConn : withAccount.find((c) => c.is_active !== false) ?? null
  const hasAccount = Boolean(activeAccount?.metaapi_account_id)
  const prefs = {
    sources: (t2tConn?.t2t_sources as string[] | null) ?? [],
    assetClasses: (t2tConn?.t2t_asset_classes as string[] | null) ?? [],
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
    accountLabel: activeAccount?.account_label ?? null,
    ttlSec: T2T_MAX_AGE_MS / 1000,
    signals,
  })
}
