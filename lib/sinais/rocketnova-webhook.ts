/**
 * Entrada do webhook do RocketNova (docs/pine/rocketnova.pine), 08/11/2026, pedido do dono: um scanner
 * próprio com os princípios do TrendShot (alertas por webhook e plots de posições) e gestão da trade.
 *
 * O caminho é o do DEFY: todos os alertas trazem `"strategy":"ROCKETNOVA"` e o `id` da vela de sinal;
 * o `event` diz o que é:
 *   · `entry`      → registo em `tradingview_signals` (entry) → Alertas MTM; cartão no chat
 *                    `sinais-rocketnova` com o gráfico; push da app (T2T para quem tem conta); mestre
 *                    «MTM Auto RocketNova» pelo `encaminharSinalParaMestre` (sem linha em
 *                    mestres_estrategias não abre nada: começa em SOMBRA);
 *   · `tp1..tp4`   → alvos (o último é o final);
 *   · `sl`         → stop (depois de um alvo sai como «stop protegido»);
 *   · `be`         → o stop na entrada foi tocado (stop protegido);
 *   · `exit`       → fechada por um sinal contrário.
 * Os seguimentos publicam-se como RESPOSTA ao cartão da entrada com o mesmo `id` (`chave_trade` =
 * par:id); sem entrada publicada ficam escritos e não saem.
 * Um alerta simples («RocketNova: sinal de COMPRA em XAUUSD a 4000») também entra: os níveis
 * calculam-se como no modo AUTO do Pine (lib/sinais/rocketnova).
 * Telegram: o chat é espelhado para o grupo definido em TELEGRAM_CHANNEL_ROCKETNOVA (lib/telegram-channel-ids).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { normalizeSymbol } from '@/lib/mtmcopy/signal-parser'
import { urlDoGraficoDoSinal } from '@/lib/sinais/grafico-publicar'
import { sendTelegramChannelPush } from '@/lib/telegram-channel-push'
import { formatarSinal, formatarSeguimento } from '@/lib/sinais/formato-sinal'
import { lifecycleMessage } from '@/lib/mtmcopy/signal-lifecycle'
import { encaminharSinalParaMestre } from '@/lib/mestres/servidor/sinal-mestre'
import {
  CANAL_ROCKETNOVA,
  ESTRATEGIA_ROCKETNOVA,
  NOME_ROCKETNOVA,
  arredondarRocketnova,
  chaveTradeRocketnova,
  direcaoRocketnova,
  eventoRocketnova,
  extrasRocketnova,
  niveisRocketnova,
  norm,
} from '@/lib/sinais/rocketnova'

type Json = Record<string, unknown>

/** Janela em que o mesmo par na mesma direcção é o mesmo alerta (o TradingView repete-se). */
const JANELA_DUPLICADO_MS = 10 * 60_000
const REMETENTE = `🚀 ${NOME_ROCKETNOVA}`

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

export async function processarRocketnova(
  payloadBruto: Json,
  rawBody: string,
  query?: URLSearchParams,
): Promise<{ ok: boolean; [k: string]: unknown }> {
  // Par e timeframe também pelo URL (`&ticker=XAUUSD&tf=15`), como no TrendShot: os alertas simples
  // («alertcondition») não deixam editar a mensagem.
  const payload: Json = { ...payloadBruto }
  for (const [k, nomes] of [['ticker', ['ticker', 'symbol']], ['timeframe', ['tf', 'timeframe', 'interval']]] as const) {
    if (primeiro(payload, [...nomes]) != null) continue
    const v = nomes.map((n) => query?.get(n)).find((x) => x && x.trim())
    if (v) payload[k] = v.trim()
  }
  const ev = norm(payload.event)
  if (ev && ev !== 'entry') return processarSeguimento(payload)
  return processarEntrada(payload, rawBody)
}

async function processarEntrada(payload: Json, rawBody: string): Promise<{ ok: boolean; [k: string]: unknown }> {
  const supabase = getSupabaseAdmin()
  const tickerBruto = String(primeiro(payload, ['ticker', 'symbol', 'pair', 'instrument']) ?? '')
  const simbolo = normalizeSymbol(tickerBruto.split(':').pop() ?? '')
  const texto = [primeiro(payload, ['action', 'side', 'signal']), primeiro(payload, ['alert_name', 'alert', 'name']), primeiro(payload, ['message', 'comment', 'text']), rawBody]
    .map((x) => String(x ?? ''))
    .join(' ')
  const direcao = direcaoRocketnova(texto)
  const timeframe = String(primeiro(payload, ['timeframe', 'interval', 'tf']) ?? '') || null
  const r = (v: unknown) => arredondarRocketnova(numero(v), simbolo)
  const entrada = r(primeiro(payload, ['entry', 'price', 'close']))
  const chave = chaveTradeRocketnova(simbolo, payload)

  const { data: log, error: erroLog } = await supabase
    .from('tradingview_signals')
    .insert({
      source: 'tradingview',
      ticker: simbolo || tickerBruto || null,
      timeframe,
      action: direcao,
      price: entrada,
      alert_name: NOME_ROCKETNOVA,
      raw_payload: payload,
      estrategia: ESTRATEGIA_ROCKETNOVA,
      signal_kind: 'entry',
      ligacao: 'origem',
      chave_trade: chave,
    })
    .select('id')
    .single()
  if (erroLog) {
    console.error('[rocketnova] registo falhou:', erroLog.message)
    return { ok: false, error: erroLog.message }
  }
  const logId = (log?.id as string | undefined) ?? null
  const falha = async (motivo: string) => {
    // 'filtered': nunca foi sinal, por isso não ocupa vaga no feed dos Alertas MTM.
    if (logId) await supabase.from('tradingview_signals').update({ ai_error: `rocketnova: ${motivo}`, trade_status: 'filtered' }).eq('id', logId)
    return { ok: true, skipped: motivo }
  }

  if (!simbolo) return falha('sem ticker — o alerta tem de mandar "ticker":"{{ticker}}" (ou o URL &ticker=PAR)')
  if (!direcao) return falha('sem direcção (BUY/SELL)')
  if (!entrada) return falha('sem preço — o alerta tem de mandar entry ou {{close}}')

  // Mesmo par, mesma direcção, há menos de 10 min → é repetição do TradingView.
  const desde = new Date(Date.now() - JANELA_DUPLICADO_MS).toISOString()
  const { data: recentes } = await supabase
    .from('tradingview_signals')
    .select('id')
    .eq('estrategia', ESTRATEGIA_ROCKETNOVA)
    .eq('signal_kind', 'entry')
    .eq('action', direcao)
    .eq('chat_status', 'sent')
    .neq('id', logId ?? '')
    .ilike('ticker', `%${simbolo.slice(0, 6)}%`)
    .gte('received_at', desde)
    .limit(1)
  if (recentes?.length) return falha('duplicado (mesmo par e direcção há <10 min)')

  // Os níveis vêm do Pine; se faltarem (alerta simples), o modo AUTO.
  const proprios = {
    sl: r(primeiro(payload, ['sl', 'stop_loss', 'stoploss'])),
    tps: ['tp1', 'tp2', 'tp3', 'tp4'].map((k) => r(payload[k])),
  }
  const auto = niveisRocketnova(simbolo, direcao, entrada)
  const sl = proprios.sl ?? auto.sl
  const tpsPine = proprios.tps.filter((t): t is number => t != null)
  const tps = tpsPine.length >= 3 ? tpsPine : [...auto.tps]
  if ((direcao === 'buy' && !(sl < entrada && tps[0]! > entrada)) || (direcao === 'sell' && !(sl > entrada && tps[0]! < entrada))) {
    return falha('níveis do lado errado da entrada')
  }

  const texto_ = formatarSinal({ estrategia: NOME_ROCKETNOVA, simbolo, direcao, entrada, sl, tps, timeframe, extras: extrasRocketnova(payload) })
  const grafico = logId ? urlDoGraficoDoSinal(logId) : null

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      channel_slug: CANAL_ROCKETNOVA,
      message_type: 'telegram_forward',
      content: texto_,
      telegram_sender: REMETENTE,
      user_id: null,
      ...(grafico ? { image_url: grafico } : {}),
    })
    .select('id')
    .single()
  if (error || !msg) return falha(`chat: ${error?.message ?? 'sem id'}`)
  const chatId = msg.id as string

  if (logId) {
    // A coluna `tp` só guarda o TP1: o gráfico lê os quatro alvos do payload.
    payload.tp1 = tps[0]; payload.tp2 = tps[1]; payload.tp3 = tps[2]; payload.tp4 = tps[3]; payload.sl = sl; payload.entry = entrada
    await supabase
      .from('tradingview_signals')
      .update({
        raw_payload: payload,
        sl,
        tp: tps[0],
        chart_image_url: grafico,
        chat_status: 'sent',
        chat_message_id: chatId,
        telegram_status: 'skipped',
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId)
  }
  // Push da app (T2T para quem tem conta) e, se houver grupo configurado, o espelho no Telegram.
  await sendTelegramChannelPush({ slug: CANAL_ROCKETNOVA, content: texto_, chatMessageId: chatId }).catch(() => undefined)

  // Mestre: a publicação já saiu; uma falha aqui fica escrita e não parte o webhook.
  let mestre: string | null = null
  try {
    const m = await encaminharSinalParaMestre({ fonte: 'rocketnova', symbol: simbolo, direcao, entrada, sl, tps, externalRef: String(logId ?? '') })
    mestre = m.modo === 'desligado' ? null : m.modo
    if (m.motivo && logId) await supabase.from('tradingview_signals').update({ ai_error: `mestre rocketnova: ${m.motivo}`.slice(0, 300) }).eq('id', logId)
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('[rocketnova] mestre:', motivo)
    if (logId) await supabase.from('tradingview_signals').update({ ai_error: `mestre rocketnova: erro ao encaminhar: ${motivo}`.slice(0, 300) }).eq('id', logId)
  }
  return { ok: true, estrategia: ESTRATEGIA_ROCKETNOVA, simbolo, direcao, entrada, sl, tps, chatId, mestre }
}

async function processarSeguimento(payload: Json): Promise<{ ok: boolean; [k: string]: unknown }> {
  const supabase = getSupabaseAdmin()
  const tickerBruto = String(primeiro(payload, ['ticker', 'symbol']) ?? '')
  const simbolo = normalizeSymbol(tickerBruto.split(':').pop() ?? '')
  const acao = String(payload.action ?? payload.side ?? '').toLowerCase()
  const direcao = acao === 'buy' || acao === 'sell' ? acao : null
  const chave = chaveTradeRocketnova(simbolo, payload)
  const hits = Number(payload.hits) || 0
  const preco = arredondarRocketnova(numero(payload.price), simbolo)

  // A entrada desta trade: mesma estratégia, mesmo id da vela de sinal e mesmo par.
  type Entrada = { id: string; chat_message_id: string | null; price: number | null; sl: number | null; raw_payload: Json | null }
  let entrada: Entrada | null = null
  if (chave) {
    const { data } = await supabase
      .from('tradingview_signals')
      .select('id, chat_message_id, price, sl, raw_payload')
      .eq('estrategia', ESTRATEGIA_ROCKETNOVA)
      .eq('signal_kind', 'entry')
      .eq('chave_trade', chave)
      .order('received_at', { ascending: false })
      .limit(1)
    entrada = ((data?.[0] ?? null) as Entrada | null)
  }
  // O TP3 é o alvo final quando a entrada não trouxe TP4 (Show TP4 desligado no Pine).
  const comTp4 = numero(entrada?.raw_payload?.tp4) != null
  const ev = eventoRocketnova(String(payload.event ?? ''), hits, comTp4)

  const { data: log, error: erroLog } = await supabase
    .from('tradingview_signals')
    .insert({
      source: 'tradingview',
      ticker: simbolo || tickerBruto || null,
      timeframe: String(payload.timeframe ?? '') || null,
      action: direcao,
      price: preco,
      sl: arredondarRocketnova(numero(payload.sl), simbolo),
      alert_name: `${NOME_ROCKETNOVA} ${String(payload.event ?? '')}`.trim(),
      raw_payload: payload,
      estrategia: ESTRATEGIA_ROCKETNOVA,
      signal_kind: 'followup',
      chave_trade: chave,
      ligacao: !chave ? 'sem_chave' : entrada ? 'chave' : 'sem_entrada',
      ...(entrada ? { entrada_id: entrada.id } : {}),
    })
    .select('id')
    .single()
  if (erroLog) {
    console.error('[rocketnova] seguimento:', erroLog.message)
    return { ok: false, error: erroLog.message }
  }
  const logId = log?.id as string
  const marcar = async (campos: Record<string, unknown>) => {
    await supabase.from('tradingview_signals').update(campos).eq('id', logId)
  }

  if (!ev) {
    await marcar({ ai_error: `rocketnova: evento desconhecido «${String(payload.event ?? '')}»`, trade_status: 'filtered' })
    return { ok: true, skipped: 'evento desconhecido' }
  }
  if (!entrada?.chat_message_id) {
    await marcar({ ai_error: 'rocketnova: seguimento sem entrada publicada (id da vela não encontrado)', trade_status: 'filtered' })
    return { ok: true, skipped: 'sem entrada' }
  }

  const { text } = lifecycleMessage(ev.evento, {
    symbol: simbolo,
    direction: direcao as 'buy' | 'sell' | null,
    source: NOME_ROCKETNOVA,
    level: ev.nivel ?? null,
    price: ev.evento === 'discarded' ? null : preco,
    entry: entrada.price,
    slOriginal: numero(payload.sl_original) ?? entrada.sl,
  })
  const texto = formatarSeguimento(text, NOME_ROCKETNOVA)

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({
      channel_slug: CANAL_ROCKETNOVA,
      message_type: 'telegram_forward',
      content: texto,
      telegram_sender: REMETENTE,
      user_id: null,
      reply_to_id: entrada.chat_message_id,
    })
    .select('id')
    .single()
  if (error || !msg) {
    await marcar({ ai_error: `rocketnova: chat: ${error?.message ?? 'sem id'}`.slice(0, 300) })
    return { ok: true, skipped: 'chat' }
  }
  await marcar({ chat_status: 'sent', chat_message_id: msg.id, telegram_status: 'skipped', processed_at: new Date().toISOString() })
  await sendTelegramChannelPush({ slug: CANAL_ROCKETNOVA, content: texto, chatMessageId: msg.id as string }).catch(() => undefined)
  return { ok: true, estrategia: ESTRATEGIA_ROCKETNOVA, evento: ev.evento, nivel: ev.nivel ?? null, entrada: entrada.id, chatId: msg.id }
}
