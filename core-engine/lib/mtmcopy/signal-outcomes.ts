/**
 * DESFECHO dos sinais, gravado na base de dados.
 *
 * O problema: cada superfície calculava os pips por sua conta a partir do texto do follow-up —
 * o feed web, o tab T2T nativo, o chat nativo. Três implementações da mesma regra, com o risco
 * de darem números diferentes, e nada disto existia para quem lesse os dados pela API ou para
 * quem quisesse contar o desempenho do mês.
 *
 * Aqui a conta faz-se UMA vez e fica em `chat_messages.outcome` da mensagem de ENTRADA:
 *
 *   { pips, pct, unit, label, closed_at, closed_by, source }
 *
 * Regras (as mesmas em todo o lado, e é este ficheiro que manda):
 *  • Só follow-ups TERMINAIS encerram uma ideia. Um break-even ou um TP1 deixam-na a correr.
 *  • Os pips são os que a FONTE anunciou ("HIT TP3 ✅ +200PIPS") — é o número que o cliente viu
 *    no chat, e reescrevê-lo com a nossa conta só criaria discórdia.
 *  • A percentagem deriva desses pips com o tamanho de pip canónico e a entrada do setup.
 *  • Um fecho anuncia UM desfecho e pertence ao setup que estava vivo: o último publicado antes
 *    dele. As zonas anteriores (o Premium publica o mesmo setup em várias) fecham sem número —
 *    repetir "+163 pips" em cinco cartões faria parecer cinco ganhos onde houve um.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { pipSizeForSymbol, unitFor } from './trade-outcome'
import { gravarDesfechoUnico } from './desfecho-unico'
import { isT2TEntrySignal } from './t2t-source'
import { directionFromText } from './signal-direction'
/**
 * Um stop ou um alvo a mais de 15% da entrada não é um stop nem um alvo — é um número mal lido.
 * Nesse caso não se grava desfecho nenhum: "não sei" é melhor do que um número errado.
 */
function plausivel(entrada: number, outro: number): boolean {
  if (!(entrada > 0) || !(outro > 0)) return false
  return Math.abs(outro - entrada) / entrada <= 0.15
}

/** Canais de sinais — os únicos onde faz sentido procurar desfechos. */
export const CANAIS_DE_SINAIS = [
  'premium-ideas',
  'trade-ideas-setup',
  'trade-ideas',
  'sensei-scanner',
  'sinais-scanner-mtm',
  'sinais-goldkiller',
  'cripto-perps',
  'aurum-flow',
  'ideias-e-sinais',
  'sinais',
  'aurum-flow',
  // Alias do slug antigo da Aurum Flow — remover depois de 2026-10-14 (30 dias após 2026-09-14).
  'golden-moves',
] as const

/** Encerra mesmo a ideia (ao contrário de um BE ou de um TP1, que a deixam a correr). */
const TERMINAL_RE =
  /(posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad|descartad|invalidad|alvo\s+final|close\s+all|hit\s*tp\s*[3-9])/i
const PERDA_RE = /\bsl\s*hit|stop\s*loss\s*hit|❌/i
/** Fechou no stop — o preço de saída é o SL do próprio setup. */
const STOP_RE = /(stop\s*loss|sl\s*hit|🛑)/i
/** Fechou no último alvo — o preço de saída é o TP final do setup. */
const ALVO_FINAL_RE = /(alvo\s+final|hit\s+all\s+tp|todos\s+os\s+alvos)/i
/** Nunca chegou a render: cancelado ou descartado antes de haver posição. */
const SEM_TRADE_RE = /(cancelad|descartad|invalidad)/i
const PIPS_RE = /([+\-−]?\s*\d+(?:[.,]\d+)?)\s*pips?/i

export interface SignalOutcome {
  /** Null quando o sinal terminou sem render (cancelado/descartado) ou sem forma de saber. */
  pips: number | null
  pct: number | null
  unit: 'pips' | 'pontos'
  label: string
  kind: 'won' | 'lost' | 'cancelled'
  closed_at: string
  closed_by: string
  /**
   * De onde saiu o número:
   *  'announced' — a fonte disse-o ("HIT TP3 ✅ +200PIPS");
   *  'stop'      — fechou no stop, distância entrada→SL do próprio setup;
   *  'target'    — fechou no alvo final, distância entrada→último TP;
   *  'none'      — terminou sem número (cancelado, ou fecho sem preço nem pips).
   */
  source: 'announced' | 'stop' | 'target' | 'none'
}

interface Msg {
  id: string
  channel_slug: string
  content: string | null
  created_at: string
  outcome?: unknown
}

function simbolo(texto: string): string | null {
  const c = texto.toUpperCase()
  const m =
    c.match(/\b(XAUUSD|XAGUSD|NAS100|US30|US500|GER40|UK100|JP225|SPX500|BTCUSD|ETHUSD|SOLUSD|XRPUSD)\b/) ||
    c.match(/\b[A-Z]{3}(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD)\b/) ||
    c.match(/\bXAU\b|\bGOLD\b/)
  return m ? m[0] : null
}

/**
 * Direção do cartão ou do follow-up — agora lida por `signal-direction`.
 *
 * Era aqui um «testa BUY primeiro»: o rodapé com que o Gold Did assina os cartões Premium
 * («…key to long term success») casava com `\blong\b` e fazia passar por COMPRA todos os
 * «GOLD SELL SETUP». Como é por esta direção que os fechos se emparelham com as entradas, um
 * fecho de compra colava os seus pips a um setup de venda.
 */
function direcao(texto: string): 'buy' | 'sell' | null {
  return directionFromText(texto)
}

/**
 * Número escrito à portuguesa (1 234,56) ou à inglesa (1,234.56). O ponto/vírgula com três
 * dígitos a seguir é separador de milhares — tratá-lo como decimal transformava 4 591.79 em
 * 4,59 e punha o stop a 60% da entrada.
 */
function numero(s: string | undefined | null): number | null {
  if (!s) return null
  let t = s.replace(/[\s−+]/g, '')
  t = t.replace(/[.,](?=\d{3}\b)/g, '')   // separadores de milhares
  t = t.replace(',', '.')
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/**
 * Preços de um setup lidos DIRECTAMENTE do cartão. Não se usa aqui o parser geral de sinais:
 * ele serve para colocar ordens e é tolerante de mais para esta conta — nos cartões do Sensei
 * devolvia entradas de 12,93 onde estava 4591.79, e o desfecho saía "−85 901 pips".
 */
export function precosDoSetup(texto: string): { entry: number | null; sl: number | null; tps: number[] } {
  const N = '([0-9][0-9.,]*)'
  const entryM =
    texto.match(new RegExp(`(?:entrada\\s*activada|entrada\\s*ativada|ponto\\s*de\\s*entrada|entrada|entry)\\s*[:=]\\s*${N}`, 'i'))
  const zonaM = texto.match(new RegExp(`zone\\s*${N}\\s*[-–]\\s*${N}`, 'i'))
  const slM = texto.match(new RegExp(`(?:stop\\s*loss|\\bsl\\b)\\s*[:=]?\\s*${N}`, 'i'))
  const tps: number[] = []
  const tpRe = new RegExp(`(?:take\\s*profit|\\btp)\\s*\\d?\\s*[:=]?\\s*${N}`, 'gi')
  let m: RegExpExecArray | null
  while ((m = tpRe.exec(texto)) !== null) {
    const v = numero(m[1])
    if (v != null && v > 0) tps.push(v)
  }
  let entry = numero(entryM?.[1])
  if (entry == null && zonaM) {
    const a = numero(zonaM[1]), b = numero(zonaM[2])
    if (a != null && b != null) entry = (a + b) / 2
  }
  return { entry, sl: numero(slM?.[1]), tps }
}

function fmt(v: number, casas: number): string {
  return v.toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

/**
 * Desfecho de uma entrada a partir do follow-up que a encerrou.
 *
 * Três caminhos, por esta ordem:
 *  1. A fonte anunciou os pips (Premium: "HIT TP3 ✅ +200PIPS") — é esse o número.
 *  2. Fechou no STOP ou no ALVO FINAL: a distância mede-se entre a entrada e o SL/TP do próprio
 *     setup. É a conta que qualquer pessoa faria a olhar para o cartão.
 *  3. Cancelado ou descartado: terminou sem render, e diz-se isso em vez de inventar um zero.
 *
 * Devolve null quando o sinal terminou mas não há maneira honesta de lhe pôr um número.
 */
export function calcularDesfecho(setup: Msg, fecho: Msg): SignalOutcome | null {
  const texto = fecho.content ?? ''
  const sym = simbolo(setup.content ?? '') ?? ''
  const unit = unitFor(sym)
  const base = { unit, closed_at: fecho.created_at, closed_by: fecho.id }
  const pip = pipSizeForSymbol(sym)

  const sinal = precosDoSetup(setup.content ?? '')
  const entrada = sinal.entry

  /** Monta a etiqueta a partir dos pips e da entrada. */
  const montar = (pips: number, source: SignalOutcome['source']): SignalOutcome => {
    const sgn = pips >= 0 ? '+' : '−'
    const parte = `${sgn}${fmt(Math.abs(pips), 0)} ${unit}`
    let pct: number | null = null
    let label = parte
    if (entrada != null && entrada > 0) {
      const p = Math.round(((Math.abs(pips) * pip) / entrada) * 10000) / 100
      label = `${parte} · ${sgn}${fmt(p, 2)}%`
      pct = pips < 0 ? -p : p
    }
    return { ...base, pips, pct, label, kind: pips >= 0 ? 'won' : 'lost', source }
  }

  // 1. Número anunciado pela fonte.
  //
  // O SINAL do número anunciado conta. Só se olhava para o `PERDA_RE` («SL HIT», ❌), que é como
  // as fontes de fora escrevem uma perda; os NOSSOS cartões escrevem-na com um menos —
  // «🏁 Posição fechada · XAUUSD 🔴 VENDA · −50 pips · −0,12%» — e essa perda ficava gravada
  // como +50 pips GANHOS, em verde, no cartão e nas somas do mês.
  const m = texto.match(PIPS_RE)
  const bruto = m ? numero(m[1]) : null
  const menosAnunciado = m ? /^\s*[-−]/.test(m[1]) : false
  if (bruto != null && bruto !== 0) {
    const perdeu = PERDA_RE.test(texto) || menosAnunciado
    return montar(perdeu ? -Math.abs(bruto) : Math.abs(bruto), 'announced')
  }

  // 2. Sem número: se sabemos ONDE fechou, medimos no próprio setup.
  if (entrada != null && entrada > 0 && pip > 0) {
    if (STOP_RE.test(texto) && sinal.sl != null && sinal.sl > 0 && plausivel(entrada, sinal.sl)) {
      return montar(-Math.abs(entrada - sinal.sl) / pip, 'stop')
    }
    if (ALVO_FINAL_RE.test(texto) && sinal.tps.length) {
      const alvo = sinal.tps[sinal.tps.length - 1]
      if (alvo > 0 && plausivel(entrada, alvo)) return montar(Math.abs(alvo - entrada) / pip, 'target')
    }
  }

  // 3. Terminou sem render — dizer isso vale mais do que um zero inventado.
  if (SEM_TRADE_RE.test(texto)) {
    return {
      ...base,
      pips: null,
      pct: null,
      label: /descartad|invalidad/i.test(texto) ? 'Descartado' : 'Cancelado',
      kind: 'cancelled',
      source: 'none',
    }
  }
  return null
}

/**
 * Empareja entradas e fechos de uma lista de mensagens do MESMO canal (ordem indiferente) e
 * devolve o desfecho por id de entrada. Só entradas com número entram no resultado.
 */
export function emparelhar(mensagens: Msg[]): Map<string, SignalOutcome> {
  const ordenadas = [...mensagens].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const entradas = ordenadas.filter((m) => isT2TEntrySignal(m.channel_slug, m.content))
  const terminais = ordenadas.filter((m) => TERMINAL_RE.test(m.content ?? ''))

  const out = new Map<string, SignalOutcome>()
  const fechadas = new Set<string>()

  for (const f of terminais) {
    const fSym = simbolo(f.content ?? '')
    const fDir = direcao(f.content ?? '')
    const atingidas = entradas.filter((e) => {
      if (fechadas.has(e.id)) return false
      if (e.channel_slug !== f.channel_slug) return false
      if (e.created_at >= f.created_at) return false
      const eSym = simbolo(e.content ?? '')
      // Fecho sem par identificado refere-se ao setup do canal — é assim que se lê no chat.
      if (fSym && eSym && fSym !== eSym) return false
      const eDir = direcao(e.content ?? '')
      if (fDir && eDir && fDir !== eDir) return false
      return true
    })
    atingidas.forEach((e, i) => {
      fechadas.add(e.id)
      if (i !== atingidas.length - 1) return // zonas substituídas fecham sem número
      const d = calcularDesfecho(e, f)
      if (d) out.set(e.id, d)
    })
  }
  return out
}

/**
 * Recalcula e GRAVA os desfechos de um canal. `sinceIso` limita a janela (o cron usa 48h; o
 * backfill não passa nada e apanha tudo).
 */
export async function atualizarDesfechosDoCanal(
  slug: string,
  sinceIso?: string,
): Promise<{ lidas: number; escritas: number }> {
  const supabase = getSupabaseAdmin()
  // O PostgREST devolve no máximo mil linhas por pedido — sem paginar, o backfill do Premium
  // (2.500 mensagens) parava a meio e metade do histórico ficava sem desfecho.
  const PAGINA = 1000
  const teto = sinceIso ? PAGINA : 10_000
  const mensagens: Msg[] = []
  for (let offset = 0; offset < teto; offset += PAGINA) {
    let q = supabase
      .from('chat_messages')
      .select('id, channel_slug, content, created_at, outcome')
      .eq('channel_slug', slug)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGINA - 1)
    if (sinceIso) q = q.gte('created_at', sinceIso)
    const { data, error } = await q
    if (error || !data?.length) break
    mensagens.push(...(data as Msg[]))
    if (data.length < PAGINA) break
  }
  if (!mensagens.length) return { lidas: 0, escritas: 0 }
  const desfechos = emparelhar(mensagens)
  const jaTem = new Map(mensagens.map((m) => [m.id, m.outcome]))

  let escritas = 0
  for (const [id, d] of desfechos) {
    // Não reescreve o que já está igual — poupa escritas e mantém o histórico estável.
    const atual = jaTem.get(id) as SignalOutcome | null | undefined
    if (atual && atual.label === d.label && atual.closed_by === d.closed_by) continue
    /**
     * O texto é o degrau MAIS BAIXO da escada — e é aqui que isso passa a valer.
     *
     * Este cron corria de 5 em 5 minutos sobre as últimas 48 horas e escrevia direito ao campo,
     * por isso era quase sempre o último a falar: apanhava sinais que o motor de preço já tinha
     * medido e punha-lhes por cima o número que a fonte tinha anunciado no seguimento. Dos 289
     * sinais com os dois números, 276 discordavam — e o que o cliente via era este.
     *
     * Continua a correr e continua a ser útil (é o único que apanha fechos que só existem em
     * texto), mas deixou de poder tapar uma medição de preço.
     */
    if (await gravarDesfechoUnico(id, 'texto', d)) escritas++
  }
  return { lidas: mensagens.length, escritas }
}

/** Passa por todos os canais de sinais. */
export async function atualizarTodosOsDesfechos(
  sinceIso?: string,
): Promise<Record<string, { lidas: number; escritas: number }>> {
  const out: Record<string, { lidas: number; escritas: number }> = {}
  for (const slug of CANAIS_DE_SINAIS) {
    out[slug] = await atualizarDesfechosDoCanal(slug, sinceIso)
  }
  return out
}
