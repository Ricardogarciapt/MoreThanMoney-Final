import { emCache } from '../cache'
import {
  estadoFanout, fonteDoAlerta, fonteDoCanal, motivoEsperado, percentil, type ChaveFonte, type EstadoFanout,
} from '../regras'
import { db, fatias, ler, num, txt, type Linha } from './base'

/**
 * SINAIS — o feed unificado das últimas 24 h e o fan-out de cada sinal.
 *
 * Quatro origens, cada uma pelo seu índice e com limite:
 *   · mtmcopy_signal_log     (created_at desc)       Premium/T2T/site: 1 linha por conta tentada
 *   · tradingview_signals    (received_at desc nl)   scanners/TradingView
 *   · mtmauto_signals        (≤ 24 h, limite 400)    + mtmauto_executions por signal_id (índice único)
 *   · chat_messages          (channel_slug, created_at) só as linhas «📡 PrimeVerse»
 * A janela é lida uma vez e partilhada por cockpit e sinais durante 20 s.
 */

export interface LinhaFanout {
  sistema: 'site' | 'mtmauto'
  userId: string | null
  contaRef: string | null
  estado: EstadoFanout
  estadoBruto: string
  motivo: string | null
  esperado: boolean
  lote: number | null
  em: string
  latenciaMs: number | null
}

export interface Sinal {
  id: string
  sistema: 'site' | 'tradingview' | 'mtmauto' | 'primeverse'
  fonte: ChaveFonte
  origem: string
  simbolo: string | null
  direcao: string | null
  entrada: number | null
  sl: number | null
  tp: number | null
  em: string
  estado: string
  resumo: string | null
  fanout: { total: number; executado: number; saltado: number; erro: number; errosSistema: number; pendente: number }
  latenciaP50Ms: number | null
  latenciaP95Ms: number | null
  estrategiaId: string | null
}

export interface Janela {
  sinais: Sinal[]
  /** fan-out por id de sinal (só em memória do servidor; o feed devolve os contadores) */
  fanout: Map<string, LinhaFanout[]>
  avisos: string[]
  lidaEm: string
}

const JANELA_MS = 24 * 3600_000
// Desde 18/09 as estratégias Edge/King/Wolf publicam no `sinais-scanner-mtm`, com a etiqueta da
// estratégia (formato único) e sem o nome da fonte; as mensagens antigas trazem «PrimeVerse».
const SLUGS_PRIMEVERSE = ['sinais-scanner-mtm', 'trade-ideas', 'premium-ideas', 'sensei-scanner', 'trade-ideas-setup', 'ideias-e-sinais', 'cripto-perps', 'aurum-flow', 'sinais-goldkiller']

function contar(f: LinhaFanout[]) {
  return {
    total: f.length,
    executado: f.filter((x) => x.estado === 'executado' || x.estado === 'aberto' || x.estado === 'fechado').length,
    saltado: f.filter((x) => x.estado === 'saltado' || x.estado === 'descartado').length,
    erro: f.filter((x) => x.estado === 'erro').length,
    errosSistema: f.filter((x) => (x.estado === 'erro' || x.estado === 'saltado') && !x.esperado).length,
    pendente: f.filter((x) => x.estado === 'recebido').length,
  }
}

export async function carregarJanela(): Promise<Janela> {
  const r = await emCache('centro:janela-sinais', 20_000, lerJanela)
  return r.v
}

async function lerJanela(): Promise<Janela> {
  const desde = new Date(Date.now() - JANELA_MS).toISOString()
  const avisos: string[] = []
  const [log, tv, auto, provs, pv] = await Promise.all([
    ler(db().from('mtmcopy_signal_log').select('id, user_id, connection_id, symbol, direction, entry, sl, tp, lot, status, detail, channel_key, telegram_message_id, chat_message_id, created_at').gte('created_at', desde).order('created_at', { ascending: false }).limit(3000)),
    ler(db().from('tradingview_signals').select('id, received_at, alert_name, ticker, action, price, sl, tp, signal_kind, trade_status, ai_status, telegram_status, chat_status, ai_error, telegram_error, bybit_exec_detail').gte('received_at', desde).order('received_at', { ascending: false, nullsFirst: false }).limit(800)),
    ler(db().from('mtmauto_signals').select('id, provider_id, ref_externa, symbol, direction, entry, sl, estado, resultado_pips, created_at').gte('created_at', desde).order('created_at', { ascending: false }).limit(400)),
    lerProviders(),
    ler(db().from('chat_messages').select('id, channel_slug, content, created_at').in('channel_slug', SLUGS_PRIMEVERSE).gte('created_at', desde).is('reply_to_id', null).or('content.ilike.%PrimeVerse%,content.ilike.%📌 MTM Auto Edge ·%,content.ilike.%📌 MTM Auto King ·%,content.ilike.%📌 MTM Auto Wolf ·%').order('created_at', { ascending: false }).limit(200)),
  ])
  for (const [nome, x] of [['sinais do site', log], ['TradingView', tv], ['MTM Auto', auto], ['PrimeVerse (chat)', pv]] as const) {
    if (x.erro) avisos.push(`${nome}: ${x.erro}`)
  }
  const nomeProv = new Map(provs.map((p) => [String(p.id), String(p.nome ?? p.slug ?? '—')]))
  const slugProv = new Map(provs.map((p) => [String(p.id), String(p.slug ?? '')]))

  const sinais: Sinal[] = []
  const fanout = new Map<string, LinhaFanout[]>()

  // ── site (mtmcopy_signal_log): agrupar por mensagem ──
  const grupos = new Map<string, Linha[]>()
  for (const l of [...log.linhas].reverse()) {
    const tg = txt(l.telegram_message_id) ?? String(l.detail ?? '').match(/tg:(\d+)/)?.[1] ?? null
    const minuto = String(l.created_at ?? '').slice(0, 16)
    const chave = tg ? `tg:${tg}` : l.chat_message_id ? `chat:${l.chat_message_id}` : `m:${l.channel_key ?? ''}:${l.symbol ?? ''}:${minuto}`
    const g = grupos.get(chave)
    if (g) g.push(l)
    else grupos.set(chave, [l])
  }
  for (const [chave, linhas] of grupos) {
    const primeira = linhas[0]
    const t0 = Date.parse(String(primeira.created_at))
    const id = `site:${chave}`
    const f: LinhaFanout[] = linhas.filter((l) => l.connection_id).map((l) => {
      const estado = estadoFanout(txt(l.status))
      return {
        sistema: 'site', userId: txt(l.user_id), contaRef: `site:${l.connection_id}`, estado, estadoBruto: String(l.status ?? ''),
        motivo: txt(l.detail), esperado: motivoEsperado(txt(l.detail)), lote: num(l.lot), em: String(l.created_at),
        latenciaMs: estado === 'executado' ? Math.max(0, Date.parse(String(l.created_at)) - t0) : null,
      }
    })
    fanout.set(id, f)
    const lat = f.map((x) => x.latenciaMs).filter((x): x is number => x != null)
    const comSimbolo = linhas.find((l) => l.symbol) ?? primeira
    sinais.push({
      id, sistema: 'site', fonte: fonteDoCanal(txt(primeira.channel_key), txt(primeira.detail)), origem: txt(primeira.channel_key) ?? 'sem canal',
      simbolo: txt(comSimbolo.symbol), direcao: txt(comSimbolo.direction), entrada: num(comSimbolo.entry), sl: num(comSimbolo.sl), tp: num(comSimbolo.tp),
      em: String(primeira.created_at), estado: String(linhas.find((l) => !l.connection_id)?.status ?? primeira.status ?? '—'),
      resumo: txt(linhas.find((l) => !l.connection_id)?.detail ?? primeira.detail)?.slice(0, 200) ?? null,
      fanout: contar(f), latenciaP50Ms: percentil(lat, 0.5), latenciaP95Ms: percentil(lat, 0.95), estrategiaId: null,
    })
  }

  // ── TradingView ──
  for (const s of tv.linhas) {
    const erro = txt(s.ai_error) ?? txt(s.telegram_error)
    sinais.push({
      id: `tv:${s.id}`, sistema: 'tradingview', fonte: fonteDoAlerta(txt(s.alert_name)), origem: txt(s.alert_name) ?? 'TradingView',
      simbolo: txt(s.ticker), direcao: txt(s.action), entrada: num(s.price), sl: num(s.sl), tp: num(s.tp),
      em: String(s.received_at), estado: [txt(s.signal_kind), txt(s.trade_status)].filter(Boolean).join(' · ') || '—',
      resumo: erro ? `erro: ${erro.slice(0, 160)}` : [s.ai_status && `IA ${s.ai_status}`, s.telegram_status && `Telegram ${s.telegram_status}`, s.chat_status && `chat ${s.chat_status}`, txt(s.bybit_exec_detail)?.slice(0, 80)].filter(Boolean).join(' · ') || null,
      fanout: { total: 0, executado: 0, saltado: 0, erro: erro ? 1 : 0, errosSistema: erro ? 1 : 0, pendente: 0 }, latenciaP50Ms: null, latenciaP95Ms: null, estrategiaId: null,
    })
  }

  // ── MTM Auto: sinais + execuções (1 consulta por fatia de 200 sinais, pelo índice único signal_id) ──
  const idsAuto = auto.linhas.map((s) => String(s.id))
  const execs: Linha[] = []
  for (const fatia of fatias(idsAuto)) {
    const e = await ler(db().from('mtmauto_executions').select('id, signal_id, user_id, account_id, estado, motivo, lote, created_at').in('signal_id', fatia).limit(5000))
    if (e.erro) avisos.push(`execuções MTM Auto: ${e.erro}`)
    execs.push(...e.linhas)
  }
  const execPorSinal = new Map<string, Linha[]>()
  for (const e of execs) execPorSinal.set(String(e.signal_id), [...(execPorSinal.get(String(e.signal_id)) ?? []), e])
  for (const s of auto.linhas) {
    const t0 = Date.parse(String(s.created_at))
    const id = `auto:${s.id}`
    const f: LinhaFanout[] = (execPorSinal.get(String(s.id)) ?? []).map((e) => {
      const bruto = String(e.estado ?? '')
      const estado: EstadoFanout = bruto === 'open' || bruto === 'closed' ? 'executado' : estadoFanout(bruto)
      return {
        sistema: 'mtmauto', userId: txt(e.user_id), contaRef: e.account_id ? `auto:${e.account_id}` : null, estado, estadoBruto: bruto,
        motivo: txt(e.motivo), esperado: motivoEsperado(txt(e.motivo)), lote: num(e.lote), em: String(e.created_at),
        latenciaMs: estado === 'executado' ? Math.max(0, Date.parse(String(e.created_at)) - t0) : null,
      }
    })
    fanout.set(id, f)
    const lat = f.map((x) => x.latenciaMs).filter((x): x is number => x != null)
    const slug = slugProv.get(String(s.provider_id)) ?? ''
    sinais.push({
      id, sistema: 'mtmauto', fonte: slug.includes('premium') ? 'premium' : slug.includes('sensei') ? 'sensei' : slug.includes('aurum') ? 'aurum' : slug.toLowerCase().includes('goldkiller') ? 'goldkiller' : slug.includes('scanner') ? 'mtmscanner' : 'mtmauto',
      origem: nomeProv.get(String(s.provider_id)) ?? 'MTM Auto', simbolo: txt(s.symbol), direcao: txt(s.direction), entrada: num(s.entry), sl: num(s.sl), tp: null,
      em: String(s.created_at), estado: String(s.estado ?? '—'), resumo: s.resultado_pips != null ? `${num(s.resultado_pips)} pips` : null,
      fanout: contar(f), latenciaP50Ms: percentil(lat, 0.5), latenciaP95Ms: percentil(lat, 0.95), estrategiaId: txt(s.provider_id),
    })
  }

  // ── PrimeVerse (chat) ──
  for (const c of pv.linhas) {
    const primeira = String(c.content ?? '').split('\n')[0] ?? ''
    const m = primeira.match(/([A-Z0-9.]{3,12})\s+(?:·\s+)?(BUY|SELL|COMPRA|VENDA)/i)
    sinais.push({
      id: `pv:${c.id}`, sistema: 'primeverse', fonte: 'primeverse', origem: `chat ${c.channel_slug}`,
      simbolo: m?.[1] ?? null, direcao: m?.[2] ? (/buy|compra/i.test(m[2]) ? 'buy' : 'sell') : null, entrada: null, sl: null, tp: null,
      em: String(c.created_at), estado: 'publicado', resumo: String(c.content ?? '').split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 120) ?? null,
      fanout: { total: 0, executado: 0, saltado: 0, erro: 0, errosSistema: 0, pendente: 0 }, latenciaP50Ms: null, latenciaP95Ms: null, estrategiaId: null,
    })
  }

  sinais.sort((a, b) => b.em.localeCompare(a.em))
  return { sinais, fanout, avisos, lidaEm: new Date().toISOString() }
}

export async function lerProviders(): Promise<Linha[]> {
  const r = await emCache('centro:providers', 60_000, async () => {
    // select * de propósito: 082/084 acrescentam colunas (fonte_execucao, apagado_em, espelho_*) que
    // podem ainda não existir — pedir por nome partia a consulta antes das migrações.
    const x = await ler(db().from('mtmauto_providers').select('*').limit(200))
    if (x.erro) throw new Error(x.erro)
    return x.linhas.map((p) => {
      const { telegram_bot_token: _t, ...resto } = p as Linha & { telegram_bot_token?: unknown }
      return resto
    })
  })
  return r.v
}

export interface FiltroSinais {
  fonte?: string | null
  estado?: string | null
  simbolo?: string | null
  estrategia?: string | null
  q?: string | null
  limite?: number
}

export function filtrarSinais(sinais: Sinal[], f: FiltroSinais): Sinal[] {
  const simb = f.simbolo?.trim().toUpperCase()
  const q = f.q?.trim().toLowerCase()
  return sinais.filter((s) => {
    if (f.fonte && f.fonte !== 'todas' && s.fonte !== f.fonte) return false
    if (f.estrategia && s.estrategiaId !== f.estrategia) return false
    if (simb && !String(s.simbolo ?? '').toUpperCase().includes(simb)) return false
    if (f.estado === 'erro' && s.fanout.erro === 0 && !/erro/i.test(String(s.resumo ?? ''))) return false
    if (f.estado === 'sistema' && s.fanout.errosSistema === 0) return false
    if (f.estado === 'executado' && s.fanout.executado === 0) return false
    if (f.estado === 'saltado' && s.fanout.saltado === 0) return false
    if (q && !`${s.origem} ${s.simbolo ?? ''} ${s.resumo ?? ''} ${s.estado}`.toLowerCase().includes(q)) return false
    return true
  }).slice(0, Math.min(Math.max(f.limite ?? 300, 1), 1000))
}

/** Detalhe de um sinal: fan-out completo (com emails) + mensagem bruta quando existe. */
export async function detalheSinal(id: string): Promise<{ sinal: Sinal | null; fanout: (LinhaFanout & { email: string | null })[]; bruto: string | null }> {
  const j = await carregarJanela()
  const sinal = j.sinais.find((s) => s.id === id) ?? null
  const f = j.fanout.get(id) ?? []
  const ids = [...new Set(f.map((x) => x.userId).filter((x): x is string => Boolean(x)))].slice(0, 400)
  const emails = new Map<string, string | null>()
  for (const fatia of fatias(ids)) {
    const p = await ler(db().from('profiles').select('id, email').in('id', fatia))
    for (const l of p.linhas) emails.set(String(l.id), txt(l.email))
  }
  let bruto: string | null = null
  if (id.startsWith('site:tg:')) {
    const r = await ler(db().from('mtmcopy_signal_log').select('raw_message').eq('telegram_message_id', id.slice(8)).limit(1))
    bruto = txt(r.linhas[0]?.raw_message)
  } else if (id.startsWith('auto:')) {
    const r = await ler(db().from('mtmauto_signals').select('raw').eq('id', id.slice(5)).limit(1))
    bruto = txt(r.linhas[0]?.raw)
  } else if (id.startsWith('tv:')) {
    const r = await ler(db().from('tradingview_signals').select('message, ai_analysis').eq('id', id.slice(3)).limit(1))
    bruto = [txt(r.linhas[0]?.message), txt(r.linhas[0]?.ai_analysis)].filter(Boolean).join('\n\n— IA —\n') || null
  } else if (id.startsWith('pv:')) {
    const r = await ler(db().from('chat_messages').select('content').eq('id', id.slice(3)).limit(1))
    bruto = txt(r.linhas[0]?.content)
  }
  return { sinal, fanout: f.map((x) => ({ ...x, email: x.userId ? emails.get(x.userId) ?? null : null })), bruto }
}
