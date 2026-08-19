/**
 * VOCABULÁRIO ÚNICO do ciclo de vida de um sinal — módulo PURO, partilhado por todos os
 * destinos: chat das apps, Telegram, alertas, notificações push e Tap to Trade.
 *
 * O problema que resolve: cada motor escrevia as suas próprias mensagens ("🏁 Posição fechada"
 * no t2t-price-monitor, "🏁 Posição FECHADA pela fonte" no t2t-lifecycle, "Trade fechada" no
 * notify-outcome). O mesmo acontecimento chegava ao cliente com três textos diferentes conforme
 * o caminho que o disparou — e os estados que só existiam nos alertas (descartado) nunca
 * chegavam ao chat nem fechavam ordens.
 *
 * Aqui vive UMA definição por acontecimento: emoji, título, corpo e o que implica para as
 * ordens do cliente. Quem quiser publicar um evento usa `lifecycleMessage()`; quem quiser saber
 * se tem de mexer nas ordens usa `closesPosition()` / `cancelsPending()`.
 *
 * Nenhuma destas mensagens pode parecer uma ENTRADA: `isT2TEntrySignal` exige direção + preço +
 * alvo, e os textos daqui não trazem alvo — por isso não geram botão de Tap to Trade.
 */

export type SignalEvent =
  /** A ordem encheu — a posição existe. */
  | 'entry_hit'
  /** Parcial realizada num alvo. */
  | 'partial'
  /** Stop movido para a entrada (+buffer). */
  | 'break_even'
  /** Trailing ligado. */
  | 'trailing'
  /** Alvo final — posição encerrada com lucro. */
  | 'target_final'
  /** Stop loss. */
  | 'stop_loss'
  /** Fechada (motivo genérico: manual, motor, desaparecida da corretora). */
  | 'closed'
  /** A fonte cancelou o sinal antes de ativar. */
  | 'cancelled'
  /** Ideia descartada: já não é válida e nunca chegou a abrir. */
  | 'discarded'
  /** Todos os alvos foram atingidos antes de a entrada encher. */
  | 'targets_before_entry'

export interface LifecycleContext {
  symbol: string
  direction?: 'buy' | 'sell' | null
  /** Etiqueta da fonte (Premium, Sensei, GoldKiller, Aurum Flow…). */
  source?: string | null
  /** Nível do alvo, para parciais. */
  level?: number | null
  /** Percentagem realizada, para parciais. */
  pct?: number | null
  /** Preço relevante (entrada, fecho…). */
  price?: number | null
  /** Motivo em texto livre, acrescentado ao corpo quando existe. */
  reason?: string | null
}

interface EventDef {
  emoji: string
  /** Título curto — usado no push e como 1ª linha da mensagem de chat. */
  title: (c: LifecycleContext) => string
  /** Corpo — 2ª linha. */
  body: (c: LifecycleContext) => string | null
  /** O evento encerra a posição do cliente? */
  closes: boolean
  /** O evento torna inútil uma ordem pendente? */
  cancelsPending: boolean
  /** Estado a gravar em mtmcopy_signal_log. */
  logStatus: string
}

function dirTxt(d?: 'buy' | 'sell' | null): string {
  return d === 'buy' ? '🔵 COMPRA' : d === 'sell' ? '🔴 VENDA' : ''
}

/** "XAUUSD 🔴 VENDA" — cabeçalho comum a todos os eventos. */
export function headline(c: LifecycleContext): string {
  return `${c.symbol} ${dirTxt(c.direction)}`.trim()
}

const EVENTS: Record<SignalEvent, EventDef> = {
  entry_hit: {
    emoji: '✅',
    title: (c) => `ENTRY HIT · ${headline(c)}`,
    body: (c) =>
      [c.price ? `Posição aberta @ ${c.price}` : 'Posição aberta', 'Gestão automática por preço: parciais, break-even e trailing.']
        .filter(Boolean)
        .join(' · '),
    closes: false,
    cancelsPending: false,
    logStatus: 'open',
  },
  partial: {
    emoji: '🎯',
    title: (c) => `Alvo ${c.level ?? 1} · ${headline(c)}`,
    body: (c) => `Realizado ${c.pct ?? 0}%. O resto corre com o stop protegido.`,
    closes: false,
    cancelsPending: false,
    logStatus: 'open',
  },
  break_even: {
    emoji: '🔒',
    title: (c) => `Break-even · ${headline(c)}`,
    body: () => 'Stop movido para a entrada. O risco desta trade está neutralizado.',
    closes: false,
    cancelsPending: false,
    logStatus: 'open',
  },
  trailing: {
    emoji: '📈',
    title: (c) => `Trailing ativo · ${headline(c)}`,
    body: () => 'O stop acompanha o preço a partir daqui.',
    closes: false,
    cancelsPending: false,
    logStatus: 'open',
  },
  target_final: {
    emoji: '🏁',
    title: (c) => `Alvo final · ${headline(c)}`,
    body: () => 'Posição encerrada.',
    closes: true,
    cancelsPending: true,
    logStatus: 'closed',
  },
  stop_loss: {
    emoji: '🛑',
    title: (c) => `Stop loss · ${headline(c)}`,
    body: () => 'A trade fechou no stop.',
    closes: true,
    cancelsPending: true,
    logStatus: 'closed',
  },
  closed: {
    emoji: '🏁',
    title: (c) => `Posição fechada · ${headline(c)}`,
    body: (c) => c.reason ?? null,
    closes: true,
    cancelsPending: true,
    logStatus: 'closed',
  },
  cancelled: {
    emoji: '❌',
    title: (c) => `Sinal cancelado · ${headline(c)}`,
    body: (c) => `${c.source ? `${c.source}: ` : ''}o sinal foi cancelado pela fonte. As ordens deste sinal foram tratadas.`,
    closes: true,
    cancelsPending: true,
    logStatus: 'cancelled',
  },
  discarded: {
    emoji: '🗑️',
    title: (c) => `Ideia descartada · ${headline(c)}`,
    body: (c) =>
      c.reason ??
      'A ideia deixou de ser válida antes de a entrada encher. Ordens pendentes deste sinal foram apagadas.',
    closes: true,
    cancelsPending: true,
    logStatus: 'discarded',
  },
  targets_before_entry: {
    emoji: '🗑️',
    title: (c) => `Ideia descartada · ${headline(c)}`,
    body: () =>
      'Os alvos foram atingidos antes de a entrada encher — já não há movimento para aproveitar. Ordens pendentes deste sinal foram apagadas.',
    closes: true,
    cancelsPending: true,
    logStatus: 'discarded',
  },
}

/** Mensagem canónica de um evento — a MESMA em chat, Telegram e push. */
export function lifecycleMessage(event: SignalEvent, c: LifecycleContext): { title: string; text: string } {
  const def = EVENTS[event]
  const title = `${def.emoji} ${def.title(c)}`
  const body = def.body(c)
  return { title, text: body ? `${title}\n${body}` : title }
}

export function closesPosition(event: SignalEvent): boolean {
  return EVENTS[event].closes
}

export function cancelsPending(event: SignalEvent): boolean {
  return EVENTS[event].cancelsPending
}

export function logStatusFor(event: SignalEvent): string {
  return EVENTS[event].logStatus
}

/** Eventos que terminam o sinal — usados para fechar T2T e limpar estado. */
export const TERMINAL_EVENTS: SignalEvent[] = [
  'target_final',
  'stop_loss',
  'closed',
  'cancelled',
  'discarded',
  'targets_before_entry',
]

export function isTerminal(event: SignalEvent): boolean {
  return TERMINAL_EVENTS.includes(event)
}
