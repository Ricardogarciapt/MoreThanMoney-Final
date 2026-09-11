/**
 * Controlos ADMIN do Tap to Trade e da cópia automática — pensados para o separador
 * "Estratégias" do T2T na app-mobile (pedido Ricardo 2026-09-04), mas servem qualquer admin UI.
 *
 * GET  → estado atual: rotas provider (cópia ligada? fonte T2T visível?) + fontes extra.
 * POST → { action: 'route_copy'|'route_t2t'|'extra_channel', routeId?|channel?, value }
 *
 *  · route_copy=false  → pausa SÓ a CÓPIA AUTOMÁTICA da estratégia (o Tap to Trade continua,
 *    é governado pelo interruptor dele): route.enabled=false,
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
import {
  getSignalSourcesConfig,
  saveSignalSourcesConfig,
  invalidateSignalSourcesCache,
} from '@/lib/mtmcopy/signal-sources-config'
import { normalizeProviderRoutes, syncChannelProvidersFromRoutes } from '@/lib/mtmcopy/provider-routes'
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

/**
 * Rota ↔ provider MTM Auto (mtmauto_providers.slug) — espelho do pause na app MTM Auto.
 *
 * Cada estratégia com conta mestre própria precisa de estar aqui, senão o interruptor do admin
 * pausa a rota e deixa o provider ligado — a app MTM Auto continuava a mostrá-la activa e os
 * subscritores a copiá-la. O espelho é o que faz «pausar» significar o mesmo nos dois sítios.
 */
const ROUTE_TO_MTMAUTO_SLUGS: Record<string, string[]> = {
  'canonical-premium-signals': ['premium-ouro'],
  'canonical-sensei': ['sensei'],
  // ⚠️ O slug 'golden-moves' é o nome ANTIGO da Aurum Flow (herança), não uma estratégia própria.
  'canonical-aurum-flow': ['golden-moves'],
  'canonical-golden-astro': ['mtm-auto-golden-astro'],
  // As que ganharam conta mestre e estratégia CopyFactory próprias (2026-09-11). O Gold Did
  // saiu de baixo do Premium: partilhavam interruptor e pausar um parava os dois.
  'canonical-goldkiller': ['Goldkiller'],
  'canonical-gold-did': ['gold-did-premium'],
  'canonical-mtm-scanner': ['mtm-scanner'],
  'canonical-golden-moves': ['golden-moves-fonte'],
}

async function buildState() {
  const supabase = getSupabaseAdmin()
  // Sempre fresco: este painel é onde se pausa uma estratégia, e mostrar o estado de há 30
  // segundos é mostrar ligado o que já está parado.
  invalidateSignalSourcesCache()
  const config = await getSignalSourcesConfig()
  const routes = normalizeProviderRoutes(config)
  const { data: mtmauto } = await supabase.from('mtmauto_providers').select('slug, nome, ativo')
  const mtmautoBySlug = new Map((mtmauto ?? []).map((p) => [p.slug, p]))

  const routeChannels = new Set<string>()
  const strategies = routes.map((r) => {
    const channels = appChannelsForRoute(r)
    // Igual ao tapToTradeEnabledChannels(): o T2T é governado só pelo seu interruptor.
    if (r.tap_to_trade === true) channels.forEach((c) => routeChannels.add(c))
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
  invalidateSignalSourcesCache()
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
    // `channel_providers` é o mapa antigo por canal, e é reescrito a partir das rotas ATIVAS.
    // Tem de ser reescrito AQUI e não só no system-sync: enquanto lá ficar a conta mestre de
    // uma rota pausada, a resolução do sinal encontra-a por esse caminho e executa na mesma.
    await saveSignalSourcesConfig({
      ...config,
      provider_routes: nextRoutes,
      channel_providers: syncChannelProvidersFromRoutes(nextRoutes),
    })

    if (action === 'route_copy') {
      /**
       * ORDEM IMPORTA. Primeiro os dois escritos BARATOS e autoritários — a config (já feita
       * acima) e o espelho na tabela que a app MTM Auto lê. Só depois o CopyFactory, que é
       * lento e fala com a MetaApi.
       *
       * Porquê: isto já correu ao contrário e custou. A 04/09 o Ricardo pausou as três
       * estratégias; o Sensei e o Aurum Flow ficaram pausados dos dois lados, o Premium não.
       * A config dizia pausado, o CopyFactory tinha a estratégia removida — mas
       * `mtmauto_providers.ativo` continuou `true`, e é ESSE campo que deixa a MTM Auto
       * continuar a ingerir e a executar sinais (`webhook/route.ts` filtra por `ativo`).
       * O Premium é o que tem mais subscritores, logo o `runMtmcopySystemSync()` mais demorado:
       * bateu no `maxDuration` de 60s e a função morreu ANTES da linha do espelho. Resultado:
       * 4 clientes em auto-aceitar a continuar a abrir ordens de uma estratégia que o painel
       * dava como parada.
       *
       * Uma pausa é um travão de segurança. O travão tem de agarrar primeiro e só depois
       * arrumar a casa, nunca ao contrário.
       */
      const slugs = ROUTE_TO_MTMAUTO_SLUGS[routeId]
      if (slugs?.length) {
        const { error } = await supabase.from('mtmauto_providers').update({ ativo: value }).in('slug', slugs)
        if (error) {
          // Se o espelho falha, a pausa NÃO está aplicada onde conta. Dizer que sim seria pior
          // do que falhar: o admin sai daqui a pensar que parou.
          return NextResponse.json(
            { error: `A pausa não chegou à app MTM Auto (${error.message}). A estratégia PODE continuar a executar — repete.` },
            { status: 500 },
          )
        }
      }

      // Só agora o CopyFactory: lento, e best-effort. Se falhar, o travão já agarrou.
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
    }

    return NextResponse.json({ ok: true, ...(await buildState()) })
  }

  return NextResponse.json({ error: 'action inválida' }, { status: 400 })
}
