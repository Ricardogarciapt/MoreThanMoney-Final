import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSignalSourcesConfig } from '@/lib/mtmcopy/signal-sources-config'
import { normalizeProviderRoutes } from '@/lib/mtmcopy/provider-routes'
import { mtmStrategyPublicLabel } from '@/lib/mtmcopy/provider-constants'
import { appChannelsForRoute } from '@/lib/mtmcopy/tap-to-trade-channels'

export const dynamic = 'force-dynamic'

/** Nome público das fontes T2T sem conta provedora. */
/** Nome legível das fontes SEM conta provedora nossa — senão aparece o slug cru na app. */
const T2T_EXTRA_LABELS: Record<string, string> = {
  'trade-ideas-setup': 'Ideias de Forex',
  // O slug lê-se como "scanner MTM", mas o canal é o dos traders de topo do PrimeVerse.
  'sinais-scanner-mtm': 'PrimeVerse',
  // Swings: entram e ficam. Vão para T2T sem motor de gestão — só se acompanha o desfecho.
  'ideias-e-sinais': 'Ideias Forex Swings',
}

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
  // Fontes sem conta provedora nossa (as «Ideias de Forex», por exemplo): dão botão na app, mas
  // não há posição nossa por trás — quem abre é o cliente. Ver `t2t_extra_channels`.
  let extras: string[] = []
  try {
    const cfg = await getSignalSourcesConfig()
    extras = (cfg.t2t_extra_channels ?? []).map((c) => String(c).trim()).filter(Boolean)
    for (const ch of extras) channelSet.add(ch)
  } catch {
    /* sem extras */
  }
  const providers = active.map((r) => {
    // inclui rotas custom (sem sender_channel) via app_channel / fallback genérico
    for (const ch of appChannelsForRoute(r)) channelSet.add(ch)
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

  const providersComExtras = [
    ...providers,
    ...extras.map((ch) => ({
      label: T2T_EXTRA_LABELS[ch] ?? ch,
      strategy: T2T_EXTRA_LABELS[ch] ?? ch,
      sender_channel: ch,
    })),
  ]

  return NextResponse.json({
    providers: providersComExtras,
    channels: [...channelSet],
    senseiSignalIds,
    enabled: providersComExtras.length > 0,
  })
}
