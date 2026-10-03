import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('TRADINGVIEW_WEBHOOK_SECRET') ?? ''
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-4-8'
const CHAT_CHANNEL_SLUG = Deno.env.get('SENSEI_CHANNEL_SLUG') ?? 'sensei-scanner'
const CHAT_SENDER = Deno.env.get('SENSEI_CHAT_SENDER') ?? '🧠 Sensei Scanner'

/** Canal Sensei Scanner — relay activo por defeito quando há token do bot. */
const DEFAULT_RELAY_CHAT_ID = '-1003853860780'
const RELAY_CHAT_ID = (Deno.env.get('TRADINGVIEW_RELAY_CHAT_ID') ?? DEFAULT_RELAY_CHAT_ID).trim()
const AIBOT_TOKEN = (Deno.env.get('TELEGRAM_AIBOT_TOKEN') ?? '').trim()
const RELAY_DISABLED = (Deno.env.get('TRADINGVIEW_RELAY_ENABLED') ?? 'true').toLowerCase() === 'false'
const RELAY_ENABLED = !RELAY_DISABLED && Boolean(RELAY_CHAT_ID && AIBOT_TOKEN)

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k] ?? obj[k.toLowerCase()] ?? obj[k.toUpperCase()]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return null
}
function num(s: string | null): number | null {
  return s !== null && !isNaN(Number(s)) ? Number(s) : null
}

interface Verdict {
  valid: boolean
  confidence: string
  post: string
  reason: string
}

async function validateAndCompose(signal: Record<string, unknown>): Promise<Verdict> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
              post: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['valid', 'confidence', 'post', 'reason'],
            additionalProperties: false,
          },
        },
      },
      system:
        'És o Sensei Scanner AI da MoreThanMoney. Recebes um sinal do scanner Sensei (TradingView) em JSON. ' +
        'Valida a coerência do sinal (símbolo, direção, SL/TP plausíveis, risk/reward razoável). Devolve JSON: ' +
        'valid (deve ser publicado no chat?), confidence (alta|media|baixa), ' +
        'post (mensagem PRONTA para o chat #Sensei Scanner em português de Portugal: card claro com símbolo, ' +
        'direção, entrada se houver, Stoploss, Takeprofit, e uma nota curta de gestão/risco; emojis moderados; ' +
        'termina sempre com "⚠️ Não é aconselhamento financeiro."), reason (justificação curta da validação). ' +
        'Se o sinal for incoerente ou perigoso, valid=false e explica em reason.',
      messages: [{ role: 'user', content: 'Sinal do scanner Sensei:\n\n' + JSON.stringify(signal, null, 2) }],
    }),
  })
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const block = (data.content ?? []).find((b: { type: string }) => b.type === 'text')
  return JSON.parse(block?.text ?? '{}') as Verdict
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<number> {
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  const data = await resp.json()
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`)
  return data.result.message_id as number
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const url = new URL(req.url)
  const rawBody = await req.text()
  let payload: Record<string, unknown> = {}
  let isJson = false
  try {
    payload = JSON.parse(rawBody)
    isJson = true
  } catch {
    payload = { message: rawBody }
  }

  const provided =
    url.searchParams.get('secret') ??
    (typeof payload.secret === 'string' ? payload.secret : null) ??
    (typeof payload.passphrase === 'string' ? payload.passphrase : null)
  if (WEBHOOK_SECRET && provided !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (isJson) {
    delete payload.secret
    delete payload.passphrase
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const ticker = pick(payload, ['ticker', 'symbol', 'pair', 'instrument'])
  const exchange = pick(payload, ['exchange', 'broker'])
  const timeframe = pick(payload, ['timeframe', 'interval', 'tf', 'resolution'])
  const action = pick(payload, ['action', 'side', 'order_action', 'strategy_order_action', 'signal'])
  const price = num(pick(payload, ['price', 'close', 'order_price', 'strategy_order_price']))
  const sl = num(pick(payload, ['sl', 'stoploss', 'stop_loss', 'stop']))
  const tp = num(pick(payload, ['tp', 'takeprofit', 'take_profit', 'target', 'tp1']))
  const alertName = pick(payload, ['alert_name', 'alert', 'name', 'strategy'])
  const message = isJson ? pick(payload, ['message', 'comment', 'text']) : String(payload.message ?? '')

  const { data: row, error: insErr } = await supabase
    .from('tradingview_signals')
    .insert({
      ticker,
      exchange,
      timeframe,
      action,
      price,
      sl,
      tp,
      alert_name: alertName,
      message,
      raw_payload: payload,
      ai_status: 'pending',
    })
    .select('id')
    .single()
  if (insErr) {
    console.error('Insert error:', insErr)
    return new Response(JSON.stringify({ error: insErr.message }), { status: 500 })
  }

  if (!ANTHROPIC_API_KEY) {
    await supabase
      .from('tradingview_signals')
      .update({
        ai_status: 'error',
        ai_error: 'ANTHROPIC_API_KEY não configurada',
        chat_status: 'skipped',
        telegram_status: 'skipped',
        processed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    return new Response(JSON.stringify({ success: true, id: row.id, error: 'sem ANTHROPIC_API_KEY' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let verdict: Verdict
  try {
    verdict = await validateAndCompose(payload)
  } catch (err) {
    console.error('Claude error:', err)
    await supabase
      .from('tradingview_signals')
      .update({
        ai_status: 'error',
        ai_error: String(err),
        chat_status: 'skipped',
        telegram_status: 'skipped',
        processed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    return new Response(JSON.stringify({ success: true, id: row.id, error: 'falha IA' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await supabase
    .from('tradingview_signals')
    .update({
      ai_status: 'done',
      ai_model: ANTHROPIC_MODEL,
      ai_analysis: verdict.post,
      ai_error: verdict.valid ? null : `rejeitado: ${verdict.reason}`,
      processed_at: new Date().toISOString(),
    })
    .eq('id', row.id)

  if (!verdict.valid) {
    await supabase
      .from('tradingview_signals')
      .update({ chat_status: 'rejected', telegram_status: 'rejected' })
      .eq('id', row.id)
    return new Response(JSON.stringify({ success: true, id: row.id, valid: false, reason: verdict.reason }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Gate do chat/Telegram Sensei: só XAUUSD e BTCUSD vão para o chat #Sensei Scanner.
  // Os restantes ativos da watchlist ficam guardados em tradingview_signals e aparecem
  // apenas no sistema de Alertas MTM (site + app), não no chat Sensei.
  const normTicker = (ticker ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const CHAT_TICKERS = (Deno.env.get('SENSEI_CHAT_TICKERS') ?? 'XAUUSD,BTCUSD')
    .split(',')
    .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean)
  const allowChat = normTicker !== '' && CHAT_TICKERS.some((t) => normTicker.includes(t))

  if (!allowChat) {
    await supabase
      .from('tradingview_signals')
      .update({ chat_status: 'filtered', telegram_status: 'filtered' })
      .eq('id', row.id)
    return new Response(
      JSON.stringify({ success: true, id: row.id, valid: true, chat: false, telegram: false, filtered: true, ticker }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let chatOk = false
  try {
    const { data: msg, error: chatErr } = await supabase
      .from('chat_messages')
      .insert({
        channel_slug: CHAT_CHANNEL_SLUG,
        message_type: 'telegram_forward',
        content: verdict.post,
        telegram_sender: CHAT_SENDER,
        user_id: null,
      })
      .select('id')
      .single()
    if (chatErr) throw chatErr
    await supabase
      .from('tradingview_signals')
      .update({ chat_status: 'sent', chat_message_id: msg.id })
      .eq('id', row.id)
    chatOk = true
  } catch (err) {
    console.error('Chat insert error:', err)
    await supabase
      .from('tradingview_signals')
      .update({ chat_status: 'error', ai_error: 'chat: ' + String(err) })
      .eq('id', row.id)
  }

  let tgOk = false
  if (!RELAY_ENABLED) {
    const reason = !AIBOT_TOKEN
      ? 'TELEGRAM_AIBOT_TOKEN em falta'
      : !RELAY_CHAT_ID
        ? 'TRADINGVIEW_RELAY_CHAT_ID em falta'
        : 'relay desligado'
    await supabase
      .from('tradingview_signals')
      .update({ telegram_status: 'disabled', telegram_error: reason })
      .eq('id', row.id)
  } else {
    try {
      const mid = await sendTelegram(AIBOT_TOKEN, RELAY_CHAT_ID, verdict.post)
      await supabase
        .from('tradingview_signals')
        .update({
          telegram_status: 'sent',
          telegram_chat_id: RELAY_CHAT_ID,
          telegram_message_id: mid,
          relayed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      tgOk = true
    } catch (err) {
      console.error('Telegram error:', err)
      await supabase
        .from('tradingview_signals')
        .update({
          telegram_status: 'error',
          telegram_chat_id: RELAY_CHAT_ID,
          telegram_error: String(err),
        })
        .eq('id', row.id)
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      id: row.id,
      valid: true,
      confidence: verdict.confidence,
      chat: chatOk,
      telegram: tgOk,
      relay_chat_id: RELAY_CHAT_ID,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
