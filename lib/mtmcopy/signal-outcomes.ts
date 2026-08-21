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
import { isT2TEntrySignal } from './t2t-source'

/** Canais de sinais — os únicos onde faz sentido procurar desfechos. */
export const CANAIS_DE_SINAIS = [
  'premium-ideas',
  'trade-ideas-setup',
  'trade-ideas',
  'sensei-scanner',
  'sinais-scanner-mtm',
  'sinais-goldkiller',
  'cripto-perps',
  'ideias-e-sinais',
  'sinais',
] as const

/** Encerra mesmo a ideia (ao contrário de um BE ou de um TP1, que a deixam a correr). */
const TERMINAL_RE =
  /(posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad|descartad|invalidad|alvo\s+final|close\s+all|hit\s*tp\s*[3-9])/i
const PERDA_RE = /\bsl\s*hit|stop\s*loss\s*hit|❌/i
const PIPS_RE = /([+\-−]?\s*\d+(?:[.,]\d+)?)\s*pips?/i
const DIR_BUY_RE = /\b(buy|long|compra)\b|🟢|🔵/i
const DIR_SELL_RE = /\b(sell|short|venda)\b|🔴/i

export interface SignalOutcome {
  pips: number
  pct: number | null
  unit: 'pips' | 'pontos'
  label: string
  closed_at: string
  closed_by: string
  /** 'announced' = o número veio da fonte. */
  source: 'announced'
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

function direcao(texto: string): 'buy' | 'sell' | null {
  if (DIR_BUY_RE.test(texto)) return 'buy'
  if (DIR_SELL_RE.test(texto)) return 'sell'
  return null
}

function numero(s: string): number | null {
  const v = Number(s.replace(/[\s−+]/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

function fmt(v: number, casas: number): string {
  return v.toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

/** Desfecho de uma entrada a partir do follow-up que a encerrou. Null quando não há número. */
export function calcularDesfecho(setup: Msg, fecho: Msg): SignalOutcome | null {
  const texto = fecho.content ?? ''
  const m = texto.match(PIPS_RE)
  if (!m) return null
  const bruto = numero(m[1])
  if (bruto == null || bruto === 0) return null

  const pips = PERDA_RE.test(texto) ? -Math.abs(bruto) : Math.abs(bruto)
  const sym = simbolo(setup.content ?? '') ?? ''
  const unit = unitFor(sym)
  const sinal = pips >= 0 ? '+' : '−'
  const parte = `${sinal}${fmt(Math.abs(pips), 0)} ${unit}`

  const entradaTxt = (setup.content ?? '').match(/(?:entrada|entry|zone)\D{0,12}(\d[\d.,]*)/i)?.[1]
  const entrada = entradaTxt ? numero(entradaTxt) : null
  let pct: number | null = null
  let label = parte
  if (entrada != null && entrada > 0) {
    pct = Math.round(((Math.abs(pips) * pipSizeForSymbol(sym)) / entrada) * 10000) / 100
    label = `${parte} · ${sinal}${fmt(pct, 2)}%`
    if (pips < 0) pct = -pct
  }

  return {
    pips,
    pct,
    unit,
    label,
    closed_at: fecho.created_at,
    closed_by: fecho.id,
    source: 'announced',
  }
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
  let q = supabase
    .from('chat_messages')
    .select('id, channel_slug, content, created_at, outcome')
    .eq('channel_slug', slug)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(sinceIso ? 500 : 5000)
  if (sinceIso) q = q.gte('created_at', sinceIso)

  const { data, error } = await q
  if (error || !data?.length) return { lidas: 0, escritas: 0 }

  const mensagens = data as Msg[]
  const desfechos = emparelhar(mensagens)
  const jaTem = new Map(mensagens.map((m) => [m.id, m.outcome]))

  let escritas = 0
  for (const [id, d] of desfechos) {
    // Não reescreve o que já está igual — poupa escritas e mantém o histórico estável.
    const atual = jaTem.get(id) as SignalOutcome | null | undefined
    if (atual && atual.label === d.label && atual.closed_by === d.closed_by) continue
    const { error: e } = await supabase.from('chat_messages').update({ outcome: d }).eq('id', id)
    if (!e) escritas++
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
