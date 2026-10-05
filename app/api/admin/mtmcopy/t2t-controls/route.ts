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
 *  · extra_channel     → liga/desliga canais T2T sem rota própria (ex.: aurum-flow, o canal de cripto).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { escreverEstrategia } from '@/lib/admin-centro/servidor/estrategia-escrita'
import { quemAdminDoSite } from '@/lib/admin-centro/servidor/quem-decide'
import { CANAIS_T2T_EXTRA } from '@/lib/admin-centro/estrategia-escrita-plano'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSignalSourcesConfig, invalidateSignalSourcesCache } from '@/lib/mtmcopy/signal-sources-config'
import { normalizeProviderRoutes } from '@/lib/mtmcopy/provider-routes'
import { appChannelsForRoute } from '@/lib/mtmcopy/tap-to-trade-channels'
import { ROTA_PARA_SLUGS_MTMAUTO } from '@/lib/mtmauto/espelho-interruptores'
import { rotuloCanalT2T } from '@/lib/mtmcopy/tap-to-trade-channels'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Fontes T2T sem rota própria que o admin pode ligar/desligar diretamente. Os NOMES vêm de
 * lib/mtmcopy/tap-to-trade-channels — os mesmos que a app mostra ao cliente no seletor de fontes.
 */
// `ideias-e-sinais` (Forex Swings) saiu a 04/10/2026 — canal fechado pelo dono; não há o que ligar.
const EXTRA_CHANNELS = CANAIS_T2T_EXTRA


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
    const slugs = ROTA_PARA_SLUGS_MTMAUTO[r.id] ?? []
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
  // Fontes abandonadas saem do painel: canal ESCONDIDO no chat e fonte desligada (ex.: Ideias de
  // Forex desde 27/08). Se alguém a religar à mão continua a aparecer — só se esconde o que está
  // morto dos dois lados.
  const { data: canais } = await supabase.from('chat_channels').select('slug, name, hidden')
  const canalEscondido = new Set((canais ?? []).filter((c) => c.hidden === true).map((c) => String(c.slug)))
  // O nome vivo do canal ganha ao canónico: o admin vê o mesmo que o cliente vê no chat.
  const nomeDoChat = new Map((canais ?? []).map((c) => [String(c.slug), String(c.name ?? '')]))
  const extras = EXTRA_CHANNELS
    .filter((ch) => !routeChannels.has(ch)) // canais já governados por rota ficam do lado das rotas
    .filter((ch) => extrasActive.has(ch) || !canalEscondido.has(ch))
    .map((channel) => ({ channel, label: rotuloCanalT2T(channel, nomeDoChat.get(channel)), active: extrasActive.has(channel) }))

  return { strategies, extras }
}

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  return NextResponse.json(await buildState())
}

/**
 * FACHADA (05/10): as escritas vivem na camada única (`lib/admin-centro/servidor/estrategia-escrita.ts`,
 * acções `rota_provider` e `canal_extra`) — com a MESMA ordem do travão (config → `ativo` na MTM Auto →
 * CopyFactory). Esta rota fica viva porque a app-mobile (separador Estratégias do T2T) chama-a.
 */
export const POST = soAdmin(async (adminId: string, request: NextRequest) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action ?? '')
  const value = body.value === true
  const quem = quemAdminDoSite(adminId)
  let r
  if (action === 'extra_channel') {
    const channel = String(body.channel ?? '').trim()
    if (!channel || !EXTRA_CHANNELS.includes(channel)) return NextResponse.json({ error: 'canal inválido' }, { status: 400 })
    r = await escreverEstrategia(quem, { accao: 'canal_extra', channel, value })
  } else if (action === 'route_copy' || action === 'route_t2t') {
    r = await escreverEstrategia(quem, { accao: 'rota_provider', routeId: String(body.routeId ?? '').trim(), campo: action === 'route_copy' ? 'copia' : 't2t', value })
  } else {
    return NextResponse.json({ error: 'action inválida' }, { status: 400 })
  }
  if (!r.ok) return NextResponse.json({ error: r.mensagem }, { status: r.status })
  return NextResponse.json({ ok: true, ...(await buildState()) })
})
