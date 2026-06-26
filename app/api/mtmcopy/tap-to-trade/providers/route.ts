import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSignalSourcesConfig } from '@/lib/mtmcopy/signal-sources-config'
import { normalizeProviderRoutes } from '@/lib/mtmcopy/provider-routes'
import { mtmStrategyPublicLabel } from '@/lib/mtmcopy/provider-constants'

export const dynamic = 'force-dynamic'

const supabase = getSupabaseAdmin()

/** Mapeia o sender_channel da rota → canais de chat onde os sinais aparecem. */
const SENDER_TO_CHAT: Record<string, string[]> = {
  'premium-signals': ['premium-ideas'],
  'trade-ideas': ['sensei-scanner', 'trade-ideas-setup', 'trade-ideas'],
}

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

  return NextResponse.json({
    providers,
    channels: [...channelSet],
    enabled: providers.length > 0,
  })
}
