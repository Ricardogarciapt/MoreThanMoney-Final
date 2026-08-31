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

import { outcomeFrom } from './trade-outcome'

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
  /** O trader corrigiu o setup e republicou-o: o anterior do mesmo par ficou a mais. */
  | 'superseded'

export interface LifecycleContext {
  symbol: string
  direction?: 'buy' | 'sell' | null
  /** Etiqueta da fonte (Premium, Sensei, GoldKiller, Aurum Flow…). */
  source?: string | null
  /** Nível do alvo, para parciais. */
  level?: number | null
  /** Percentagem realizada, para parciais. */
  pct?: number | null
  /** Preço relevante (fecho, alvo atingido, preço atual…). */
  price?: number | null
  /**
   * Preço de ENTRADA da posição. Com `price` preenchido, o cabeçalho passa a trazer o desfecho
   * em pips e percentagem — é isso que faz "XAUUSD 🔵 COMPRA" virar
   * "XAUUSD 🔵 COMPRA · +200 pips · +0,46%" em todos os destinos ao mesmo tempo.
   */
  entry?: number | null
  /** Motivo em texto livre, acrescentado ao corpo quando existe. */
  reason?: string | null
  /**
   * O STOP DO SINAL, como o autor o escreveu. Serve só para reconhecer um sinal impossível —
   * stop do lado errado da entrada — e calar o desfecho nesse caso. Não é o stop atual da
   * posição, que se move com o break-even e o trailing.
   */
  slOriginal?: number | null
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

/** Desfecho em pips e % — "" quando faltam preços, porque zero não é o mesmo que não saber. */
export function outcomeOf(c: LifecycleContext): string {
  return outcomeFrom({ symbol: c.symbol, direction: c.direction, entry: c.entry, exit: c.price })
}

/**
 * Um stop com o preço do lado errado não pode dar lucro. Se der, o número está errado — e cala-se.
 *
 * A 31/08 saiu no chat «🛑 Stop loss · XAUUSD 🔵 COMPRA · +950 pips · +2,14%». A aritmética
 * estava certa para o que recebeu (entrada 4437, "stop" 4532 — 95 pontos ACIMA numa compra); o
 * que estava errado era o sinal de origem, que trazia o stop do lado do lucro.
 *
 * ── Porque é que NÃO chega olhar para o sinal do resultado ────────────────────────────────────
 * A primeira versão disto calava qualquer stop com desfecho positivo, e isso estava errado: um
 * stop que subiu com o break-even e o trailing pode ser tocado ACIMA da entrada, e aí o lucro é
 * verdadeiro. Já aconteceu — «Stop loss · XAUUSD 🔵 COMPRA · +2,2 pips» no Sensei Scanner é um
 * trailing a fechar em ganho, e calar esse número seria esconder o que a proteção fez.
 *
 * O que distingue os dois casos não é o resultado, é a GEOMETRIA DO SINAL: o stop que o autor
 * escreveu estava do lado errado da entrada, ou não. Por isso o corte precisa do `slOriginal`.
 * Sem ele não se cala nada — a origem já é recusada no `signal-tracker` e no validador, e o
 * prejuízo de esconder um lucro real é maior do que o de deixar passar um caso que as trancas
 * de montante já apanham.
 */
function desfechoCoerente(evento: SignalEvent, texto: string, c: LifecycleContext): string {
  if (evento !== 'stop_loss') return texto
  const sl = Number(c.slOriginal)
  const entrada = Number(c.entry)
  if (!Number.isFinite(sl) || !Number.isFinite(entrada) || !(sl > 0) || !(entrada > 0)) return texto
  const doLadoErrado =
    (c.direction === 'buy' && sl > entrada) || (c.direction === 'sell' && sl < entrada)
  return doLadoErrado ? '' : texto
}

/**
 * "XAUUSD 🔴 VENDA · +200 pips · +0,46%" — cabeçalho comum a todos os eventos.
 * O desfecho só aparece quando há entrada e preço; sem eles fica só o par e a direção.
 */
export function headline(c: LifecycleContext, evento?: SignalEvent): string {
  const base = `${c.symbol} ${dirTxt(c.direction)}`.trim()
  const o = evento ? desfechoCoerente(evento, outcomeOf(c), c) : outcomeOf(c)
  return o ? `${base} · ${o}` : base
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
    body: (c) =>
      [
        c.pct != null ? `Realizado ${c.pct}%. O resto corre com o stop protegido.` : 'Parcial realizada. O resto corre com o stop protegido.',
        c.reason,
      ].filter(Boolean).join(' '),
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
    body: (c) => ['Posição encerrada.', c.reason].filter(Boolean).join(' '),
    closes: true,
    cancelsPending: true,
    logStatus: 'closed',
  },
  stop_loss: {
    emoji: '🛑',
    title: (c) => `Stop loss · ${headline(c, 'stop_loss')}`,
    body: (c) => ['A trade fechou no stop.', c.reason].filter(Boolean).join(' '),
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
  superseded: {
    emoji: '♻️',
    title: (c) => `Setup atualizado · ${headline(c)}`,
    body: (c) =>
      `${c.source ? `${c.source}: ` : ''}a fonte publicou uma versão corrigida deste setup. ` +
      'As ordens pendentes da versão anterior foram apagadas; posições já abertas mantêm-se.',
    closes: false,
    cancelsPending: true,
    logStatus: 'cancelled',
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

/**
 * A mensagem é um ANÚNCIO NOSSO do ciclo de vida (título canónico "<emoji> <Rótulo> · PAR")?
 * Usado para NÃO reinterpretar os nossos próprios anúncios como follow-ups da fonte quando
 * eles ecoam de volta (ex.: push → Telegram → webhook → leitor de follow-ups). Sem esta guarda,
 * "🗑️ Ideia descartada · XAUUSD" reentrava no pipeline e gerava um LOOP de notificações.
 */
const OWN_TITLE_RE =
  /^(ENTRY HIT|Alvo\s+(?:final|\d+)|Break-even|Trailing ativo|Stop loss|Posi[çc][ãa]o fechada|Sinal cancelado|Ideia descartada)\s*·/i

export function isOwnLifecycleAnnouncement(content: string | null | undefined): boolean {
  const firstLine = (content ?? '').trim().split('\n')[0] ?? ''
  // remove emoji/pontuação inicial antes de comparar com os rótulos canónicos
  const stripped = firstLine.replace(/^[^\p{L}]+/u, '')
  return OWN_TITLE_RE.test(stripped)
}
