/**
 * Entrada do webhook `?strategy=Trendshot` (pedido do dono, 23/10/2026).
 *
 * Caminho próprio e curto, à parte dos gates dos outros scanners: o alerta do Trendshot traz só a
 * direcção (e o `{{close}}`), e os níveis saem de `niveisTrendshot`. Publica no chat da app
 * `sinais-trendshot` e no grupo Telegram «Ideias e sinais - Scanner TrendShot» (env
 * TELEGRAM_CHANNEL_TRENDSHOT). O acompanhamento por preço (alvos/BE/stop no chat e no Telegram) é o
 * do tracker — o canal está em CANAIS_SO_SEGUIMENTO. A entrada vai também à mestre «MTM Auto
 * Trendshot» pelo mesmo `encaminharSinalParaMestre` das outras estratégias: sem linha em
 * mestres_estrategias, ou em `sinal_modo` desligado, não abre nada (o motivo fica no registo).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmcopyBotToken } from '@/lib/mtmcopy/telegram-bot'
import { grupoTelegramTrendshot } from '@/lib/telegram-seguimento'
import { normalizeSymbol } from '@/lib/mtmcopy/signal-parser'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { formatarSinal } from '@/lib/sinais/formato-sinal'
import { encaminharSinalParaMestre } from '@/lib/mestres/servidor/sinal-mestre'
import {
  CANAL_TRENDSHOT,
  ESTRATEGIA_TRENDSHOT,
  direcaoTrendshot,
  niveisTrendshot,
} from '@/lib/sinais/trendshot'

type Json = Record<string, unknown>

/** Janela em que o mesmo par na mesma direcção é o mesmo alerta (o TradingView repete-se). */
const JANELA_DUPLICADO_MS = 10 * 60_000

function primeiro(p: Json, nomes: string[]): unknown {
  for (const n of nomes) {
    const v = p[n]
    if (v != null && v !== '') return v
  }
  return null
}

function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function processarTrendshot(payload: Json, rawBody: string): Promise<{ ok: boolean; [k: string]: unknown }> {
  const supabase = getSupabaseAdmin()
  const tickerBruto = String(primeiro(payload, ['ticker', 'symbol', 'pair', 'instrument']) ?? '')
  const simbolo = normalizeSymbol(tickerBruto.split(':').pop() ?? '')
  const texto = [primeiro(payload, ['action', 'side', 'signal']), primeiro(payload, ['alert_name', 'alert', 'name']), primeiro(payload, ['message', 'comment', 'text']), rawBody]
    .map((x) => String(x ?? ''))
    .join(' ')
  const direcao = direcaoTrendshot(texto)
  const entrada = numero(primeiro(payload, ['price', 'close', 'entry']))
  const timeframe = String(primeiro(payload, ['timeframe', 'interval', 'tf']) ?? '') || null

  const { data: log } = await supabase
    .from('tradingview_signals')
    .insert({
      source: 'tradingview',
      ticker: tickerBruto || null,
      timeframe,
      action: direcao,
      price: entrada,
      alert_name: ESTRATEGIA_TRENDSHOT,
      raw_payload: payload,
      estrategia: 'trendshot',
      signal_kind: 'entry',
      ligacao: 'origem',
    })
    .select('id')
    .single()
  const logId = (log?.id as string | undefined) ?? null
  const falha = async (motivo: string) => {
    if (logId) await supabase.from('tradingview_signals').update({ ai_error: `trendshot: ${motivo}` }).eq('id', logId)
    return { ok: true, skipped: motivo }
  }

  if (!simbolo) return falha('sem ticker')
  if (!direcao) return falha('sem direcção (BUY/SELL)')
  if (!entrada) return falha('sem preço — o alerta tem de mandar {{close}}')

  // Mesmo par, mesma direcção, há menos de 10 min → é repetição do TradingView.
  const desde = new Date(Date.now() - JANELA_DUPLICADO_MS).toISOString()
  const { data: recentes } = await supabase
    .from('tradingview_signals')
    .select('id')
    .eq('estrategia', 'trendshot')
    .eq('action', direcao)
    .eq('chat_status', 'sent')
    .ilike('ticker', `%${simbolo.slice(0, 6)}%`)
    .gte('received_at', desde)
    .limit(1)
  if (recentes?.length) return falha('duplicado (mesmo par e direcção há <10 min)')

  const proprios = {
    sl: numero(primeiro(payload, ['sl', 'stop_loss', 'stoploss'])),
    tps: ['tp1', 'tp2', 'tp3', 'tp4'].map((k) => numero(payload[k])),
  }
  const auto = niveisTrendshot(simbolo, direcao, entrada)
  const sl = proprios.sl ?? auto.sl
  const tps = proprios.tps.every((t) => t != null) ? (proprios.tps as number[]) : [...auto.tps]

  const texto_ = formatarSinal({ estrategia: ESTRATEGIA_TRENDSHOT, simbolo, direcao, entrada, sl, tps, timeframe })

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      channel_slug: CANAL_TRENDSHOT,
      message_type: 'telegram_forward',
      content: texto_,
      telegram_sender: `📈 ${ESTRATEGIA_TRENDSHOT}`,
      user_id: null,
    })
    .select('id')
    .single()
  if (error || !msg) return falha(`chat: ${error?.message ?? 'sem id'}`)
  const chatId = msg.id as string

  let telegramMessageId: number | null = null
  const grupo = grupoTelegramTrendshot()
  const token = getMtmcopyBotToken()
  if (grupo && token) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: grupo, text: texto_, disable_web_page_preview: true }),
      })
      const j = (await res.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string }
      if (j.ok && j.result?.message_id) telegramMessageId = j.result.message_id
      else console.warn('[trendshot] telegram:', j.description)
    } catch (e) {
      console.warn('[trendshot] telegram falhou:', e instanceof Error ? e.message : String(e))
    }
  }
  if (telegramMessageId) await supabase.from('chat_messages').update({ telegram_message_id: telegramMessageId }).eq('id', chatId)
  if (logId) {
    await supabase
      .from('tradingview_signals')
      .update({
        sl,
        tp: tps[0],
        chat_status: 'sent',
        chat_message_id: chatId,
        telegram_status: telegramMessageId ? 'sent' : grupo ? 'failed' : 'skipped',
        telegram_chat_id: grupo,
        telegram_message_id: telegramMessageId,
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId)
  }
  await sendTelegramChannelPush({ slug: CANAL_TRENDSHOT, content: texto_, chatMessageId: chatId }).catch(() => undefined)

  // Mestre: a publicação já saiu; uma falha aqui fica escrita e não parte o webhook.
  let mestre: string | null = null
  try {
    const m = await encaminharSinalParaMestre({ fonte: 'trendshot', symbol: simbolo, direcao, entrada, sl, tps, externalRef: String(logId ?? '') })
    mestre = m.modo === 'desligado' ? null : m.modo
    if (m.motivo && logId) await supabase.from('tradingview_signals').update({ ai_error: `mestre trendshot: ${m.motivo}`.slice(0, 300) }).eq('id', logId)
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('[trendshot] mestre:', motivo)
    if (logId) await supabase.from('tradingview_signals').update({ ai_error: `mestre trendshot: erro ao encaminhar: ${motivo}`.slice(0, 300) }).eq('id', logId)
  }
  return { ok: true, estrategia: 'trendshot', simbolo, direcao, entrada, sl, tps, chatId, telegram: !!telegramMessageId, mestre }
}
