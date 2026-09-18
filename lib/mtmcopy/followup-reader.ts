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
import { isTerminal, isOwnLifecycleAnnouncement, type SignalEvent } from './signal-lifecycle'
import { t2tSourceKey, type T2TSourceKey } from './t2t-source'
import { directionFromText } from './signal-direction'

/** Etiqueta legível de cada fonte, para o texto que sai ao cliente. */
export const SOURCE_LABEL: Record<T2TSourceKey, string> = {
  premium: 'Premium',
  sensei: 'Sensei',
  goldkiller: 'GoldKiller',
  mtmscanner: 'MTM Scanner',
  forexideas: 'Ideias de Forex',
  james: 'Forex Swings',
  // Chave interna antiga; o texto que sai ao cliente é o das estratégias.
  primeverse: 'MTM Auto Edge/King/Wolf',
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

  // "Updated" — o trader corrigiu o setup e publicou-o outra vez. A mensagem NOVA e a boa; a
  // anterior do mesmo par ficou a mais. Sem isto, ficavam as duas ordens pendentes vivas e o
  // cliente entrava duas vezes no mesmo movimento (aconteceu a 21/08: 4590-4585 as 13:39 e
  // 4586-4580 as 13:40, com "updated" as 13:46 — e o primeiro ficou por cancelar).
  if (/^\s*updated?\s*[!.👍]*\s*$/i.test(c)) return 'superseded'

  // Stop loss.
  if (/\bsl\s*(hit|atingid)|stop\s*loss\s*(hit|atingid)|\bstopad\w*\b/i.test(c)) return 'stop_loss'

  // Fecho genérico.
  if (/posi[çc][ãa]o\s*fechada|trade\s*fechad|encerrad\w*|close\s*all|closed\s*(manually)?/i.test(c))
    return 'closed'

  // ── Fontes com escrita livre (Gold Did, Aurum Flow) ────────────────────────────────────────────────────
  // O trader escreve como fala. Sem estas regras, "Tp2 hit" ou "SET BE" ficavam por
  // interpretar e o chat mostrava o texto cru, sem o cartão de gestão do nosso formato.

  // "Out after we secured TP1", "we're out", "close we break below", "you can be done".
  if (/\bwe(?:'re| are)?\s+out\b|\bi'?m\s+out\b|^\s*out\b|\bclose\s+(if|we|when|now)\b|you\s+can\s+be\s+done/i.test(c))
    return 'closed'

  // "SET BE", "set breakeven", "moved to BE".
  if (/\bset\s*be\b|\bbreak\s*even\b|\bbreakeven\b|\bmoved?\s+to\s+be\b/i.test(c)) return 'break_even'

  // "TP1 HIT" / "Tp3 hit" / "HIT TP2" — alvo atingido. O último alvo do sinal fecha a posição,
  // mas quem decide isso é o motor com os alvos do setup; aqui diz-se apenas que houve parcial.
  if (/\btp\s*\d\s*hit\b|\bhit\s*tp\s*\d\b|\btp\s*\d\s*✅/i.test(c)) return 'partial'

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

/** Direção do texto, quando declarada — leitura única, em `signal-direction`. */
export function directionFromContent(content: string | null | undefined): 'buy' | 'sell' | null {
  return directionFromText(content)
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
  // GUARDA ANTI-LOOP: um anúncio canónico NOSSO (motor de preço/alertas/lifecycle) que ecoa de
  // volta via Telegram não é um follow-up da fonte — reprocessá-lo gerava novo anúncio → loop.
  if (isOwnLifecycleAnnouncement(opts.content)) {
    return { handled: false, reason: 'anúncio próprio do ciclo de vida (eco)' }
  }
  const event = detectLifecycleEvent(opts.content)
  if (!event) return { handled: false }
  // 'superseded' nao e terminal para o sinal novo — e terminal para os ANTERIORES.
  if (event !== 'superseded' && !isTerminal(event)) return { handled: false }

  const source = opts.source ?? t2tSourceKey(opts.channelSlug, opts.content)
  if (!source) return { handled: false, reason: 'fonte não é T2T' }

  const symbol = opts.symbol ?? symbolFromContent(opts.content)
  if (!symbol) return { handled: false, event, source, reason: 'sem símbolo' }

  const direction = opts.direction ?? directionFromContent(opts.content)

  const { closeT2TFollowersForSignal } = await import('./t2t-lifecycle')
  // Substituicao: so as ORDENS PENDENTES do setup antigo sao apagadas. Uma posicao ja aberta
  // nao se fecha por causa de uma correcao de texto — fecha pelo SL/TP dela, ao preco dela.
  if (event === 'superseded') {
    const r = await closeT2TFollowersForSignal({
      kind: 'cancel',
      chatSlug: opts.channelSlug,
      symbol,
      direction,
      label: SOURCE_LABEL[source],
      pendingOnly: true,
    })
    return { handled: true, event, source, followers: r.followers, cancelled: r.cancelled, closed: r.closed }
  }
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
