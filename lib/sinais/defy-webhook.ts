/**
 * Entrada do webhook do DEFY (docs/pine/defy.pine), 04/11/2026, pedido do dono: «webhook, alertas e
 * seguimento das trades conforme os existentes na MTM e chats».
 *
 * O mesmo caminho do Premium Scanner, com uma diferença: o DEFY segue a SUA trade no gráfico e manda
 * os seguimentos pelo mesmo alerta («Any alert() function call», «Once Per Bar Close»). Todos os
 * alertas trazem `"strategy":"DEFY"` e o `id` da vela de sinal; o `event` diz o que é:
 *   · `entry`     → registo em `tradingview_signals` (entry) → MTM Alerts; cartão no chat `sinais-defy`
 *                   com o gráfico; push da app (T2T para quem tem conta); mestre «MTM Auto DEFY» pelo
 *                   `encaminharSinalParaMestre` (fonte `defy` — sem linha em mestres_estrategias, não
 *                   abre nada: começa em SOMBRA como as outras estratégias novas);
 *   · `entry_hit` → só no modo Pullback: a ordem a 50 % encheu;
 *   · `tp1|tp2`   → alvo parcial; `tp3` → alvo final;
 *   · `sl`        → stop (depois de um alvo sai como «stop protegido»);
 *   · `cancel`    → o pullback não foi tocado em 10 velas: ideia descartada.
 * Os seguimentos publicam-se como RESPOSTA (reply_to_id) ao cartão da entrada com o mesmo `id`, e o
 * registo liga-se à entrada (`entrada_id`, `chave_trade` = par:id) — se a entrada não existir, fica escrito e não sai.
 * Telegram: o chat é espelhado para o grupo «MoreThanMoney Defy Signals» (lib/telegram-channel-ids).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { normalizeSymbol } from '@/lib/mtmcopy/signal-parser'
import { urlDoGraficoDoSinal } from '@/lib/sinais/grafico-publicar'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { formatarSinal, formatarSeguimento } from '@/lib/sinais/formato-sinal'
import { lifecycleMessage, type SignalEvent } from '@/lib/mtmcopy/signal-lifecycle'
import { encaminharSinalParaMestre } from '@/lib/mestres/servidor/sinal-mestre'

type Json = Record<string, unknown>

export const ESTRATEGIA_DEFY = 'defy'
export const NOME_DEFY = 'MTM Auto DEFY'
export const CANAL_DEFY = 'sinais-defy'

/** Janela em que o mesmo par na mesma direcção é o mesmo alerta (o TradingView repete-se). */
const JANELA_DUPLICADO_MS = 10 * 60_000
/** Validade da ordem limite no modo Pullback: 10 velas (o Pine descarta ao fim delas). */
const VELAS_PULLBACK = 10

const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** `?strategy=defy` no URL, ou `"strategy":"DEFY"` / `"source":"defy"` no JSON do alerta. */
export function eAlertaDefy(strategy: string | null | undefined, payload: Json): boolean {
  const s = norm(strategy)
  if (s) return s === 'defy'
  return norm(payload.strategy) === 'defy' || norm(payload.source) === 'defy'
}

function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Arredonda ao passo do preço (o Pine manda o float cru). Ouro/índices 2 casas; forex 5; JPY 3. */
export function arredondarPreco(v: number | null, simbolo: string): number | null {
  if (v == null) return null
  const s = simbolo.toUpperCase()
  const casas = /JPY/.test(s) ? 3 : /^(XAU|XAG|US30|US500|SP500|NAS|US100|GER|DE40|UK100|BTC|ETH)/.test(s) ? 2 : /^[A-Z]{6}$/.test(s) ? 5 : 2
  const f = 10 ** casas
  return Math.round(v * f) / f
}

/** Minutos por vela a partir do `timeframe.period` do Pine ("15", "60", "240", "D"). */
function minutosDoTimeframe(tf: string | null): number {
  const t = String(tf ?? '').toUpperCase()
  if (/^\d+$/.test(t)) return Number(t)
  if (t === 'D' || t === '1D') return 1440
  if (t === 'W' || t === '1W') return 10080
  return 15
}

/** Chave da trade (199): o `id` do Pine é a hora da vela de sinal; o par evita colisões entre gráficos. */
export function chaveTradeDefy(payload: Json): string | null {
  const id = String(payload.id ?? '').trim()
  if (!id) return null
  const par = normalizeSymbol(String(payload.ticker ?? payload.symbol ?? '').split(':').pop() ?? '')
  return `${par}:${id}`
}

export interface EventoDefy { evento: SignalEvent; nivel?: number }

/** `event` do Pine → evento do ciclo de vida (puro; `hits` = alvos já tocados antes do stop). */
export function eventoDefy(ev: string, hits: number): EventoDefy | null {
  switch (norm(ev)) {
    case 'entryhit': return { evento: 'entry_hit' }
    case 'tp1': return { evento: 'partial', nivel: 1 }
    case 'tp2': return { evento: 'partial', nivel: 2 }
    case 'tp3': return { evento: 'target_final', nivel: 3 }
    case 'sl': return { evento: hits > 0 ? 'stop_protegido' : 'stop_loss' }
    case 'cancel': return { evento: 'discarded' }
    default: return null
  }
}

/** Nível de estrelas/King para o cartão: «+8 ★★», «+11 👑 King». */
export function pontuacaoDefy(payload: Json): string | null {
  const sc = Number(payload.score)
  if (!Number.isFinite(sc)) return null
  const st = Math.max(0, Math.min(3, Number(payload.stars) || 0))
  const king = payload.king === true || String(payload.king) === 'true'
  return `Pontuação +${sc}${st ? ` ${'★'.repeat(st)}` : ''}${king ? ' 👑 King' : ''}`
}

export async function processarDefy(payload: Json): Promise<{ ok: boolean; [k: string]: unknown }> {
  const ev = norm(payload.event)
  if (ev && ev !== 'entry') return processarSeguimentoDefy(payload)
  return processarEntradaDefy(payload)
}

async function processarEntradaDefy(payload: Json): Promise<{ ok: boolean; [k: string]: unknown }> {
  const supabase = getSupabaseAdmin()
  const tickerBruto = String(payload.ticker ?? payload.symbol ?? '')
  const simbolo = normalizeSymbol(tickerBruto.split(':').pop() ?? '')
  const acao = String(payload.action ?? payload.side ?? '').toLowerCase()
  const direcao = acao === 'buy' || acao === 'sell' ? acao : null
  const timeframe = String(payload.timeframe ?? payload.tf ?? '') || null
  const r = (v: unknown) => arredondarPreco(numero(v), simbolo)
  const entrada = r(payload.entry)
  const sl = r(payload.sl)
  const tps = ['tp1', 'tp2', 'tp3'].map((k) => r(payload[k])).filter((t): t is number => t != null)
  const pullback = String(payload.entry_mode ?? '').toLowerCase() === 'pullback'

  const { data: log, error: erroLog } = await supabase
    .from('tradingview_signals')
    .insert({
      source: 'tradingview',
      ticker: simbolo || tickerBruto || null,
      timeframe,
      action: direcao,
      price: entrada,
      sl,
      tp: tps[0] ?? null,
      alert_name: 'DEFY',
      raw_payload: payload,
      estrategia: ESTRATEGIA_DEFY,
      signal_kind: 'entry',
      ligacao: 'origem',
      chave_trade: chaveTradeDefy(payload),
    })
    .select('id')
    .single()
  if (erroLog) {
    console.error('[defy] registo falhou:', erroLog.message)
    return { ok: false, error: erroLog.message }
  }
  const logId = (log?.id as string | undefined) ?? null
  const falha = async (motivo: string) => {
    if (logId) await supabase.from('tradingview_signals').update({ ai_error: `defy: ${motivo}`, trade_status: 'filtered' }).eq('id', logId)
    return { ok: true, skipped: motivo }
  }

  if (!simbolo || !direcao || !entrada || !sl || tps.length < 3) return falha('alerta incompleto (ticker, action, entry, sl, tp1..tp3)')
  if ((direcao === 'buy' && !(sl < entrada && tps[0]! > entrada)) || (direcao === 'sell' && !(sl > entrada && tps[0]! < entrada))) {
    return falha('níveis do lado errado da entrada')
  }

  const desde = new Date(Date.now() - JANELA_DUPLICADO_MS).toISOString()
  const { data: recentes } = await supabase
    .from('tradingview_signals')
    .select('id')
    .eq('estrategia', ESTRATEGIA_DEFY)
    .eq('signal_kind', 'entry')
    .eq('action', direcao)
    .not('processed_at', 'is', null)
    .neq('id', logId ?? '')
    .ilike('ticker', `%${simbolo.slice(0, 6)}%`)
    .gte('received_at', desde)
    .limit(1)
  if (recentes?.length) return falha('duplicado (mesmo par e direcção há <10 min)')

  const extras = [pontuacaoDefy(payload), pullback ? 'Entrada no recuo a 50 % da vela de sinal (ordem limite).' : null]
    .filter((x): x is string => !!x)
  const texto = formatarSinal({ estrategia: NOME_DEFY, simbolo, direcao, entrada, sl, tps, timeframe, extras })
  const grafico = logId ? urlDoGraficoDoSinal(logId) : null

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      channel_slug: CANAL_DEFY,
      message_type: 'telegram_forward',
      content: texto,
      telegram_sender: `🟣 ${NOME_DEFY}`,
      user_id: null,
      ...(grafico ? { image_url: grafico } : {}),
    })
    .select('id')
    .single()
  if (error || !msg) return falha(`chat: ${error?.message ?? 'sem id'}`)
  const chatId = msg.id as string

  if (logId) {
    await supabase
      .from('tradingview_signals')
      .update({
        chart_image_url: grafico,
        chat_status: 'sent',
        chat_message_id: chatId,
        telegram_status: 'skipped',
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId)
  }
  // Push da app (T2T para quem tem conta) e, se houver grupo configurado, o espelho no Telegram.
  await sendTelegramChannelPush({ slug: CANAL_DEFY, content: texto, chatMessageId: chatId }).catch(() => undefined)

  // Mestre: a publicação já saiu; uma falha aqui fica escrita e não parte o webhook.
  let mestre: string | null = null
  try {
    const validade = VELAS_PULLBACK * minutosDoTimeframe(timeframe) * 60_000
    const m = await encaminharSinalParaMestre({
      fonte: 'defy',
      symbol: simbolo,
      direcao,
      entrada,
      sl,
      tps,
      externalRef: String(logId ?? ''),
      ...(pullback ? { limite: { preco: entrada, expiraEm: new Date(Date.now() + validade).toISOString() } } : {}),
    })
    mestre = m.modo === 'desligado' ? null : m.modo
    if (m.motivo && logId) await supabase.from('tradingview_signals').update({ ai_error: `mestre defy: ${m.motivo}`.slice(0, 300) }).eq('id', logId)
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('[defy] mestre:', motivo)
    if (logId) await supabase.from('tradingview_signals').update({ ai_error: `mestre defy: erro ao encaminhar: ${motivo}`.slice(0, 300) }).eq('id', logId)
  }
  return { ok: true, estrategia: ESTRATEGIA_DEFY, simbolo, direcao, entrada, sl, tps, chatId, mestre }
}

async function processarSeguimentoDefy(payload: Json): Promise<{ ok: boolean; [k: string]: unknown }> {
  const supabase = getSupabaseAdmin()
  const tickerBruto = String(payload.ticker ?? payload.symbol ?? '')
  const simbolo = normalizeSymbol(tickerBruto.split(':').pop() ?? '')
  const acao = String(payload.action ?? payload.side ?? '').toLowerCase()
  const direcao = acao === 'buy' || acao === 'sell' ? acao : null
  const idSinal = String(payload.id ?? '').trim()
  const hits = Number(payload.hits) || 0
  const ev = eventoDefy(String(payload.event ?? ''), hits)
  const preco = arredondarPreco(numero(payload.price), simbolo)

  // A entrada desta trade: mesma estratégia, mesmo id da vela de sinal e mesmo par.
  type Entrada = { id: string; chat_message_id: string | null; price: number | null; sl: number | null }
  let entrada: Entrada | null = null
  if (idSinal) {
    const { data } = await supabase
      .from('tradingview_signals')
      .select('id, chat_message_id, price, sl')
      .eq('estrategia', ESTRATEGIA_DEFY)
      .eq('signal_kind', 'entry')
      .eq('chave_trade', chaveTradeDefy(payload))
      .order('received_at', { ascending: false })
      .limit(1)
    entrada = ((data?.[0] ?? null) as Entrada | null)
  }

  const { data: log, error: erroLog } = await supabase
    .from('tradingview_signals')
    .insert({
      source: 'tradingview',
      ticker: simbolo || tickerBruto || null,
      timeframe: String(payload.timeframe ?? '') || null,
      action: direcao,
      price: preco,
      sl: arredondarPreco(numero(payload.sl), simbolo),
      alert_name: `DEFY ${String(payload.event ?? '')}`.trim(),
      raw_payload: payload,
      estrategia: ESTRATEGIA_DEFY,
      signal_kind: 'followup',
      chave_trade: idSinal ? chaveTradeDefy(payload) : null,
      ligacao: !idSinal ? 'sem_chave' : entrada ? 'chave' : 'sem_entrada',
      ...(entrada ? { entrada_id: entrada.id } : {}),
    })
    .select('id')
    .single()
  if (erroLog) {
    console.error('[defy] seguimento:', erroLog.message)
    return { ok: false, error: erroLog.message }
  }
  const logId = log?.id as string
  const marcar = async (campos: Record<string, unknown>) => {
    await supabase.from('tradingview_signals').update(campos).eq('id', logId)
  }

  if (!ev) {
    await marcar({ ai_error: `defy: evento desconhecido «${String(payload.event ?? '')}»`, trade_status: 'filtered' })
    return { ok: true, skipped: 'evento desconhecido' }
  }
  if (!entrada?.chat_message_id) {
    await marcar({ ai_error: 'defy: seguimento sem entrada publicada (id da vela não encontrado)', trade_status: 'filtered' })
    return { ok: true, skipped: 'sem entrada' }
  }

  const { text } = lifecycleMessage(ev.evento, {
    symbol: simbolo,
    direction: direcao as 'buy' | 'sell' | null,
    source: NOME_DEFY,
    level: ev.nivel ?? null,
    price: ev.evento === 'entry_hit' || ev.evento === 'discarded' ? null : preco,
    entry: entrada.price,
    slOriginal: entrada.sl,
  })
  const texto = formatarSeguimento(text, NOME_DEFY)

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      channel_slug: CANAL_DEFY,
      message_type: 'telegram_forward',
      content: texto,
      telegram_sender: `🟣 ${NOME_DEFY}`,
      user_id: null,
      reply_to_id: entrada.chat_message_id,
    })
    .select('id')
    .single()
  if (error || !msg) {
    await marcar({ ai_error: `defy: chat: ${error?.message ?? 'sem id'}`.slice(0, 300) })
    return { ok: true, skipped: 'chat' }
  }
  await marcar({ chat_status: 'sent', chat_message_id: msg.id, telegram_status: 'skipped', processed_at: new Date().toISOString() })
  await sendTelegramChannelPush({ slug: CANAL_DEFY, content: texto, chatMessageId: msg.id as string }).catch(() => undefined)
  return { ok: true, estrategia: ESTRATEGIA_DEFY, evento: ev.evento, nivel: ev.nivel ?? null, entrada: entrada.id, chatId: msg.id }
}
