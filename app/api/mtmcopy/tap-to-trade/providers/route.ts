import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSignalSourcesConfig } from '@/lib/mtmcopy/signal-sources-config'
import { normalizeProviderRoutes } from '@/lib/mtmcopy/provider-routes'
import { mtmStrategyPublicLabel } from '@/lib/mtmcopy/provider-constants'
import { T2T_SENDER_TO_CHAT as SENDER_TO_CHAT } from '@/lib/mtmcopy/tap-to-trade-channels'

export const dynamic = 'force-dynamic'

const supabase = getSupabaseAdmin()

async function authed(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  return !!user
}

/** Providers/estratégias ativas no Tap to Trade + canais de chat associados. */
export async function GET(request: NextRequest) {
  if (!(await authed(request))) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  }

  let routes: ReturnType<typeof normalizeProviderRoutes> = []
  try {
    const config = await getSignalSourcesConfig()
    routes = normalizeProviderRoutes(config)
  } catch (e) {
    return NextResponse.json({ providers: [], channels: [], error: e instanceof Error ? e.message : 'erro' })
  }

  const active = routes.filter((r) => r.tap_to_trade === true && r.enabled !== false)

  const channelSet = new Set<string>()
  const providers = active.map((r) => {
    const senderKey = r.sender_channel ?? ''
    for (const ch of SENDER_TO_CHAT[senderKey] ?? []) channelSet.add(ch)
    return {
      label: (r.label ?? r.tag ?? '').trim() || mtmStrategyPublicLabel(r.strategy_id),
      strategy: mtmStrategyPublicLabel(r.strategy_id),
      sender_channel: r.sender_channel ?? null,
    }
  })

  // Sensei: só as ideias ACTIVADAS (= trades que abrem na conta provider + aparecem
  // no chat) são elegíveis para T2T → melhora a qualidade dos sinais.
  let senseiSignalIds: string[] = []
  if (channelSet.has('sensei-scanner')) {
    const { data: ideas } = await supabase
      .from('sensei_trade_ideas')
      .select('chat_message_id')
      .eq('status', 'activated')
      .not('chat_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60)
    senseiSignalIds = (ideas ?? [])
      .map((i) => i.chat_message_id as string | null)
      .filter((id): id is string => !!id)
  }

  return NextResponse.json({
    providers,
    channels: [...channelSet],
    senseiSignalIds,
    enabled: providers.length > 0,
  })
}
