import { podeAcederPremiumUi, type PerfilUi } from '@/lib/perfil-ui'
import { scannerKeyFromStrategy } from '@/lib/mtm-alerts/scanners'

/**
 * QUEM PODE LER OS SINAIS PAGOS — a mesma regra no chat, nos Alertas MTM e nas notificações.
 *
 * O chat fechava os canais de sinais pagos (Premium · Ouro, Sensei Scanner, GoldKiller) a quem não
 * é Premium. Mas os MESMOS sinais saíam por duas portas laterais sem regra nenhuma:
 *
 *   • /api/mtm-alerts devolvia entrada, stop e alvos a qualquer conta com sessão — o cadeado do
 *     chat fechava a porta da frente e a das traseiras ficava aberta;
 *   • a notificação push do canal ia para TODAS as contas activas, com as primeiras linhas do
 *     sinal no corpo. Quem não pagava lia o sinal no ecrã bloqueado.
 *
 * Aqui a pergunta faz-se uma vez. Módulo PURO (sem chave de serviço): serve servidor, testes e,
 * se for preciso, o browser. A leitura da base para o direito MTM Auto vive em
 * `lib/direito-sinais-servidor.ts`.
 *
 * REGRA DE OURO: não se corta a quem paga ou tem direito. Por isso a regra é MAIS larga do que a
 * que o chat escrevia à mão (`subscription_plan === 'premium'` só): o Premium vive em dois campos,
 * o Fundador é Premium com outro nome, o VIP vive em três, e o cliente MTM Auto com direito à cópia
 * da estratégia Premium recebe os sinais que essa cópia executa.
 */

/** Os canais cujo conteúdo é pago. É a lista do `canReadChannel` (lib/chat-channel-permissions). */
// O canal Premium (premium-ideas) abriu aos membros por decisão do dono (18/09): a leitura vem de
// chat_channels.leitura='membros'; aqui deixa de contar como canal pago para os avisos.
export const CANAIS_SINAIS_PAGOS = ['sensei-scanner', 'sinais-goldkiller'] as const

export function canalDeSinaisPago(slug?: string | null): boolean {
  return (CANAIS_SINAIS_PAGOS as readonly string[]).includes(String(slug ?? '').trim())
}

export type PerfilSinais = PerfilUi & { is_active?: boolean | null }

/**
 * Tem direito ao conteúdo dos sinais pagos?
 *
 *   • admin, VIP (user_type, member_category OU membership_level), Premium (member_category,
 *     membership_level OU subscription_plan), Fundador, IQ — `podeAcederPremiumUi`;
 *   • trial (guest com a categoria Premium) — entra pela categoria, como hoje;
 *   • direito ao MTM Auto (`direito_mtm_auto`) — quem paga a cópia da estratégia não fica sem ver
 *     o sinal que a cópia lhe abriu. Conta mesmo com o perfil do site em pausa: é outro produto.
 *
 * A conta do site tem de estar ACTIVA (`is_active === true`) — é a mesma exigência do chat.
 */
export function temDireitoSinaisPagos(
  perfil: PerfilSinais | null | undefined,
  opcoes: { direitoMtmAuto?: boolean } = {},
): boolean {
  if (opcoes.direitoMtmAuto) return true
  if (!perfil || perfil.is_active !== true) return false
  return podeAcederPremiumUi(perfil)
}

export interface AlertaClassificavel {
  strategy?: string | null
  alertName?: string | null
  assetClass?: string | null
}

/**
 * Este alerta é de um sinal pago?
 *
 * Espelha o roteamento do webhook (app/api/webhooks/tradingview → resolveRoute): o GoldKiller vai
 * sempre para `sinais-goldkiller`; o Sensei vai para `sensei-scanner` no ouro/BTC, e para canais
 * abertos no forex (`trade-ideas-setup`) e nos perpétuos (`cripto-perps`). Um Sensei sem canal
 * (índices, outros) fica do lado pago — é o scanner Premium. MTM Scanner e Aurum Flow são abertos.
 */
export function alertaDeSinalPago(a: AlertaClassificavel): boolean {
  const scanner = scannerKeyFromStrategy(a.strategy || a.alertName)
  if (scanner === 'goldkiller') return true
  if (scanner === 'sensei') return a.assetClass !== 'forex' && a.assetClass !== 'crypto_perp'
  return false
}

/** Os campos de um alerta que SÃO o sinal — o que não se entrega a quem não tem direito. */
export interface AlertaComConteudo {
  action: string | null
  direction: 'buy' | 'sell' | 'neutral'
  entry: number | null
  stopLoss: number | null
  takeProfits: number[]
  confirmations: unknown[]
  message: string | null
  aiAnalysis: string | null
  chartImageUrl: string | null
  slDistance: number | null
  slPercent: number | null
  slPips: number | null
  crypto: unknown | null
}

export type AlertaBloqueado<T> = T & { bloqueado: true; motivoBloqueio: 'premium' }

/**
 * A linha continua na lista (ticker, scanner, timeframe, hora, estado e o desfecho em pips de um
 * sinal já fechado — a prova do que o Premium dá), mas sem nada com que se possa operar: nem
 * direcção, nem entrada, nem stop, nem alvos, nem gráfico anotado, nem a gestão da IA.
 */
export function ocultarConteudoDoAlerta<T extends AlertaComConteudo>(a: T): AlertaBloqueado<T> {
  return {
    ...a,
    action: null,
    direction: 'neutral',
    entry: null,
    stopLoss: null,
    takeProfits: [],
    confirmations: [],
    message: null,
    aiAnalysis: null,
    chartImageUrl: null,
    slDistance: null,
    slPercent: null,
    slPips: null,
    crypto: null,
    bloqueado: true,
    motivoBloqueio: 'premium',
  } as AlertaBloqueado<T>
}
