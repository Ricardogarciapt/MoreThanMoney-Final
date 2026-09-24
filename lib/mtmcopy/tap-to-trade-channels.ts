import { getSignalSourcesConfig } from './signal-sources-config'
import type { ProviderRoute } from './signal-sources-config'
import { normalizeProviderRoutes } from './provider-routes'

/** Mapeia o sender_channel da rota provider → canais de chat onde os sinais aparecem. */
export const T2T_SENDER_TO_CHAT: Record<string, string[]> = {
  'premium-signals': ['premium-ideas'],
  // trade-ideas cobre Forex + MTM Scanner + Índices + Forex Swings + Cripto (PrimeVerse) +
  // Sensei VALIDADO (só as entradas activadas que caem no chat 'sensei-scanner').
  // O GoldKiller usa app_channel próprio ('sinais-goldkiller').
  // 2026-08-27: saiu daqui o 'trade-ideas-setup' (Ideias de Forex) — muito aviso, pouco toque.
  //
  // O 'sinais-scanner-mtm' esteve fora durante umas horas por engano meu: o slug lê-se como
  // "sinais scanner MTM", mas o canal chama-se **Sinais PrimeVerse** e é por ele que entram os
  // sinais dos traders de topo do PrimeVerse — que são para aceitar, não para esconder.
  // 18/09: `cripto-perps` fundido em `aurum-flow` (canal «MTM Auto Aurum Flow & Perpétuos»); o
  // slug antigo fica para as mensagens que ainda lá estejam até correr a migração 118.
  'trade-ideas': ['sinais-scanner-mtm', 'trade-ideas', 'ideias-e-sinais', 'aurum-flow', 'cripto-perps', 'sensei-scanner'],
}

/**
 * Âmbito T2T decidido: MTM Scanner + GoldKiller + Forex + Premium + Sensei (entradas
 * validadas — pedido Ricardo 2026-08-20: Sensei entra no monitor/gestão T2T completa).
 * Nota: a lista viva é calculada dinamicamente por tapToTradeEnabledChannels() a partir
 * das rotas com tap_to_trade=true; esta constante é o espelho canónico/documental.
 */
// 'cripto-perps' entra aqui para os perpétuos poderem ser SEGUIDOS no T2T (ver t2tMode:
// nos perpétuos o botão não abre ordem, marca o sinal como seguido). Sem isto o fallback
// rejeitava-os com 'provider_off' quando a configuração de rotas não estivesse disponível.
export const T2T_SIGNAL_CHANNELS = ['sinais-scanner-mtm', 'trade-ideas', 'ideias-e-sinais', 'sinais-goldkiller', 'premium-ideas', 'sensei-scanner', 'aurum-flow', 'cripto-perps']

/**
 * O NOME DE UMA FONTE T2T — o mesmo no painel do admin, na app e no chat.
 *
 * Havia dois mapas, um em cada ponta, e não diziam o mesmo do mesmo canal:
 *   · `ideias-e-sinais` era «Ideias e Sinais» no admin e «Ideias Forex Swings» na app;
 *   · o mapa da app não conhecia `premium-ideas`, `sinais-goldkiller` nem `sensei-scanner`, e
 *     nesses o cliente via o slug cru no seletor de fontes.
 * Nenhum dos dois batia certo com o nome do canal no chat, que é o que a pessoa lê a seguir.
 *
 * Os nomes abaixo são os de `chat_channels.name` (24/09). Quem tiver a linha do canal à mão deve
 * passar o nome vivo a `rotuloCanalT2T` — esta tabela é a rede de segurança, não a verdade.
 */
export const ROTULOS_CANAIS_T2T: Record<string, string> = {
  'premium-ideas': 'MTM Auto Premium',
  'sensei-scanner': 'MTM Auto Sensei',
  'sinais-goldkiller': 'Sinais Scanner Gold Killer',
  'sinais-scanner-mtm': 'MTM Auto Edge/Wolf/King',
  'aurum-flow': 'MTM Auto Aurum Flow & Perpétuos',
  // 18/09: `cripto-perps` fundido em `aurum-flow`; o slug antigo fica até correr a migração 118.
  'cripto-perps': 'MTM Auto Aurum Flow & Perpétuos',
  'trade-ideas-setup': 'Ideias de Forex',
  'trade-ideas': 'Ideias de Índices',
  // Swings: entram e ficam. Vão para T2T sem motor de gestão — só se acompanha o desfecho.
  'ideias-e-sinais': 'Ideias e Sinais',
}

/** O nome a mostrar: o do canal no chat se o tivermos, senão o canónico, senão o slug. */
export function rotuloCanalT2T(slug: string, nomeDoChat?: string | null): string {
  const s = String(slug ?? '').trim()
  const vivo = String(nomeDoChat ?? '').trim()
  return vivo || ROTULOS_CANAIS_T2T[s] || s
}

/** Slug do canal de chat DEDICADO de uma rota provider (estável, por id da rota). */
export function deriveProviderChannelSlug(r: ProviderRoute): string {
  return `t2t-${r.id}`
}

/**
 * Canal(is) de chat onde os sinais de uma rota provider aparecem:
 *  1) app_channel explícito na rota; senão
 *  2) mapa canónico por sender_channel (Premium/Sensei/Trade Ideas); senão (rota custom)
 *  3) canal DEDICADO da rota (t2t-<id>) — auto-criado no chat quando a rota está ativa.
 */
export function appChannelsForRoute(r: ProviderRoute): string[] {
  if (r.app_channel?.trim()) return [r.app_channel.trim()]
  const mapped = T2T_SENDER_TO_CHAT[r.sender_channel ?? '']
  if (mapped?.length) return mapped
  return [deriveProviderChannelSlug(r)]
}

/**
 * Canais de chat ATIVOS no Tap to Trade — qualquer rota com `tap_to_trade`, incluindo rotas
 * custom (sem sender_channel). Devolve null se a config falhar.
 *
 * ⚠️ Só olha para `tap_to_trade`. NÃO olha para `enabled`.
 *
 * São dois interruptores porque são duas coisas diferentes: `enabled` é a **cópia automática**
 * (o CopyFactory a replicar para a conta do cliente sem ele fazer nada), `tap_to_trade` é o
 * cliente **aceitar um sinal à mão**. Exigir os dois fazia com que pausar a cópia arrastasse o
 * T2T atrás — os interruptores T2T continuavam verdes no painel e mesmo assim o botão de
 * aceitar desaparecia dos chats. Quem pausa a cópia quer travar o automático, não tirar às
 * pessoas a hipótese de decidirem por elas.
 *
 * Isto também mantém a GESTÃO das posições T2T já abertas a funcionar durante uma pausa
 * (`t2t-management` lê daqui): parar de gerir uma posição aberta seria abandoná-la.
 */
export async function tapToTradeEnabledChannels(): Promise<Set<string> | null> {
  try {
    const config = await getSignalSourcesConfig()
    const routes = normalizeProviderRoutes(config)
    const set = new Set<string>()
    for (const r of routes) {
      if (r.tap_to_trade === true) {
        for (const ch of appChannelsForRoute(r)) set.add(ch)
      }
    }
    // Fontes sem conta provedora (o cliente é quem abre) — ver t2t_extra_channels.
    for (const ch of config.t2t_extra_channels ?? []) {
      const slug = String(ch).trim()
      if (slug) set.add(slug)
    }
    return set
  } catch {
    return null
  }
}
