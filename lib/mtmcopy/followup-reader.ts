/**
 * LEITOR ÚNICO de follow-ups — traduz uma mensagem de acompanhamento (venha do Telegram, de um
 * relay ou de um webhook) num evento do ciclo de vida, e age sobre as ordens T2T de quem aceitou.
 *
 * Antes, cada fonte tinha o seu caminho: o Premium lia as mensagens de gestão, o Sensei vinha pelo
 * webhook, o PrimeVerse pelo relay — e o Aurum Flow e as Ideias de Forex não tinham caminho nenhum,
 * pelo que quem aceitasse esses sinais ficava com ordens órfãs. Este módulo é o caminho comum:
 * qualquer fonte T2T passa por aqui e o cliente recebe sempre o mesmo texto e o mesmo tratamento.
 *
 * Só age em eventos TERMINAIS (fecho, cancelamento, descarte, stop). Parciais e break-even são
 * geridos pelo motor de preço na conta de cada seguidor — não se espelham por mensagem.
 */
import { isTerminal, type SignalEvent } from './signal-lifecycle'
import { t2tSourceKey, type T2TSourceKey } from './t2t-source'

/** Etiqueta legível de cada fonte, para o texto que sai ao cliente. */
export const SOURCE_LABEL: Record<T2TSourceKey, string> = {
  premium: 'Premium',
  sensei: 'Sensei',
  goldkiller: 'GoldKiller',
  mtmscanner: 'MTM Scanner',
  forexideas: 'Ideias de Forex',
  james: 'Forex Swings',
  primeverse: 'PrimeVerse',
  aurum: 'Aurum Flow',
}

/**
 * Traduz o texto de um follow-up no evento correspondente.
 * A ordem importa: o descarte e os alvos-antes-da-entrada são casos particulares que têm de ser
 * testados ANTES do fecho genérico, senão "ideia descartada" seria lido como um fecho normal.
 */
export function detectLifecycleEvent(content: string | null | undefined): SignalEvent | null {
  const c = (content ?? '').toLowerCase()
  if (!c.trim()) return null

  // Alvos atingidos antes de a entrada encher.
  // "…antes da entrada" / "…antes de abrir" / "…sem a entrada encher" — o artigo contraído
  // ("da"/"do") tem de ser aceite, senão a forma mais natural em português não casa.
  if (/(todos\s+os\s+)?(tp|alvos?)\s*(\d\s*)?(j[áa]\s*)?(atingid|hit|batid)\w*\s+(antes|sem)\s*(d[aeo]s?\s*)?(a\s*)?(entrada|abrir|abertura|entrar|encher)/i.test(c))
    return 'targets_before_entry'
  if (/all\s+tps?\s+hit\s+before\s+(opening|entry)/i.test(c)) return 'targets_before_entry'

  // Ideia descartada / invalidada / expirada.
  if (/(ideia|sinal|setup)\s+(descartad|invalidad|expirad|anulad)/i.test(c)) return 'discarded'
  if (/\b(descartad|invalidad)\w*\b/i.test(c)) return 'discarded'

  // Cancelamento antes de ativar.
  if (/\bcancelad\w*\b|\bcancell?ed\b|\bcancel\b/i.test(c)) return 'cancelled'

  // Stop loss.
  if (/\bsl\s*(hit|atingid)|stop\s*loss\s*(hit|atingid)|\bstopad\w*\b/i.test(c)) return 'stop_loss'

  // Fecho genérico.
  if (/posi[çc][ãa]o\s*fechada|trade\s*fechad|encerrad\w*|close\s*all|closed\s*(manually)?/i.test(c))
    return 'closed'

  return null
}

/** Extrai o símbolo do texto (primeiro par/ticker reconhecível). */
export function symbolFromContent(content: string | null | undefined): string | null {
  const c = (content ?? '').toUpperCase()
  const m =
    c.match(/\b(XAUUSD|XAGUSD|BTCUSDT?|ETHUSDT?|NAS100|US30|US500|GER40|UK100|JP225)\b/) ??
    c.match(/\b([A-Z]{3}\/?[A-Z]{3})\b/)
  if (!m) return null
  return m[1].replace('/', '')
}

/** Direção do texto, quando declarada. */
export function directionFromContent(content: string | null | undefined): 'buy' | 'sell' | null {
  const c = content ?? ''
  if (/\b(sell|short|venda)\b|🔴/i.test(c)) return 'sell'
  if (/\b(buy|long|compra)\b|🔵|🟢/i.test(c)) return 'buy'
  return null
}

export interface FollowupResult {
  handled: boolean
  event?: SignalEvent
  source?: T2TSourceKey
  followers?: number
  cancelled?: number
  closed?: number
  reason?: string
}

/**
 * Lê um follow-up de QUALQUER canal T2T e, se for terminal, espelha-o nas ordens dos seguidores.
 * Não faz nada (e não é erro) quando a mensagem não é um follow-up terminal.
 */
export async function handleSourceFollowup(opts: {
  channelSlug: string
  content: string
  /** Símbolo, se já conhecido pelo chamador (evita depender do texto). */
  symbol?: string | null
  direction?: 'buy' | 'sell' | null
  /** Fonte, se já conhecida (senão é deduzida do canal + conteúdo). */
  source?: T2TSourceKey | null
}): Promise<FollowupResult> {
  const event = detectLifecycleEvent(opts.content)
  if (!event || !isTerminal(event)) return { handled: false }

  const source = opts.source ?? t2tSourceKey(opts.channelSlug, opts.content)
  if (!source) return { handled: false, reason: 'fonte não é T2T' }

  const symbol = opts.symbol ?? symbolFromContent(opts.content)
  if (!symbol) return { handled: false, event, source, reason: 'sem símbolo' }

  const direction = opts.direction ?? directionFromContent(opts.content)

  const { closeT2TFollowersForSignal } = await import('./t2t-lifecycle')
  const kind =
    event === 'cancelled' ? 'cancel'
      : event === 'discarded' ? 'discard'
        : event === 'targets_before_entry' ? 'targets_hit'
          : 'close'
  const r = await closeT2TFollowersForSignal({
    kind,
    chatSlug: opts.channelSlug,
    symbol,
    direction,
    label: SOURCE_LABEL[source],
  })
  return { handled: true, event, source, followers: r.followers, cancelled: r.cancelled, closed: r.closed }
}
