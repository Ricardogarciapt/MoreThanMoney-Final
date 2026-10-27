/**
 * O QUE DE UM GRUPO DE TELEGRAM PASSA PARA O CHAT DA APP.
 *
 * O FOREX swings passou a ser o grupo de entrada livre (27/10/2026, decisão do dono): lá o bot
 * também faz conversa e conversão para os packs. Essas mensagens não são sinais e não podem ir
 * parar ao chat da app — lá ficam só os sinais, os seguimentos deles e os charts.
 *
 * Módulo puro, para os testes.
 */

/** Canais da app que só recebem sinais e seguimentos do grupo de origem. */
export const CANAIS_SO_SINAIS = ['ideias-e-sinais'] as const

export function canalSoSinais(slug: string | null | undefined): boolean {
  return (CANAIS_SO_SINAIS as readonly string[]).includes(String(slug ?? ''))
}

const PAR = /\b(?:[A-Z]{6}|XAU\s?USD|XAG\s?USD|GOLD|BTC\s?USDT?|US30|NAS100|US100|GER40|SPX500)\b/
const DIRECAO = /\b(?:BUY|SELL|COMPRA|VENDA|LONG|SHORT)\b/i
const NIVEIS = /\b(?:SL|TP\d?|STOP\s*LOSS|TAKE\s*PROFIT|STOPLOSS|TAKEPROFIT)\b/i
const SEGUIMENTO =
  /\b(?:ENTRY\s*HIT|HIT\s*TP\d?|TP\s?\d\s*(?:HIT|ATINGIDO)|SL\s*HIT|BREAK[\s-]?EVEN|\bBE\b|POSI[CÇ][AÃ]O\s+(?:ABERTA|FECHADA)|FECHAD[OA]|STOP\s*LOSS\s+(?:ATINGIDO|HIT)|IDEIA\s+DESCARTADA|CANCELAD[OA])/i

/**
 * Passa para a app?
 *   • um sinal: par + direção + níveis (SL/TP);
 *   • um seguimento: resposta a uma mensagem que JÁ está no chat (o chart do sinal vem assim), ou
 *     um texto com as palavras dos seguimentos e um par.
 * Tudo o resto (conversa, conversão, boas-vindas, fixadas, stickers) fica no Telegram.
 */
export function passaParaAApp(
  conteudo: string | null | undefined,
  opcoes: { respondeAMensagemDoChat?: boolean } = {},
): boolean {
  if (opcoes.respondeAMensagemDoChat) return true
  const t = String(conteudo ?? '')
  if (!t.trim()) return false
  const temPar = PAR.test(t.toUpperCase())
  if (temPar && DIRECAO.test(t) && NIVEIS.test(t)) return true
  if (temPar && SEGUIMENTO.test(t)) return true
  return false
}
