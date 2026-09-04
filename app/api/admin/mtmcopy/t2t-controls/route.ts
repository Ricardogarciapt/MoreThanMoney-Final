/**
 * Controlos ADMIN do Tap to Trade e da cópia automática — pensados para o separador
 * "Estratégias" do T2T na app-mobile (pedido Ricardo 2026-09-04), mas servem qualquer admin UI.
 *
 * GET  → estado atual: rotas provider (cópia ligada? fonte T2T visível?) + fontes extra.
 * POST → { action: 'route_copy'|'route_t2t'|'extra_channel', routeId?|channel?, value }
 *
 *  · route_copy=false  → pausa a CÓPIA AUTOMÁTICA da estratégia: route.enabled=false,
 *    removeProviderStrategy (CopyFactory pára JÁ; posições abertas mantêm-se), resync dos
 *    subscribers, e espelha em mtmauto_providers.ativo — a app MTM Auto lê a MESMA tabela,
 *    por isso "sincroniza" por definição. Fica pausada até o admin religar.
 *  · route_t2t=false   → a fonte deixa de aparecer aos clientes no T2T e o botão de
 *    aceitar desaparece dos chats (o feed/accept usam tapToTradeEnabledChannels).
 *  · extra_channel     → liga/desliga canais T2T sem rota própria (ex.: cripto-perps).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSignalSourcesConfig, saveSignalSourcesConfig } from '@/lib/mtmcopy/signal-sources-config'
import { normalizeProviderRoutes } from '@/lib/mtmcopy/provider-routes'
import { appChannelsForRoute } from '@/lib/mtmcopy/tap-to-trade-channels'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Fontes T2T sem rota própria que o admin pode ligar/desligar diretamente. */
const EXTRA_CHANNEL_LABELS: Record<string, string> = {
  'cripto-perps': 'Perpétuos Cripto (Aurum Flow)',
  'premium-ideas': 'Premium · Ouro',
  'sinais-scanner-mtm': 'Sinais Primeverse',
  'trade-ideas-setup': 'Ideias de Forex',
  'ideias-e-sinais': 'Ideias e Sinais',
  'sinais-goldkiller': 'GoldKiller',
  'sensei-scanner': 'Sensei Scanner',
}

/** Rota ↔ provider MTM Auto (mtmauto_providers.slug) — espelho do pause na app MTM Auto. */
const ROUTE_TO_MTMAUTO_SLUGS: Record<string, string[]> = {
  'canonical-premium-signals': ['premium-ouro', 'gold-did-premium'],
  'canonical-sensei': ['sensei'],
  'canonical-aurum-flow': ['golden-moves'],
}

async function buildState() {
  const supabase = getSupabaseAdmin()
  const config = await getSignalSourcesConfig()
  const routes = normalizeProviderRoutes(config)
  const { data: mtmauto } = await supabase.from('mtmauto_providers').select('slug, nome, ativo')
  const mtmautoBySlug = new Map((mtmauto ?? []).map((p) => [p.slug, p]))

  const routeChannels = new Set<string>()
  const strategies = routes.map((r) => {
    const channels = appChannelsForRoute(r)
    if (r.tap_to_trade === true && r.enabled !== false) channels.forEach((c) => routeChannels.add(c))
    const slugs = ROUTE_TO_MTMAUTO_SLUGS[r.id] ?? []
    return {
      routeId: r.id,
      label: r.label ?? r.tag ?? r.id,
      copyEnabled: r.enabled !== false,
      tapToTrade: r.tap_to_trade === true,
      hasAccount: Boolean(r.account_id?.trim()),
      strategyId: r.strategy_id ?? null,
      channels,
      mtmauto: slugs.map((s) => ({ slug: s, ativo: mtmautoBySlug.get(s)?.ativo ?? null })),
    }
  })

  const extrasActive = new Set(config.t2t_extra_channels ?? [])
  const extras = Object.entries(EXTRA_CHANNEL_LABELS)
    .filter(([ch]) => !routeChannels.has(ch)) // canais já governados por rota ficam do lado das rotas
    .map(([channel, label]) => ({ channel, label, active: extrasActive.has(channel) }))

  return { strategies, extras }
}

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  return NextResponse.json(await buildState())
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const body = await request.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const value = body.value === true
  const supabase = getSupabaseAdmin()
  const config = await getSignalSourcesConfig()

  if (action === 'extra_channel') {
    const channel = String(body.channel ?? '').trim()
    if (!channel || !EXTRA_CHANNEL_LABELS[channel]) {
      return NextResponse.json({ error: 'canal inválido' }, { status: 400 })
    }
    const set = new Set(config.t2t_extra_channels ?? [])
    if (value) set.add(channel)
    else set.delete(channel)
    await saveSignalSourcesConfig({ ...config, t2t_extra_channels: [...set] })
    return NextResponse.json({ ok: true, ...(await buildState()) })
  }

  if (action === 'route_copy' || action === 'route_t2t') {
    const routeId = String(body.routeId ?? '').trim()
    // Normalizadas (inclui canónicas reconstruídas) — é sobre estas que o resto do sistema opera.
    const routes = normalizeProviderRoutes(config)
    const target = routes.find((r) => r.id === routeId)
    if (!target) return NextResponse.json({ error: 'rota não encontrada' }, { status: 404 })

    const nextRoutes = routes.map((r) =>
      r.id !== routeId ? r : action === 'route_copy' ? { ...r, enabled: value } : { ...r, tap_to_trade: value },
    )
    await saveSignalSourcesConfig({ ...config, provider_routes: nextRoutes })

    if (action === 'route_copy') {
      // Pausa autoritária da estratégia CopyFactory + resync das subscrições dos clientes.
      try {
        if (!value && target.strategy_id?.trim()) {
          const { removeProviderStrategy } = await import('@/lib/mtmcopy/copyfactory')
          await removeProviderStrategy(target.strategy_id.trim())
        }
        if (value && target.strategy_id?.trim() && target.account_id?.trim()) {
          const { ensureMtmProviderStrategyScaling } = await import('@/lib/mtmcopy/copyfactory')
          await ensureMtmProviderStrategyScaling({
            strategyId: target.strategy_id.trim(),
            accountId: target.account_id.trim(),
            name: target.tag ?? target.label ?? 'MTM Provider',
            description: `MTM Auto · ${target.sender_channel ?? 'provider'}`,
          })
        }
        const { runMtmcopySystemSync } = await import('@/lib/mtmcopy/system-sync')
        await runMtmcopySystemSync()
      } catch (e) {
        console.warn('[t2t-controls] sync CopyFactory falhou:', e)
      }

      // Espelho na app MTM Auto (mesma tabela que a app lê — sincronização imediata).
      const slugs = ROUTE_TO_MTMAUTO_SLUGS[routeId]
      if (slugs?.length) {
        await supabase.from('mtmauto_providers').update({ ativo: value }).in('slug', slugs)
      }
    }

    return NextResponse.json({ ok: true, ...(await buildState()) })
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}
