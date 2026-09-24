import { isT2TEntrySignal } from '@/lib/mtmcopy/t2t-source'

/**
 * PARA ONDE LEVA O TOQUE NUMA NOTIFICAÇÃO.
 *
 * Regra do dono (24/09), depois de o botão de aceitar sair dos chats:
 *   • notificação de TAP TO TRADE (há um sinal para aceitar) → o separador T2T, já no sinal;
 *   • ABERTURA de sinal e ACOMPANHAMENTO (alvo, break-even, stop movido, fecho) → o CHAT, na
 *     mensagem respectiva, que é onde vive o fio da trade.
 *
 * Isto vive numa peça só porque os emissores são cinco (Telegram, webhook do TradingView,
 * publicações do admin, mensagens de membros, desfechos do motor) e antes cada um decidia à sua
 * maneira: havia dois nomes para o mesmo parâmetro e um canal ligado ao T2T mandava até os
 * "TP1 hit" para o separador de aceitação.
 */

/** Chat do canal, na mensagem quando a conhecemos (o `&msg=` salta e realça a bolha). */
export function urlDoChat(channelSlug: string, messageId?: string | null): string {
  return (
    `/app-mobile?tab=chat&channel=${encodeURIComponent(channelSlug)}` +
    (messageId ? `&msg=${encodeURIComponent(messageId)}` : '')
  )
}

/** Separador Tap to Trade, já no sinal — o sítio onde se aceita. */
export function urlDoTapToTrade(messageId: string): string {
  return `/app-mobile?tab=tap-to-trade&signal=${encodeURIComponent(messageId)}`
}

/**
 * O destino de uma mensagem de canal.
 *
 * `t2tLigado` é o admin a dizer que aquela fonte está activa no Tap to Trade; sem isso, nem uma
 * entrada tem onde ser aceite e a notificação vai para o chat como qualquer outra.
 *
 * A `category` é a que dá a acção "⚡ Aceitar trade" na notificação do iPhone e do Apple Watch —
 * por isso só vai onde há mesmo o que aceitar.
 */
export function destinoDaMensagem(opts: {
  channelSlug: string
  content?: string | null
  messageId?: string | null
  t2tLigado?: boolean
}): { url: string; category?: 'T2T_SIGNAL'; paraAceitar: boolean } {
  const paraAceitar =
    Boolean(opts.messageId) &&
    Boolean(opts.t2tLigado) &&
    isT2TEntrySignal(opts.channelSlug, opts.content ?? null)
  return paraAceitar
    ? { url: urlDoTapToTrade(opts.messageId as string), category: 'T2T_SIGNAL', paraAceitar: true }
    : { url: urlDoChat(opts.channelSlug, opts.messageId), paraAceitar: false }
}
