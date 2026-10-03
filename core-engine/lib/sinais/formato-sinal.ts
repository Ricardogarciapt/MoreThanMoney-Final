/**
 * FORMATO ÚNICO DE SINAL — um sítio só no servidor para escrever (e ler) as entradas de todos os
 * chats de ideias/sinais: Premium, Sensei, GoldKiller, Forex Swings, Índices, MTM Scanner,
 * MTM Auto Edge e Ideias de Cripto (Aurum Flow ORB).
 *
 * Módulo PURO (sem imports de servidor): serve os escritores (webhooks, relays, motores), os
 * leitores (parseSignal, T2T, tracker, motor das mestres), o cliente (app-mobile) e os testes.
 *
 * ── O formato ─────────────────────────────────────────────────────────────────────────────────
 *
 *     🔵 XAUUSD · COMPRA
 *     📌 MTM Auto Edge · Novo sinal
 *     🎯 Entrada: 4385                  (ou «🎯 Entrada: Mercado», ou «🎯 Zona: 4388 – 4395»)
 *     🛑 SL: 4375
 *     ✅ TP1: 4388
 *     ✅ TP2: 4391
 *     ⏱ M15 · 18/09 18:10
 *     (linhas livres: «🔎 Validação: 100%», notas do trader…)
 *     ⚠️ Não é aconselhamento financeiro.
 *
 * Porque é assim:
 *   • linha 1 = ACTIVO e DIRECÇÃO, com o emoji — é a linha que os leitores antigos já procuravam
 *     primeiro («a linha com a direcção tem o símbolo»), por isso nada parte;
 *   • linha 2 = ESTRATÉGIA (a etiqueta que o cliente reconhece no MTM Auto) e o ESTADO
 *     («Novo sinal», «Nova ideia #N», «Entrada activada #N ✅»); nunca o nome de uma fonte externa;
 *   • preços com ponto decimal e sem separador de milhares — legíveis e parseáveis;
 *   • a hora é a de Lisboa (a dos clientes).
 *
 * Os SEGUIMENTOS (TP, SL, BE, fecho, cancelamento) continuam a sair de `lifecycleMessage`
 * (lib/mtmcopy/signal-lifecycle.ts) — já é o vocabulário único dos eventos — e publicam-se SEMPRE
 * como RESPOSTA (reply_to_id) à mensagem do sinal. `formatarSeguimento` só lhes junta a etiqueta
 * da estratégia numa linha de rodapé, para quem lê fora da thread.
 */

export type Direcao = 'buy' | 'sell'

export interface SinalEntrada {
  /** Etiqueta da estratégia, ex.: «MTM Auto Edge». */
  estrategia: string
  simbolo: string
  direcao: Direcao
  /** Preço de entrada; null = a mercado. Ignorado quando há `zona`. */
  entrada?: number | null
  /** Zona de entrada NA ORDEM EM QUE O TRADER A ESCREVEU (o 1.º valor é o 1.º a ser tocado). */
  zona?: [number, number] | null
  sl?: number | null
  tps?: number[]
  /** Há um alvo final «deixar correr» (Premium «TP4: Hold»). */
  alvoAberto?: boolean
  timeframe?: string | null
  /** Hora do sinal (default: agora). */
  quando?: Date | string | number | null
  /** Estado na linha da estratégia. Default «Novo sinal». */
  estado?: string | null
  /** Linhas livres antes do aviso (validação, notas do trader…). */
  extras?: string[]
  /** Acrescenta o «⚠️ Não é aconselhamento financeiro.» (default true). */
  aviso?: boolean
}

export const AVISO = '⚠️ Não é aconselhamento financeiro.'
export const MARCA_ESTRATEGIA = '📌'

/** Número → texto sem notação científica nem zeros a mais (1.87985, 4385, 0.9411). */
export function precoTexto(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  const s = Number(n.toPrecision(12)).toString()
  return s.includes('e') ? n.toFixed(8).replace(/\.?0+$/, '') : s
}

/** «15» → «M15», «60» → «H1», «240» → «H4», «D» → «D1». Texto livre fica como está. */
export function timeframeTexto(tf?: string | null): string | null {
  const t = String(tf ?? '').trim()
  if (!t) return null
  const u = t.toUpperCase()
  if (/^\d+$/.test(u)) {
    const m = Number(u)
    if (m > 0 && m % 1440 === 0) return `D${m / 1440}`
    if (m >= 60 && m % 60 === 0) return `H${m / 60}`
    return `M${m}`
  }
  if (/^\d+[MHDW]$/.test(u)) {
    const v = u.slice(0, -1)
    const k = u.slice(-1)
    return k === 'M' ? `M${v}` : k === 'H' ? `H${v}` : k === 'D' ? `D${v}` : `W${v}`
  }
  if (u === 'D' || u === '1D') return 'D1'
  if (u === 'W' || u === '1W') return 'W1'
  return t
}

/** «18/09 18:10» em Europe/Lisbon. */
export function horaTexto(quando?: Date | string | number | null): string {
  const d = quando == null ? new Date() : new Date(quando)
  const valida = Number.isFinite(d.getTime()) ? d : new Date()
  const partes = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(valida)
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '00'
  return `${p('day')}/${p('month')} ${p('hour')}:${p('minute')}`
}

function simboloLimpo(s: string): string {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, '')
}

/** A mensagem de ENTRADA no formato único. */
export function formatarSinal(s: SinalEntrada): string {
  const dirEmoji = s.direcao === 'buy' ? '🔵' : '🔴'
  const dirTexto = s.direcao === 'buy' ? 'COMPRA' : 'VENDA'
  const linhas: string[] = [
    `${dirEmoji} ${simboloLimpo(s.simbolo)} · ${dirTexto}`,
    `${MARCA_ESTRATEGIA} ${s.estrategia.trim()} · ${(s.estado ?? '').trim() || 'Novo sinal'}`,
  ]
  const zona = s.zona && s.zona.every((v) => Number.isFinite(v) && v > 0) ? s.zona : null
  if (zona && zona[0] !== zona[1]) {
    linhas.push(`🎯 Zona: ${precoTexto(zona[0])} – ${precoTexto(zona[1])}`)
  } else {
    const e = zona ? zona[0] : s.entrada
    linhas.push(`🎯 Entrada: ${e != null && Number.isFinite(e) && e > 0 ? precoTexto(e) : 'Mercado'}`)
  }
  if (s.sl != null && Number.isFinite(s.sl) && s.sl > 0) linhas.push(`🛑 SL: ${precoTexto(s.sl)}`)
  const tps = (s.tps ?? []).filter((t) => Number.isFinite(t) && t > 0)
  tps.forEach((t, i) => linhas.push(`✅ TP${i + 1}: ${precoTexto(t)}`))
  if (s.alvoAberto) linhas.push(`✅ TP${tps.length + 1}: deixar correr`)
  const tf = timeframeTexto(s.timeframe)
  linhas.push(`⏱ ${tf ? `${tf} · ` : ''}${horaTexto(s.quando)}`)
  for (const x of s.extras ?? []) {
    const t = String(x ?? '').trim()
    if (t) linhas.push(t)
  }
  if (s.aviso !== false) linhas.push(AVISO)
  return linhas.join('\n')
}

// ── Leitura ─────────────────────────────────────────────────────────────────────────────────

export interface SinalLido {
  estrategia: string
  estado: string
  simbolo: string
  direcao: Direcao
  /** Entrada efectiva: a ponta mais vantajosa da zona (compra = baixo, venda = alto), ou o preço. */
  entrada: number | null
  zona: [number, number] | null
  /** 1.º valor da zona tal como foi escrito. */
  zonaPrimeiro: number | null
  mercado: boolean
  sl: number | null
  tps: number[]
  alvoAberto: boolean
  timeframe: string | null
  /** Número da ideia («#20223») quando o estado o traz. */
  ideia: number | null
}

const L1 = /^\s*(🔵|🔴)\s+([A-Z0-9][A-Z0-9._/-]{1,19})\s+·\s+(COMPRA|VENDA)\s*$/u
const L2 = /^\s*📌\s+(.+?)\s+·\s+(.+?)\s*$/u
const NUM = String.raw`(\d+(?:\.\d+)?)`

function num(v: string | undefined): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A mensagem está no formato único? (só olha para as duas primeiras linhas) */
export function ehFormatoUnico(texto?: string | null): boolean {
  const ls = String(texto ?? '').trim().split(/\r?\n/)
  return ls.length >= 2 && L1.test(ls[0]!) && L2.test(ls[1]!)
}

/** Lê uma ENTRADA no formato único. `null` se não for (os leitores antigos tratam do resto). */
export function lerSinal(texto?: string | null): SinalLido | null {
  const t = String(texto ?? '').trim()
  if (!t) return null
  const ls = t.split(/\r?\n/)
  const m1 = ls[0]!.match(L1)
  const m2 = ls[1]?.match(L2)
  if (!m1 || !m2) return null
  const direcao: Direcao = m1[3] === 'COMPRA' ? 'buy' : 'sell'

  let zona: [number, number] | null = null
  let entrada: number | null = null
  let mercado = false
  let sl: number | null = null
  const tps: { n: number; v: number }[] = []
  let alvoAberto = false
  let timeframe: string | null = null

  for (const linha of ls.slice(2)) {
    const l = linha.trim()
    let m: RegExpMatchArray | null
    if ((m = l.match(new RegExp(String.raw`^🎯\s*Zona:\s*${NUM}\s*[–-]\s*${NUM}\s*$`, 'u')))) {
      const a = num(m[1])
      const b = num(m[2])
      if (a != null && b != null) zona = [a, b]
    } else if ((m = l.match(new RegExp(String.raw`^🎯\s*Entrada:\s*${NUM}\s*$`, 'u')))) {
      entrada = num(m[1])
    } else if (/^🎯\s*Entrada:\s*Mercado\s*$/iu.test(l)) {
      mercado = true
    } else if ((m = l.match(new RegExp(String.raw`^🛑\s*SL:\s*${NUM}\s*$`, 'u')))) {
      sl = num(m[1])
    } else if ((m = l.match(new RegExp(String.raw`^✅\s*TP(\d{1,2}):\s*${NUM}\s*$`, 'u')))) {
      const v = num(m[2])
      if (v != null) tps.push({ n: Number(m[1]), v })
    } else if (/^✅\s*TP\d{1,2}:\s*deixar correr\s*$/iu.test(l)) {
      alvoAberto = true
    } else if ((m = l.match(/^⏱\s*(?:([A-Z]\d{1,4}|\S+?)\s+·\s+)?\d{2}\/\d{2}\s+\d{2}:\d{2}\s*$/u))) {
      timeframe = m[1] ?? null
    }
  }

  let efectiva = entrada
  let zonaOrdenada: [number, number] | null = null
  if (zona) {
    zonaOrdenada = [Math.min(zona[0], zona[1]), Math.max(zona[0], zona[1])]
    efectiva = direcao === 'buy' ? zonaOrdenada[0] : zonaOrdenada[1]
  }
  const ideia = m2[2].match(/#\s*(\d+)/)
  return {
    estrategia: m2[1]!.trim(),
    estado: m2[2]!.trim(),
    simbolo: m1[2]!,
    direcao,
    entrada: efectiva,
    zona: zonaOrdenada,
    zonaPrimeiro: zona ? zona[0] : null,
    mercado: mercado || (efectiva == null && !zona),
    sl,
    tps: tps.sort((a, b) => a.n - b.n).map((x) => x.v),
    alvoAberto,
    timeframe,
    ideia: ideia ? Number(ideia[1]) : null,
  }
}

/**
 * Etiqueta da estratégia de uma mensagem no formato único (linha 📌), ou null.
 * Os seguimentos levam-na no rodapé («📌 MTM Auto Edge»), por isso também se lê daí.
 */
export function estrategiaDaMensagem(texto?: string | null): string | null {
  const t = String(texto ?? '')
  const lido = lerSinal(t)
  if (lido) return lido.estrategia
  const m = t.match(/^\s*📌\s+(.+?)(?:\s+·\s+.*)?\s*$/mu)
  return m ? m[1]!.trim() : null
}

/**
 * Um SEGUIMENTO (TP, SL, BE, fecho…) no formato único: o texto canónico do evento
 * (`lifecycleMessage(...).text`) + a etiqueta da estratégia no rodapé. Publica-se como resposta
 * ao sinal (reply_to_id) — quem chama é que liga a thread.
 */
export function formatarSeguimento(textoDoEvento: string, estrategia?: string | null): string {
  const base = String(textoDoEvento ?? '').trim()
  const e = String(estrategia ?? '').trim()
  if (!e || base.includes(`${MARCA_ESTRATEGIA} ${e}`)) return base
  return `${base}\n${MARCA_ESTRATEGIA} ${e}`
}

// ── Estratégias Edge / King / Wolf (traders de uma fonte externa) ──────────────────────────────

/**
 * Trader da fonte → etiqueta da estratégia MTM Auto. Só estes três são publicados; o nome da fonte
 * NUNCA aparece nas mensagens (nem no remetente, nem no texto).
 * Aliases iguais aos de lib/mtmfunded/estrategias-sinais/calculo.ts.
 *
 * A Wolf e a King saíram de todas as listas VIVAS/visíveis (só a Edge continua a publicar), mas
 * este mapa NÃO se apaga: é preciso para ler o histórico de mensagens já publicadas com elas.
 */
const TRADER_ESTRATEGIA: Record<string, string> = {
  fxedge: 'MTM Auto Edge',
  fx_edge: 'MTM Auto Edge',
  'fx-edge': 'MTM Auto Edge',
  kingfkg: 'MTM Auto King',
  kingfkge: 'MTM Auto King',
  king_fkg: 'MTM Auto King',
  'king-fkg': 'MTM Auto King',
  g_wolf: 'MTM Auto Wolf',
  gwolf: 'MTM Auto Wolf',
  'g-wolf': 'MTM Auto Wolf',
  'g.wolf': 'MTM Auto Wolf',
}

export function estrategiaDoTrader(trader?: string | null): string | null {
  return TRADER_ESTRATEGIA[String(trader ?? '').trim().toLowerCase()] ?? null
}

/**
 * As estratégias que continuam VIVAS — hoje só a Edge (trader `fxedge`).
 *
 * Decisão do dono (29/09): dos três traders da fonte fica só o fxEdge. A `g_wolf` e a `kingfkg`
 * saem, e a execução delas já está fechada pelo interruptor `mtmauto_providers.ativo`.
 *
 * O mapa `TRADER_ESTRATEGIA` acima NÃO se apaga e continua a conhecer os três: há centenas de
 * mensagens publicadas com «MTM Auto King» e «MTM Auto Wolf», e é por ele que o chat, as threads
 * de seguimento e os desfechos as continuam a LER. Apagar o mapa não removia as mensagens —
 * tornava-as ilegíveis. Quem quer saber se ainda se PUBLICA é que usa a função de baixo.
 */
export const ESTRATEGIAS_VIVAS = new Set(['MTM Auto Edge'])

/** Etiqueta da estratégia só se ela ainda for publicada; null para as reformadas (King/Wolf). */
export function estrategiaVivaDoTrader(trader?: string | null): string | null {
  const e = estrategiaDoTrader(trader)
  return e && ESTRATEGIAS_VIVAS.has(e) ? e : null
}

/** Etiqueta «MTM Auto Edge|King|Wolf» → chave do trader (para quem precisa da fonte interna). */
export function traderDaEstrategia(estrategia?: string | null): string | null {
  const e = String(estrategia ?? '').trim().toLowerCase()
  if (e === 'mtm auto edge') return 'fxedge'
  if (e === 'mtm auto king') return 'kingfkg'
  if (e === 'mtm auto wolf') return 'g_wolf'
  return null
}

export const RE_ESTRATEGIAS_EKW = /MTM\s+Auto\s+(Edge|King|Wolf)\b/i
