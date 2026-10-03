/**
 * Sincroniza os canais de chat DEDICADOS das rotas provider Tap to Trade.
 *  - Rota ATIVA (tap_to_trade + enabled) e sem canal canónico/app_channel → canal `t2t-<id>`
 *    é criado (aparece no chat, sob "Sinais & Ideias").
 *  - Rota INATIVA / removida → o canal `t2t-<id>` é apagado (desaparece do chat).
 * As mensagens (chat_messages) persistem; reativar a rota faz o canal reaparecer.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSignalSourcesConfig } from './signal-sources-config'
import { normalizeProviderRoutes } from './provider-routes'
import { appChannelsForRoute } from './tap-to-trade-channels'

const supabase = getSupabaseAdmin()

/**
 * O nome que o canal mostra às pessoas.
 *
 * O `label` da rota é interno — é como a fonte se chama no MTM Auto («MTM Auto Aurum Flow»).
 * No chat do site e das apps isso lê-se como se fosse outro produto: quem abre a lista quer ver
 * a estratégia, «Aurum Flow». Tiramos o prefixo e ficamos com o nome pelo qual ela é conhecida.
 */
function nomeDoCanal(r: { label?: string | null; tag?: string | null }): string {
  const bruto = (r.label ?? r.tag ?? '').trim()
  const semPrefixo = bruto.replace(/^MTM\s+Auto\s+/i, '').trim()
  return (semPrefixo || bruto || 'Estratégia MTM').slice(0, 60)
}

export async function syncProviderRouteChannels(): Promise<{ created: number; removed: number; updated: number }> {
  const out = { created: 0, removed: 0, updated: 0 }

  let routes: ReturnType<typeof normalizeProviderRoutes> = []
  try {
    routes = normalizeProviderRoutes(await getSignalSourcesConfig())
  } catch {
    return out
  }

  // Canais dedicados desejados (apenas rotas ATIVAS com canal próprio t2t-*)
  const desired = new Map<string, { name: string; position: number }>()
  let pos = 20
  for (const r of routes) {
    if (r.tap_to_trade !== true || r.enabled === false) continue
    const ch = appChannelsForRoute(r)[0]
    if (!ch || !ch.startsWith('t2t-')) continue // só os dedicados (canónicos/app_channel ficam de fora)
    desired.set(ch, { name: nomeDoCanal(r), position: pos++ })
  }

  const { data: existing } = await supabase
    .from('chat_channels')
    .select('slug, name')
    .like('slug', 't2t-%')
  const existingBySlug = new Map((existing ?? []).map((r) => [r.slug as string, (r.name as string) ?? '']))

  // Criar / atualizar os ativos
  for (const [slug, meta] of desired) {
    if (!existingBySlug.has(slug)) {
      await supabase
        .from('chat_channels')
        .insert({
          slug,
          name: meta.name,
          description: 'Estratégia MTM — sinais Tap to Trade',
          parent_slug: 'sinais',
          position: meta.position,
        })
        .then(() => { out.created++ }, () => {})
    } else if (existingBySlug.get(slug) !== meta.name) {
      await supabase
        .from('chat_channels')
        .update({ name: meta.name, position: meta.position })
        .eq('slug', slug)
        .then(() => { out.updated++ }, () => {})
    }
  }

  // Apagar os que já não estão ativos (rota desativada/removida) → canal desaparece
  for (const slug of existingBySlug.keys()) {
    if (!desired.has(slug)) {
      await supabase
        .from('chat_channels')
        .delete()
        .eq('slug', slug)
        .then(() => { out.removed++ }, () => {})
    }
  }

  return out
}
